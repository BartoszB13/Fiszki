const express = require('express');
const bcrypt = require('bcrypt');
const prisma = require('../db');
const { loginLimiter, refreshLimiter } = require('../middleware/rateLimit.middleware');
const { setRefreshCookie, clearRefreshCookie, REFRESH_COOKIE_NAME } = require('../utils/cookies');
const {
  signAccessToken,
  issueRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
} = require('../utils/tokens');

const router = express.Router();
const SALT_ROUNDS = 12;

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

/**
 * POST /api/register
 * (bez zmian funkcjonalnych względem poprzedniej wersji — bcrypt + unikalność)
 */
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ success: false, message: 'Brakujące dane w żądaniu.' });
    }
    if (String(password).length < 8) {
      return res.status(400).json({ success: false, message: 'Hasło musi mieć min. 8 znaków.' });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const user = await prisma.user.create({
      data: { username: username.trim(), email: email.trim(), passwordHash },
    });

    return res.status(201).json({ success: true, userId: user.id });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ success: false, message: 'Ten login lub e-mail jest już zarejestrowany.' });
    }
    console.error('Błąd rejestracji:', err);
    return res.status(500).json({ success: false, message: 'Błąd zapisu w bazie danych.' });
  }
});

/**
 * POST /api/login
 * Chroniony loginLimiterem (rate limit) + blokadą konta w DB (przetrwa restart
 * serwera i wiele adresów IP, w przeciwieństwie do samego rate-limitera).
 */
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Puste dane logowania.' });
    }

    const login = username.trim();
    const user = await prisma.user.findFirst({
      where: { OR: [{ username: login }, { email: login }] },
    });

    // Celowo IDENTYCZNY komunikat dla "brak użytkownika" i "złe hasło" (poniżej)
    // - nie ujawniamy atakującemu, czy dany login w ogóle istnieje (user enumeration).
    const genericError = { success: false, message: 'Nieprawidłowy login lub hasło.' };

    if (!user) {
      return res.status(401).json(genericError);
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutesLeft = Math.ceil((user.lockedUntil - new Date()) / 60000);
      return res.status(423).json({
        success: false,
        message: `Konto tymczasowo zablokowane. Spróbuj ponownie za ${minutesLeft} min.`,
      });
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);

    if (!passwordMatches) {
      const attempts = user.failedLoginAttempts + 1;
      const shouldLock = attempts >= MAX_FAILED_ATTEMPTS;

      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: shouldLock ? 0 : attempts,
          lockedUntil: shouldLock ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000) : null,
        },
      });

      return res.status(401).json(genericError);
    }

    // Udane logowanie -> reset licznika prób.
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });

    const accessToken = signAccessToken(user);
    const refreshToken = await issueRefreshToken(user.id, req.ip);
    setRefreshCookie(res, refreshToken);

    // Access token wraca w JSON body -> frontend trzyma go W PAMIĘCI JS
    // (zmienna, nie localStorage!). Refresh token NIGDY nie trafia do JS,
    // tylko do HttpOnly ciasteczka ustawionego powyżej.
    return res.json({
      success: true,
      userId: user.id,
      username: user.username,
      accessToken,
    });
  } catch (err) {
    console.error('Błąd logowania:', err);
    return res.status(500).json({ success: false, message: 'Błąd zapytania do bazy danych.' });
  }
});

/**
 * POST /api/auth/refresh
 * Czyta refresh token WYŁĄCZNIE z HttpOnly ciasteczka (nigdy z body/query —
 * to zapobiega przypadkowemu logowaniu go po stronie klienta/serwera).
 */
router.post('/auth/refresh', refreshLimiter, async (req, res) => {
  const rawToken = req.cookies?.[REFRESH_COOKIE_NAME];
  if (!rawToken) {
    return res.status(401).json({ success: false, message: 'Brak tokenu odświeżającego.' });
  }

  const result = await rotateRefreshToken(rawToken, req.ip);

  if (result.error === 'REUSE_DETECTED') {
    // Wykryto ponowne użycie unieważnionego tokenu -> wszystkie sesje usera
    // zostały już zerwane wewnątrz rotateRefreshToken. Czyścimy ciasteczko
    // i traktujemy to jak każdy inny brak autoryzacji (nie ujawniamy detali ataku).
    clearRefreshCookie(res);
    return res.status(401).json({ success: false, message: 'Sesja nieprawidłowa. Zaloguj się ponownie.' });
  }
  if (result.error) {
    clearRefreshCookie(res);
    return res.status(401).json({ success: false, message: 'Sesja wygasła. Zaloguj się ponownie.' });
  }

  const user = await prisma.user.findUnique({ where: { id: result.userId } });
  if (!user) {
    clearRefreshCookie(res);
    return res.status(401).json({ success: false, message: 'Użytkownik nie istnieje.' });
  }

  setRefreshCookie(res, result.rawToken); // rotacja: nowy token nadpisuje stary w ciasteczku
  const accessToken = signAccessToken(user);

  return res.json({ success: true, accessToken });
});

/**
 * POST /api/auth/logout
 * Unieważnia refresh token w DB i czyści ciasteczko. Access token wygasa
 * naturalnie w ciągu max. 15 minut (stateless — nie da się go "unieważnić"
 * wcześniej bez dodatkowej blacklisty, co jest świadomym kompromisem).
 */
router.post('/auth/logout', async (req, res) => {
  const rawToken = req.cookies?.[REFRESH_COOKIE_NAME];
  if (rawToken) {
    await revokeRefreshToken(rawToken);
  }
  clearRefreshCookie(res);
  return res.json({ success: true });
});

module.exports = router;
