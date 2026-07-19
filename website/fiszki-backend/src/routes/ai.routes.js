const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { authenticate } = require('../middleware/auth.middleware');

const router = express.Router();

router.use(authenticate);

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Jedyne 4 języki OBCE wspierane w aplikacji (musi być zgodne z opcjami
// <select id="foreign-lang"> w import.html). Polski nie jest tu wymieniony
// celowo — to zawsze język DOCELOWY, nigdy wybierany przez użytkownika.
// Whitelist zamiast przyjmowania dowolnego stringa od klienta — foreignLang
// trafia bezpośrednio do promptu wysyłanego do Gemini, więc walidacja
// tutaj to obrona przed prompt injection przez to pole.
const SUPPORTED_FOREIGN_LANGS = {
  en: 'angielskim',
  de: 'niemieckim',
  es: 'hiszpańskim',
  it: 'włoskim',
};

/**
 * Prompt zawsze wymusza kierunek: słowo obce -> "base", polskie
 * tłumaczenie -> "translation". To ten sam inwariant, który obowiązuje
 * przy ręcznym dodawaniu słówek (import.js), więc dane z obu ścieżek
 * (AI scan i quick-add) są spójne i nauka.js wyświetla je identycznie.
 */
function buildPrompt(foreignLangCode) {
  const foreignLangName = SUPPORTED_FOREIGN_LANGS[foreignLangCode];

  return `Jesteś ekspertem językowym i OCR. Przeanalizuj to zdjęcie strony z podręcznika i wyciągnij z niego listę słówek. Zignoruj sposób wymowy (w ukośnikach np. /sʌmθɪŋ/), nawiasy z częściami mowy (np. (v), (n), (adj)), numery stron i polecenia do zadań. Wyciągnij słowo w języku ${foreignLangName} (pole "base") oraz jego polskie tłumaczenie (pole "translation"). Jeśli na zdjęciu występują inne języki niż ${foreignLangName} i polski, pomiń je.`;
}

/**
 * POST /api/scan-ai
 * body: { image, foreignLang }
 */
router.post('/scan-ai', async (req, res) => {
  try {
    const { image, foreignLang } = req.body;

    if (!image) {
      return res.status(400).json({ success: false, message: 'Brak obrazu.' });
    }

    if (!SUPPORTED_FOREIGN_LANGS[foreignLang]) {
      return res.status(400).json({ success: false, message: 'Nieobsługiwany język obcy.' });
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
      { text: buildPrompt(foreignLang) },
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