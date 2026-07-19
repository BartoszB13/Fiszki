const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { authenticate } = require('../middleware/auth.middleware');

const router = express.Router();

router.use(authenticate);

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Jedyne 5 języków wspieranych w całej aplikacji (musi być zgodne z opcjami
// <select id="source-lang">/<select id="target-lang"> w import.html).
// Whitelist zamiast przyjmowania dowolnego stringa od klienta — sourceLang/
// targetLang trafiają bezpośrednio do promptu wysyłanego do Gemini, więc
// walidacja tutaj to obrona przed prompt injection przez te dwa pola.
const SUPPORTED_LANGS = {
  pl: 'polskim',
  en: 'angielskim',
  de: 'niemieckim',
  es: 'hiszpańskim',
  it: 'włoskim',
};

function buildPrompt(sourceLangCode, targetLangCode) {
  const sourceLangName = SUPPORTED_LANGS[sourceLangCode];
  const targetLangName = SUPPORTED_LANGS[targetLangCode];

  return `Jesteś ekspertem językowym i OCR. Przeanalizuj to zdjęcie strony z podręcznika i wyciągnij z niego listę słówek. Zignoruj sposób wymowy (w ukośnikach np. /sʌmθɪŋ/), nawiasy z częściami mowy (np. (v), (n), (adj)), numery stron i polecenia do zadań. Wyciągnij słówko w języku ${sourceLangName} (pole "base") oraz jego tłumaczenie w języku ${targetLangName} (pole "translation"). Jeśli na zdjęciu występują inne języki niż te dwa, pomiń je.`;
}

/**
 * POST /api/scan-ai
 * body: { image, sourceLang, targetLang }
 */
router.post('/scan-ai', async (req, res) => {
  try {
    const { image, sourceLang, targetLang } = req.body;

    if (!image) {
      return res.status(400).json({ success: false, message: 'Brak obrazu.' });
    }

    if (!SUPPORTED_LANGS[sourceLang] || !SUPPORTED_LANGS[targetLang]) {
      return res.status(400).json({ success: false, message: 'Nieobsługiwana para językowa.' });
    }
    if (sourceLang === targetLang) {
      return res.status(400).json({ success: false, message: 'Język źródłowy i docelowy muszą się różnić.' });
    }

    const match = image.match(/^data:(image\/\w+);base64,(.+)$/);
    const mimeType = match ? match[1] : 'image/jpeg';
    const rawBase64 = match ? match[2] : image;

    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              base: { type: 'string' },
              translation: { type: 'string' },
            },
            required: ['base', 'translation'],
          },
        },
      },
    });

    const result = await model.generateContent([
      { text: buildPrompt(sourceLang, targetLang) },
      { inlineData: { mimeType, data: rawBase64 } },
    ]);

    const text = result.response.text();
    const words = JSON.parse(text);

    return res.json({ success: true, words });
  } catch (err) {
    console.error('Błąd skanowania Gemini:', err);
    return res.status(500).json({ success: false, message: 'Błąd komunikacji z API Gemini.' });
  }
});

module.exports = router;