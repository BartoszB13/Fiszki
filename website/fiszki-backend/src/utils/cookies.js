const REFRESH_COOKIE_NAME = 'refreshToken';

/**
 * Opcje ciasteczka - to jest serce ochrony CSRF/XSS dla refresh tokenu:
 * - httpOnly: JS w przeglądarce NIE MA dostępu do wartości -> kradzież przez XSS
 *   (np. wstrzyknięty <script>) nie wykradnie tego tokenu.
 * - sameSite: 'strict': przeglądarka NIE wyśle tego ciasteczka przy requestach
 *   zainicjowanych z innej domeny (np. formularz/link na złośliwej stronie)
 *   -> klasyczny CSRF na ten endpoint jest praktycznie niemożliwy.
 * - secure: ciasteczko leci tylko po HTTPS w produkcji (w dev po HTTP dla wygody).
 * - path: ograniczamy ciasteczko WYŁĄCZNIE do endpointu refresh/logout, żeby
 *   nie było dołączane (i nie wyciekało w logach) do każdego innego requestu.
 */
function refreshCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/api/auth',
    maxAge: Number(process.env.REFRESH_TOKEN_TTL_DAYS || 30) * 24 * 60 * 60 * 1000,
  };
}

function setRefreshCookie(res, rawToken) {
  res.cookie(REFRESH_COOKIE_NAME, rawToken, refreshCookieOptions());
}

function clearRefreshCookie(res) {
  res.clearCookie(REFRESH_COOKIE_NAME, { ...refreshCookieOptions(), maxAge: 0 });
}

module.exports = { REFRESH_COOKIE_NAME, setRefreshCookie, clearRefreshCookie };
console.log('Refresh cookie set for user:', user.id);
