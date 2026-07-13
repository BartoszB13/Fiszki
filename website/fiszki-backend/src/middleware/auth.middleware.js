const { verifyAccessToken } = require('../utils/tokens');

/**
 * Wymaga poprawnego, ważnego access tokenu w nagłówku:
 *   Authorization: Bearer <token>
 *
 * Dlaczego nagłówek, a nie ciasteczko dla access tokenu?
 * Access token trzymamy PO STRONIE FRONTENDU w pamięci JS (nie w localStorage,
 * nie w ciasteczku) i dołączamy ręcznie do nagłówka. To eliminuje ryzyko CSRF
 * dla wszystkich endpointów chronionych tym middleware — atakujący nie może
 * zmusić przeglądarki ofiary do automatycznego wysłania nagłówka Authorization
 * (w przeciwieństwie do ciasteczek, które przeglądarka dołącza sama).
 */
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const [scheme, token] = authHeader.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ success: false, message: 'Brak tokenu uwierzytelniającego.' });
  }

  try {
    const payload = verifyAccessToken(token);
    // Doklejamy zminimalizowany, zaufany kontekst użytkownika do requestu.
    // Dalsze handlery MUSZĄ używać req.user.id, a nie userId z body/query,
    // żeby uniknąć IDOR (podszywanie się pod cudzego user ID w payloadzie).
    req.user = { id: payload.sub, username: payload.username };
    return next();
  } catch (err) {
    // Rozróżniamy wygasły token (frontend wie, że ma spróbować /refresh)
    // od tokenu ogólnie nieprawidłowego (np. sfałszowany podpis).
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token wygasł.', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ success: false, message: 'Nieprawidłowy token.', code: 'TOKEN_INVALID' });
  }
}

module.exports = { authenticate };
