require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');

const { securityHeaders, corsPolicy } = require('./middleware/security.middleware');
const authRoutes = require('./routes/auth.routes');
const itemsRoutes = require('./routes/items.routes');
const wordsRoutes = require('./routes/words.routes');
const aiRoutes = require('./routes/ai.routes');

const app = express();

// Kolejność ma znaczenie: nagłówki bezpieczeństwa i CORS jako pierwsze,
// zanim jakikolwiek handler zdąży cokolwiek zwrócić.
app.use(securityHeaders());
app.use(corsPolicy());

app.use(express.static(path.join(__dirname, '..', '..')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', '..', 'index.html'));
});

app.set('trust proxy', 1)
app.use(cookieParser()); // wymagane, by czytać HttpOnly ciasteczko refresh tokenu
app.use(express.json({ limit: '15mb' })); // limit podniesiony ze względu na obrazy base64 (/api/scan-ai)

app.use('/api', authRoutes);        // /api/register, /api/login, /api/auth/refresh, /api/auth/logout
app.use('/api/items', itemsRoutes); // chronione JWT wewnątrz routera
app.use('/api/words', wordsRoutes); // chronione JWT + rate limit na /add
app.use('/api', aiRoutes);          // /api/scan-ai, chronione JWT

app.get('/api/health', (req, res) => res.json({ success: true, status: 'ok' }));

// 404 dla nieznanych tras API
app.use('/api', (req, res) => res.status(404).json({ success: false, message: 'Nie znaleziono endpointu.' }));

// Globalny handler błędów - NIE zwracamy stack trace/szczegółów wyjątku klientowi
// (wyciek wewnętrznych detali implementacji ułatwiłby atak), logujemy pełny błąd
// tylko po stronie serwera.
app.use((err, req, res, next) => {
  console.error('Nieobsłużony błąd:', err);
  res.status(500).json({ success: false, message: 'Wewnętrzny błąd serwera.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Fiszki backend (secure) nasłuchuje na porcie ${PORT}`);
});
