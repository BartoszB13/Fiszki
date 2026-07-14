const helmet = require('helmet');
const cors = require('cors');

/**
 * Helmet ustawia zestaw bezpiecznych nagłówków HTTP domyślnie (X-Content-Type-Options,
 * X-Frame-Options / frame-ancestors, Strict-Transport-Security, wyłącza X-Powered-By
 * ujawniające stack technologiczny, itd.). To tania, szerokopasmowa ochrona.
 */
function securityHeaders() {
  return helmet({
    // CSP dopięta pod czyste API (nie serwujemy tu HTML) - blokuje domyślnie
    // wszystko, co nie jest jawnie dozwolone; ogranicza skutki ew. XSS
    // gdyby jakaś odpowiedź JSON została błędnie zinterpretowana jako HTML.
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        scriptSrcAttr: ["'none'"], // keep blocking inline event handlers
        styleSrc: ["'self'", "'unsafe-inline'"], // adjust if you have external stylesheets only
        imgSrc: ["'self'", "data:"], // 'data:' needed if you display base64 images (e.g. OCR upload preview)
        connectSrc: ["'self'","https://api.mymemory.translated.net"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"], // dodatkowa ochrona anty-clickjacking
      },
    },
    crossOriginResourcePolicy: { policy: 'same-site' },
  });
}

/**
 * CORS: allowlist DOKŁADNIE jednego originu (Twojego frontendu) zamiast '*'.
 * `credentials: true` jest wymagane, żeby przeglądarka w ogóle wysyłała/przyjmowała
 * ciasteczko refresh tokenu w żądaniach cross-origin do backendu — ale w połączeniu
 * z konkretnym originem (nie wildcardem — przeglądarki i tak zabraniają '*' + credentials)
 * to właśnie domyka ochronę CSRF razem z SameSite=Strict: nawet gdyby SameSite
 * kiedyś zawiódł, żadna inna domena nie dostanie odpowiedzi z danymi.
 */
function corsPolicy() {
  const allowedOrigin = process.env.FRONTEND_ORIGIN;

  if (!allowedOrigin) {
    throw new Error('FRONTEND_ORIGIN musi być ustawiony w .env — CORS nie może działać na wildcard.');
  }

  return cors({
    origin: allowedOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 600,
  });
}

module.exports = { securityHeaders, corsPolicy };
