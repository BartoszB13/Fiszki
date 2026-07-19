const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { authenticate } = require('../middleware/auth.middleware');

const router = express.Router();

// Wywołania Gemini kosztują pieniądze i czas — endpoint musi być za autoryzacją,
// inaczej dowolna osoba w internecie mogłaby generować koszty na Twoim koncie API.
router.use(authenticate);

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Gemini widzi CAŁĄ stronę na raz (nie pojedyncze słowo w oderwaniu od
 * kontekstu, tak jak MyMemory) — dlatego to on, a nie MyMemory, tłumaczy
 * w tej ścieżce. To pozwala:
 * 1) samodzielnie rozpoznać język strony (brak selektora w UI),
 * 2) użyć kontekstu (przykładowych zdań, tematu lekcji) do poprawnego
 *    przetłumaczenia idiomów/zwrotów metaforycznych, których MyMemory
 *    tłumaczy zwykle dosłownie słowo-po-słowie.
 */
const PROMPT = `Jesteś ekspertem językowym i OCR. Przeanalizuj to zdjęcie strony z podręcznika do nauki języka obcego i wyciągnij z niego listę słówek oraz zwrotów. Zignoruj sposób wymowy (w ukośnikach np. /sʌmθɪŋ/), nawiasy z częściami mowy (np. (v), (n), (adj)), numery stron i polecenia do zadań.

Dla każdej pozycji zwróć:
- "base": słowo lub wyrażenie DOKŁADNIE w takim języku, w jakim widnieje na zdjęciu (sam rozpoznaj język — może to być dowolny język, nie zakładaj z góry którego).
- "translation": naturalne, poprawne polskie tłumaczenie.

Jeśli natrafisz na idiom, kolokację lub wyrażenie o znaczeniu metaforycznym/przenośnym, NIE tłumacz go dosłownie słowo po słowie. Wykorzystaj kontekst całej widocznej strony (przykładowe zdania, temat lekcji, otaczający tekst), aby ustalić jego rzeczywiste, naturalne znaczenie w języku polskim — tak jak zrobiłby to native speaker, a nie tłumacz maszynowy pracujący na pojedynczych słowach w oderwaniu od kontekstu.`;

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