// website/fiszki-backend/src/utils/mailer.js
//
// Wysyłka e-maili przez Gmail API (REST) — token dostępu odświeżany za
// każdym razem z długożyjącego refresh tokenu OAuth2. Bez zależności od
// nodemailer/googleapis: tylko natywny fetch (wymaga Node >=18, co i tak
// jest już wymagane przez @google/generative-ai w package.json).

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const SEND_ENDPOINT = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';

const {
  GMAIL_CLIENT_ID,
  GMAIL_CLIENT_SECRET,
  GMAIL_REFRESH_TOKEN,
  GMAIL_SENDER_EMAIL,
} = process.env;

// Fail-fast, tak samo jak przy ACCESS_TOKEN_SECRET w tokens.js — lepiej
// crash na starcie niż cichy błąd przy pierwszej próbie wysyłki maila.
if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET || !GMAIL_REFRESH_TOKEN || !GMAIL_SENDER_EMAIL) {
  throw new Error('Brak zmiennych GMAIL_* w .env — mailer nie może wystartować.');
}

/**
 * Usuwa znaki CR/LF z wartości wstawianych do nagłówków MIME (To, Subject).
 * Bez tego user mógłby przy rejestracji wpisać e-mail typu
 * "a@a.com\r\nBcc: attacker@evil.com" i wstrzyknąć dodatkowe nagłówki
 * (klasyczny "email header injection") — email zawsze pochodzi od usera,
 * więc traktujemy go jak dowolne inne niezaufane wejście.
 */
function sanitizeHeaderValue(value) {
  return String(value).replace(/[\r\n]+/g, '');
}

/**
 * Wymienia refresh token na krótkotrwały access token. Wywoływane przy
 * KAŻDYM mailu — przy niskim wolumenie (kody OTP) nie opłaca się cache'ować
 * tokenu kosztem dodatkowej złożoności/ryzyka użycia wygasłego tokenu.
 */
async function getAccessToken() {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GMAIL_CLIENT_ID,
      client_secret: GMAIL_CLIENT_SECRET,
      refresh_token: GMAIL_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Nie udało się odświeżyć tokenu Gmail: ${res.status} ${errText}`);
  }

  const data = await res.json();
  return data.access_token;
}

/** Base64url wymagany przez pole `raw` Gmail API — standardowy base64 z
 *  podmianą +/ na -_ i bez paddingu. */
function toBase64Url(str) {
  return Buffer.from(str, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** Buduje surowy e-mail MIME (RFC 2822) jako pojedynczy string. */
function buildMimeMessage({ to, subject, html }) {
  const headers = [
    `From: Fiszki.io <${GMAIL_SENDER_EMAIL}>`,
    `To: ${sanitizeHeaderValue(to)}`,
    `Subject: ${sanitizeHeaderValue(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
  ];

  return `${headers.join('\r\n')}\r\n\r\n${html}`;
}

/** Wysyła zbudowaną wiadomość przez Gmail API messages.send. */
async function sendGmailMessage({ to, subject, html }) {
  const accessToken = await getAccessToken();
  const rawMime = buildMimeMessage({ to, subject, html });

  const res = await fetch(SEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw: toBase64Url(rawMime) }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gmail API zwróciło błąd: ${res.status} ${errText}`);
  }

  return res.json();
}

/**
 * Publiczna funkcja używana przez auth.routes.js — sygnatura NIEZMIENIONA
 * względem starej wersji (userEmail, verificationCode), więc żadne wywołanie
 * w auth.routes.js nie wymaga edycji.
 */
async function sendVerificationEmail(userEmail, verificationCode) {
  const html = `
    <div style="font-family: sans-serif; max-width: 480px;">
      <h2 style="color:#4A90E2;">Fiszki.io</h2>
      <p>Twój kod weryfikacyjny:</p>
      <p style="font-size:28px; font-weight:bold; letter-spacing:4px;">${verificationCode}</p>
      <p style="color:#888; font-size:13px;">Kod wygaśnie za 10 minut. Jeśli to nie Ty, zignoruj tę wiadomość.</p>
    </div>
  `;

  return sendGmailMessage({
    to: userEmail,
    subject: 'Twoj kod weryfikacyjny Fiszki.io',
    html,
  });
}

module.exports = { sendVerificationEmail };