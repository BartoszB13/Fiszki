/**
 * js/api-client.js — wspólny klient API dla Fiszki.io.
 * Dołącz na KAŻDEJ stronie, która rozmawia z backendem:
 *   <script src="js/api-client.js"></script>
 * (przed innym inline <script>, który z niego korzysta).
 *
 * Model bezpieczeństwa w skrócie:
 * - Access token żyje WYŁĄCZNIE w zmiennej JS tej karty przeglądarki (nigdy
 *   w localStorage/sessionStorage) - ogranicza to, co może ukraść ewentualny XSS.
 * - Ponieważ to aplikacja wielostronicowa (pełne przeładowania między
 *   Tworzenie.html / import.html / nauka.html), token "nie przetrwałby"
 *   nawigacji. Zamiast trzymać go w trwałym storage, każda chroniona strona
 *   przy starcie po cichu odświeża sesję (POST /api/auth/refresh) w oparciu
 *   o HttpOnly ciasteczko z refresh tokenem - to ono jest źródłem trwałości
 *   logowania, nie JS.
 */
(function (global) {
  // Zmień na adres produkcyjny backendu, gdy wdrożysz go poza localhost.
  const API_URL = 'http://localhost:3000/api';

  let accessToken = null;

  /** Po cichu próbuje uzyskać nowy access token na podstawie ciasteczka refresh. */
  async function refreshAccessToken() {
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include', // dołącza HttpOnly ciasteczko refreshToken
      });
      if (!res.ok) {
        accessToken = null;
        return false;
      }
      const data = await res.json();
      accessToken = data.accessToken;
      return true;
    } catch (err) {
      console.error('Błąd odświeżania sesji:', err);
      accessToken = null;
      return false;
    }
  }

  /**
   * Wrapper na fetch() do WSZYSTKICH chronionych endpointów.
   * - dokleja Authorization: Bearer <token>,
   * - przy 401 (token wygasł w trakcie sesji) automatycznie odświeża
   *   i ponawia to samo żądanie DOKŁADNIE RAZ (żeby uniknąć pętli).
   */
  async function apiFetch(path, options = {}) {
    const buildOptions = () => ({
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
    });

    let res = await fetch(`${API_URL}${path}`, buildOptions());

    if (res.status === 401) {
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        res = await fetch(`${API_URL}${path}`, buildOptions());
      }
    }

    return res;
  }

  /**
   * Wywołaj jako PIERWSZĄ rzecz na każdej stronie wymagającej logowania
   * (Tworzenie.html, import.html, nauka.html). Zwraca true/false i
   * przekierowuje na auth.html, jeśli sesja jest nieważna/wygasła.
   */
  async function requireAuth() {
    const ok = await refreshAccessToken();
    if (!ok) {
      window.location.replace('auth.html');
    }
    return ok;
  }

  /**
   * Wersja "łagodna" dla stron PUBLICZNYCH (index.html) — sprawdza sesję,
   * ale NIE przekierowuje, jeśli jej brak (użytkownik ma prawo być niezalogowany).
   */
  async function checkAuthSilently() {
    return refreshAccessToken();
  }

  /** Unieważnia refresh token po stronie serwera i czyści stan lokalny. */
  async function logout() {
    try {
      await fetch(`${API_URL}/auth/logout`, { method: 'POST', credentials: 'include' });
    } catch (err) {
      console.error('Błąd wylogowania:', err);
    }
    accessToken = null;
    // Username trzymamy w localStorage WYŁĄCZNIE do wyświetlenia w nagłówku
    // ("Witaj, Jan!") — to nie jest sekret i nie służy do autoryzacji.
    localStorage.removeItem('currentUser');
  }

  global.FiszkiAPI = {
    API_URL,
    apiFetch,
    requireAuth,
    checkAuthSilently,
    logout,
    setAccessToken: (t) => { accessToken = t; },
  };
})(window);
