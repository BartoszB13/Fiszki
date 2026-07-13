const { z } = require('zod');
const sanitizeHtml = require('sanitize-html');

// Limity uzgodnione dla domeny fiszek: term (Front) i definition (Back).
const TERM_MAX_LENGTH = 50;
const DEFINITION_MAX_LENGTH = 200;

/**
 * Schemat Zod = pojedyncze źródło prawdy dla walidacji wejścia.
 * - .trim() zapobiega obchodzeniu min(1) samymi spacjami.
 * - .max() twardo odrzuca (400), zanim cokolwiek trafi do bazy — chroni przed
 *   "database bloating" i nadmiernie dużym payloadem trzymanym w pamięci/DB.
 * - deckId jako liczba całkowita dodatnia — odcina próby wstrzyknięcia
 *   nienumerycznych wartości dalej w łańcuchu (choć Prisma i tak by to odrzuciła).
 */
const flashcardSchema = z.object({
  deckId: z.coerce.number().int().positive(),
  term: z
    .string()
    .trim()
    .min(1, 'Termin nie może być pusty.')
    .max(TERM_MAX_LENGTH, `Termin może mieć maksymalnie ${TERM_MAX_LENGTH} znaków.`),
  definition: z
    .string()
    .trim()
    .min(1, 'Definicja nie może być pusta.')
    .max(DEFINITION_MAX_LENGTH, `Definicja może mieć maksymalnie ${DEFINITION_MAX_LENGTH} znaków.`),
});

/**
 * Usuwa WSZYSTKIE tagi HTML/atrybuty (allowedTags: [], allowedAttributes: {}).
 * Fiszki to czysty tekst — nie ma uzasadnionego przypadku, w którym term/definition
 * potrzebują znaczników HTML. Sanityzacja PRZED zapisem do bazy to obrona
 * "stored XSS" u źródła: nawet jeśli jakiś inny widok kiedyś wstawi te dane
 * przez innerHTML (tak jak obecny frontend), w bazie i tak nie będzie już
 * niczego złośliwego do wykonania.
 */
function stripHtml(value) {
  return sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} });
}

/**
 * Waliduje i sanityzuje ciało żądania tworzenia fiszki.
 * Zwraca { success: true, data } albo { success: false, message }.
 */
function validateFlashcardInput(body) {
  const parsed = flashcardSchema.safeParse(body);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return { success: false, message: firstIssue.message };
  }

  return {
    success: true,
    data: {
      deckId: parsed.data.deckId,
      term: stripHtml(parsed.data.term),
      definition: stripHtml(parsed.data.definition),
    },
  };
}

module.exports = { validateFlashcardInput, TERM_MAX_LENGTH, DEFINITION_MAX_LENGTH };
