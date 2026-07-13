const rateLimit = require('express-rate-limit');

/**
 * Uwaga produkcyjna: domyślny MemoryStore trzyma liczniki w RAM pojedynczego
 * procesu. Przy wielu instancjach/load-balancerze podmień na RedisStore
 * (pakiet rate-limit-redis) — inaczej limity liczą się osobno per instancja.
 */

/**
 * Login: łączymy IP + podaną nazwę użytkownika w kluczu, żeby:
 * - nie zablokować całego biura/NAT-u za jednego atakującego (tylko IP),
 * - ale też nie pozwolić atakującemu obejść limitu, próbując tego samego
 *   loginu z wielu IP w nieskończoność bez żadnego spowolnienia per-IP.
 * Limit celowo asymetryczny: mało prób, długie okno -> brute force nieopłacalny,
 * a normalny user, który się pomylił 2-3 razy, prawie nigdy tego nie odczuje.
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minut
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${req.ip}:${(req.body?.username || '').toLowerCase()}`,
  message: { success: false, message: 'Zbyt wiele prób logowania. Spróbuj ponownie później.' },
});

/** Refresh: limit per-IP, chroni endpoint przed masowym odpytywaniem/DoS. */
const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Zbyt wiele żądań odświeżenia tokenu.' },
});

/**
 * Tworzenie fiszek: limit per-USER (nie per-IP!), bo to autoryzowany endpoint —
 * chcemy ograniczyć konkretne konto przed zalaniem bazy danymi, niezależnie
 * od tego, z ilu adresów IP korzysta (np. sieć komórkowa, VPN).
 * X = 60/min zgodnie z ustaleniami.
 */
const createFlashcardLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuta
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `flashcard-create:${req.user?.id ?? req.ip}`,
  message: { success: false, message: 'Zbyt wiele fiszek utworzonych w krótkim czasie. Zwolnij tempo.' },
});

module.exports = { loginLimiter, refreshLimiter, createFlashcardLimiter };
