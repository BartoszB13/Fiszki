const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const prisma = require('../db');

const {
  ACCESS_TOKEN_SECRET,
  REFRESH_TOKEN_SECRET,
  ACCESS_TOKEN_TTL = '15m',
  REFRESH_TOKEN_TTL_DAYS = 30,
} = process.env;

// Fail-fast: bez tych sekretów aplikacja NIE POWINNA wystartować w ogóle
// (lepiej crash na starcie niż podpisywać tokeny słabym/domyślnym sekretem).
if (!ACCESS_TOKEN_SECRET || !REFRESH_TOKEN_SECRET) {
  throw new Error('Brak ACCESS_TOKEN_SECRET / REFRESH_TOKEN_SECRET w .env — przerywam start serwera.');
}
if (ACCESS_TOKEN_SECRET === REFRESH_TOKEN_SECRET) {
  // Różne sekrety => kompromitacja jednego tokenu nie pozwala podrobić drugiego.
  throw new Error('ACCESS_TOKEN_SECRET i REFRESH_TOKEN_SECRET muszą być różne.');
}

// ---------------------------------------------------------------------------
// ACCESS TOKEN (krótkożyjący, stateless, wysyłany w nagłówku Authorization)
// ---------------------------------------------------------------------------

/**
 * Podpisuje krótkotrwały access token. Payload celowo minimalny (sub, username)
 * - im mniej danych w JWT, tym mniej wycieka, jeśli token zostanie przechwycony
 * (JWT payload jest tylko zakodowany Base64, NIE jest szyfrowany).
 */
function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, username: user.username },
    ACCESS_TOKEN_SECRET,
    {
      expiresIn: ACCESS_TOKEN_TTL,
      algorithm: 'HS256', // jawnie wymuszamy algorytm — chroni przed atakiem "alg: none"
      issuer: 'fiszki.io',
    }
  );
}

/**
 * Weryfikuje podpis i datę ważności access tokenu. jwt.verify rzuca wyjątek
 * przy nieprawidłowym podpisie, wygasłym tokenie lub złym algorytmie —
 * middleware łapie ten wyjątek i zwraca 401 (patrz auth.middleware.js).
 */
function verifyAccessToken(token) {
  return jwt.verify(token, ACCESS_TOKEN_SECRET, {
    algorithms: ['HS256'], // NIE ufamy algorytmowi z nagłówka tokenu — wymuszamy własny
    issuer: 'fiszki.io',
  });
}

// ---------------------------------------------------------------------------
// REFRESH TOKEN (długożyjący, opaque, stateful w DB, w ciasteczku HttpOnly)
// ---------------------------------------------------------------------------

/**
 * Generujemy losowy, nieprzewidywalny token (nie JWT) — 512 bitów entropii.
 * Opaque token = atakujący nie może nic o nim "odczytać" ani sfałszować offline,
 * bo jego jedyna wartość to dopasowanie do hasha w bazie.
 */
function generateOpaqueToken() {
  return crypto.randomBytes(64).toString('hex');
}

/** Refresh token trzymamy w DB wyłącznie jako hash SHA-256 (nigdy plaintext). */
function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Wystawia nowy refresh token dla użytkownika i zapisuje jego HASH w bazie.
 * Zwraca RAW token — trafia tylko do ciasteczka, nigdy do logów/bazy.
 */
async function issueRefreshToken(userId, ip) {
  const rawToken = generateOpaqueToken();
  const expiresAt = new Date(Date.now() + Number(REFRESH_TOKEN_TTL_DAYS) * 24 * 60 * 60 * 1000);

  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashToken(rawToken),
      expiresAt,
      createdByIp: ip,
    },
  });

  return rawToken;
}

/**
 * Weryfikuje i ROTUJE refresh token (rotation-on-use).
 * - Jeśli token nieznany/wygasł -> odrzucamy.
 * - Jeśli token JEST znany, ale już oznaczony jako `revoked` -> to oznacza,
 *   że ktoś próbuje użyć tokenu, który już raz posłużył do odświeżenia.
 *   To silny sygnał kradzieży tokenu (np. skopiowany przez XSS/malware) —
 *   w reakcji unieważniamy WSZYSTKIE tokeny tego użytkownika (wylogowanie
 *   wszędzie), żeby uciąć dostęp złodziejowi.
 * - W przeciwnym razie: oznaczamy stary token jako zużyty i wystawiamy nowy
 *   (rotacja), łańcuch powiązany przez replacedByTokenHash dla audytu.
 */
async function rotateRefreshToken(rawToken, ip) {
  const tokenHash = hashToken(rawToken);
  const existing = await prisma.refreshToken.findUnique({ where: { tokenHash } });

  if (!existing) {
    return { error: 'INVALID' };
  }

  if (existing.revoked) {
    // Token reuse detection -> reakcja na potencjalną kradzież tokenu.
    await prisma.refreshToken.updateMany({
      where: { userId: existing.userId, revoked: false },
      data: { revoked: true },
    });
    return { error: 'REUSE_DETECTED', userId: existing.userId };
  }

  if (existing.expiresAt < new Date()) {
    return { error: 'EXPIRED' };
  }

  const newRawToken = generateOpaqueToken();
  const newExpiresAt = new Date(Date.now() + Number(REFRESH_TOKEN_TTL_DAYS) * 24 * 60 * 60 * 1000);

  await prisma.$transaction([
    prisma.refreshToken.update({
      where: { tokenHash },
      data: { revoked: true, replacedByTokenHash: hashToken(newRawToken) },
    }),
    prisma.refreshToken.create({
      data: {
        userId: existing.userId,
        tokenHash: hashToken(newRawToken),
        expiresAt: newExpiresAt,
        createdByIp: ip,
      },
    }),
  ]);

  return { rawToken: newRawToken, userId: existing.userId };
}

/** Wywoływane przy logout — unieważnia konkretny refresh token. */
async function revokeRefreshToken(rawToken) {
  const tokenHash = hashToken(rawToken);
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revoked: false },
    data: { revoked: true },
  });
}

/** Wywoływane po wykryciu reuse lub np. "wyloguj wszystkie urządzenia". */
async function revokeAllUserTokens(userId) {
  await prisma.refreshToken.updateMany({
    where: { userId, revoked: false },
    data: { revoked: true },
  });
}

module.exports = {
  signAccessToken,
  verifyAccessToken,
  issueRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllUserTokens,
};
