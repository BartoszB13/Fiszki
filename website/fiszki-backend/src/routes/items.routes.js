const express = require('express');
const prisma = require('../db');
const { authenticate } = require('../middleware/auth.middleware');

const router = express.Router();

// Wszystkie endpointy w tym routerze wymagają ważnego access tokenu.
router.use(authenticate);

function toIntOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
}
/**
 * Sprawdza, czy `potentialAncestorId` znajduje się wewnątrz poddrzewa
 * `itemId` (czyli czy jest jego potomkiem). Używane przy przenoszeniu
 * folderu — bez tego dałoby się przenieść folder do jego własnego
 * podfolderu, co złamałoby strukturę drzewa (i mogłoby dać nieskończoną
 * pętlę przy nawigacji/kasowaniu kaskadowym).
 */
async function isDescendant(userId, itemId, potentialAncestorId) {
  let currentId = potentialAncestorId;
  while (currentId !== null) {
    if (currentId === itemId) return true;
    const node = await prisma.item.findFirst({
      where: { id: currentId, userId },
      select: { parentId: true },
    });
    if (!node) break;
    currentId = node.parentId;
  }
  return false;
}

/**
 * POST /api/items/get
 * body: { parentId }
 * userId NIE jest już przyjmowany z body — bierzemy go wyłącznie z req.user.id
 * (ustawionego przez middleware `authenticate` na podstawie podpisanego tokenu).
 * To eliminuje IDOR: klient nie może podać cudzego userId, żeby zobaczyć
 * czyjeś foldery/talie.
 */
router.post('/get', async (req, res) => {
  try {
    const userId = Number(req.user.id);
    const parentId = toIntOrNull(req.body.parentId);

    const items = await prisma.item.findMany({
      where: { userId, parentId },
      orderBy: [{ type: 'desc' }, { createdAt: 'asc' }],
      select: { id: true, type: true, name: true, createdAt: true },
    });

    return res.json({ success: true, items });
  } catch (err) {
    console.error('Błąd pobierania elementów:', err);
    return res.status(500).json({ success: false, message: 'Błąd zapytania do bazy danych.' });
  }
});

/**
 * POST /api/items/add
 * body: { type, name, parentId }
 */
router.post('/add', async (req, res) => {
  try {
    const userId = Number(req.user.id);
    const { type, name } = req.body;

    if (!type || !name || !String(name).trim()) {
      return res.status(400).json({ success: false, message: 'Brakujące dane.' });
    }
    if (!['folder', 'deck'].includes(type)) {
      return res.status(400).json({ success: false, message: 'Nieprawidłowy typ elementu.' });
    }
    // Prosty, ale ważny limit anty-DoS na długość nazwy folderu/talii.
    if (String(name).trim().length > 100) {
      return res.status(400).json({ success: false, message: 'Nazwa może mieć maksymalnie 100 znaków.' });
    }

    const parentId = toIntOrNull(req.body.parentId);

    // Jeśli podano parentId, weryfikujemy, że ten folder NALEŻY do zalogowanego
    // użytkownika — inaczej ktoś mógłby "podpiąć" swoją talię pod cudzy folder.
    if (parentId !== null) {
      const parent = await prisma.item.findFirst({ where: { id: parentId, userId } });
      if (!parent) {
        return res.status(403).json({ success: false, message: 'Brak dostępu do wskazanego folderu.' });
      }
    }

    const item = await prisma.item.create({
      data: { userId, type, name: String(name).trim(), parentId },
    });

    return res.status(201).json({ success: true, id: item.id });
  } catch (err) {
    console.error('Błąd tworzenia elementu:', err);
    return res.status(500).json({ success: false, message: 'Błąd zapisu w bazie danych.' });
  }
});

/**
 * POST /api/items/delete
 * body: { itemId }
 */
router.post('/delete', async (req, res) => {
  try {
    const userId = Number(req.user.id);
    const itemId = toIntOrNull(req.body.itemId);

    if (itemId === null) {
      return res.status(400).json({ success: false, message: 'Brakujące dane.' });
    }

    // deleteMany z filtrem po userId = atomowa, bezpieczna operacja "usuń TYLKO
    // jeśli to moje" — bez osobnego SELECT-a przed DELETE (unika TOCTOU).
    const result = await prisma.item.deleteMany({ where: { id: itemId, userId } });

    if (result.count === 0) {
      return res.status(404).json({ success: false, message: 'Element nie istnieje lub brak uprawnień.' });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('Błąd usuwania elementu:', err);
    return res.status(500).json({ success: false, message: 'Błąd zapytania do bazy danych.' });
  }
});

/**
 * POST /api/items/move
 * body: { itemId, targetFolderId }  — targetFolderId = null oznacza katalog główny
 *
 * Włączane przez "przytrzymaj i przeciągnij" na Tworzenie.html.
 */
router.post('/move', async (req, res) => {
  try {
    const userId = Number(req.user.id);
    const itemId = toIntOrNull(req.body.itemId);
    const targetFolderId = toIntOrNull(req.body.targetFolderId);

    if (itemId === null) {
      return res.status(400).json({ success: false, message: 'Brakujące dane.' });
    }

    // Własność przenoszonego elementu — bez tego user mógłby przenosić cudze zasoby (IDOR).
    const item = await prisma.item.findFirst({ where: { id: itemId, userId } });
    if (!item) {
      return res.status(404).json({ success: false, message: 'Element nie istnieje.' });
    }

    if (targetFolderId !== null) {
      if (targetFolderId === itemId) {
        return res.status(400).json({ success: false, message: 'Nie można przenieść elementu do samego siebie.' });
      }

      const targetFolder = await prisma.item.findFirst({
        where: { id: targetFolderId, userId, type: 'folder' },
      });
      if (!targetFolder) {
        return res.status(404).json({ success: false, message: 'Folder docelowy nie istnieje.' });
      }

      if (item.type === 'folder') {
        const wouldCreateCycle = await isDescendant(userId, itemId, targetFolderId);
        if (wouldCreateCycle) {
          return res.status(400).json({ success: false, message: 'Nie można przenieść folderu do jego własnego podfolderu.' });
        }
      }
    }

    if (item.parentId === targetFolderId) {
      return res.json({ success: true }); // już tam jest — nic do zrobienia
    }

    await prisma.item.update({ where: { id: itemId }, data: { parentId: targetFolderId } });
    return res.json({ success: true });
  } catch (err) {
    console.error('Błąd przenoszenia elementu:', err);
    return res.status(500).json({ success: false, message: 'Błąd zapisu w bazie danych.' });
  }
});


module.exports = router;
