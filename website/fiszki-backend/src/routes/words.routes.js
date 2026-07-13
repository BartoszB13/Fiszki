const express = require('express');
const prisma = require('../db');
const { authenticate } = require('../middleware/auth.middleware');
const { createFlashcardLimiter } = require('../middleware/rateLimit.middleware');
const { validateFlashcardInput } = require('../validators/flashcard.validator');

const router = express.Router();

// Każdy endpoint poniżej wymaga ważnego access tokenu.
router.use(authenticate);

function toIntOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
}

/**
 * Wspólna funkcja: sprawdza, że talia (deckId) istnieje, jest typu "deck"
 * i NALEŻY do zalogowanego użytkownika. Bez tego dowolny zalogowany user
 * mógłby dopisywać fiszki do cudzej talii, znając tylko jej numeryczne ID
 * (IDOR / broken access control — jedno z najpoważniejszych ryzyk w OWASP Top 10).
 */
async function assertOwnsDeck(userId, deckId) {
  const deck = await prisma.item.findFirst({
    where: { id: deckId, userId, type: 'deck' },
    select: { id: true },
  });
  return Boolean(deck);
}

/**
 * POST /api/words/get
 * body: { deckId }
 */
router.post('/get', async (req, res) => {
  try {
    const userId = Number(req.user.id);
    const deckId = toIntOrNull(req.body.deckId);
    if (deckId === null) {
      return res.status(400).json({ success: false, message: 'Brak ID talii.' });
    }

    const ownsDeck = await assertOwnsDeck(userId, deckId);
    if (!ownsDeck) {
      // 404 zamiast 403: nie potwierdzamy nawet, że talia o tym ID w ogóle
      // istnieje (unikamy wycieku informacji o cudzych zasobach).
      return res.status(404).json({ success: false, message: 'Talia nie istnieje.' });
    }

    const rows = await prisma.word.findMany({
      where: { deckId },
      orderBy: { id: 'asc' },
      select: { id: true, baseWord: true, translation: true },
    });

    const words = rows.map((w) => ({ id: w.id, base: w.baseWord, translation: w.translation }));
    return res.json({ success: true, words });
  } catch (err) {
    console.error('Błąd pobierania słówek:', err);
    return res.status(500).json({ success: false, message: 'Błąd zapytania do bazy danych.' });
  }
});

/**
 * POST /api/words/add  — GŁÓWNY, CHRONIONY ENDPOINT TWORZENIA FISZKI
 * body: { deck_id, base_word, translation }
 *
 * Kolejność middleware/kroków ma znaczenie i jest świadoma:
 *   1. authenticate           -> odrzuć, jeśli nie ma ważnego tokenu (tanie, szybkie)
 *   2. createFlashcardLimiter -> odrzuć spam PRZED dotknięciem bazy danych
 *   3. walidacja + sanityzacja danych wejściowych
 *   4. weryfikacja własności zasobu (deckId należy do usera)
 *   5. dopiero na końcu: zapis do bazy przez sparametryzowane zapytanie Prisma
 */
router.post('/add', createFlashcardLimiter, async (req, res) => {
  try {
    const userId = Number(req.user.id);

    // --- Walidacja i sanityzacja (limity znaków, strip HTML) ---
    const validation = validateFlashcardInput({
      deckId: req.body.deck_id,
      term: req.body.base_word,
      definition: req.body.translation,
    });

    if (!validation.success) {
      return res.status(400).json({ success: false, message: validation.message });
    }

    const { deckId, term, definition } = validation.data;

    // --- Kontrola dostępu (IDOR) ---
    const ownsDeck = await assertOwnsDeck(userId, deckId);
    if (!ownsDeck) {
      return res.status(404).json({ success: false, message: 'Talia nie istnieje.' });
    }

    // --- Zapis: Prisma generuje zapytanie parametryzowane -> SQL injection
    // jest strukturalnie niemożliwe (dane nigdy nie są sklejane do stringa SQL). ---
    const word = await prisma.word.create({
      data: { deckId, baseWord: term, translation: definition },
    });

    return res.status(201).json({
      success: true,
      id: word.id,
      message: 'Słówko zostało pomyślnie zapisane.',
    });
  } catch (err) {
    console.error('Błąd zapisu słówka:', err);
    return res.status(500).json({ success: false, message: 'Błąd zapisu w bazie danych.' });
  }
});

/**
 * POST /api/words/delete
 * body: { wordId }
 */
router.post('/delete', async (req, res) => {
  try {
    const userId = Number(req.user.id);
    const wordId = toIntOrNull(req.body.wordId);
    if (wordId === null) {
      return res.status(400).json({ success: false, message: 'Brakujące dane.' });
    }

    // Usuwamy TYLKO jeśli słówko należy do talii, która należy do tego usera
    // - jedno zapytanie, sprawdzenie własności "przez relację", bez wcześniejszego SELECT-a.
    const result = await prisma.word.deleteMany({
      where: { id: wordId, deck: { userId } },
    });

    if (result.count === 0) {
      return res.status(404).json({ success: false, message: 'Słówko nie istnieje lub brak uprawnień.' });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('Błąd usuwania słówka:', err);
    return res.status(500).json({ success: false, message: 'Błąd zapytania do bazy danych.' });
  }
});

module.exports = router;
