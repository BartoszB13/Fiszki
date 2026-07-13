const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { authenticate } = require('../middleware/auth.middleware');

const router = express.Router();

// Wywołania Gemini kosztują pieniądze i czas — endpoint musi być za autoryzacją,
// inaczej dowolna osoba w internecie mogłaby generować koszty na Twoim koncie API.
router.use(authenticate);

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const PROMPT = `Jesteś ekspertem językowym i OCR. Przeanalizuj to zdjęcie strony z podręcznika i wyciągnij z niego listę słówek. Zignoruj sposób wymowy (w ukośnikach np. /sʌmθɪŋ/), nawiasy z częściami mowy (np. (v), (n), (adj)), numery stron i polecenia do zadań. Wyciągnij angielskie słówko i jego polskie tłumaczenie.`;

/**
 * POST /api/scan-ai
 * body: { image }  -- obraz w formacie data URL (base64)
 */
router.post('/scan-ai', async (req, res) => {
  try {
    const { image } = req.body;
    if (!image) {
      return res.status(400).json({ success: false, message: 'Brak obrazu.' });
    }

    // Wyciągamy sam base64 i mimeType z data URL (np. "data:image/jpeg;base64,...")
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
      { text: PROMPT },
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
