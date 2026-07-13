# Fiszki.io — zaktualizowany frontend (kompatybilny z backendem JWT)

## Co się zmieniło względem oryginału

| Plik | Zmiana |
|---|---|
| `js/api-client.js` **(nowy)** | Wspólny klient API — zarządza access tokenem w pamięci, auto-refresh przy 401, wrapper `apiFetch`. |
| `auth.html` | Login/register wołają nowe endpointy (`/login`, `/register`), `credentials: 'include'` przy logowaniu, hasło min. 8 znaków. |
| `index.html` | Zamiast czytać `localStorage.currentUser` jako "prawdę", po cichu odpytuje `/auth/refresh`, żeby wiedzieć, czy sesja jest realnie ważna. |
| `Tworzenie.html` / `import.html` / `nauka.html` | Na starcie wołają `FiszkiAPI.requireAuth()` (zamiast synchronicznego sprawdzenia `localStorage` na górze `<head>`) i przekierowują na `auth.html`, jeśli sesja nie jest ważna. Wszystkie `fetch(...)` do backendu zastąpione `FiszkiAPI.apiFetch(...)` — `userId` NIE jest już wysyłany w body (backend czyta go z tokenu). |
| Renderowanie list (foldery/talie/słówka/błędy) | Przepisane z `innerHTML` + interpolacja stringów na `createElement` + `textContent` — usuwa teoretyczny wektor XSS/atrybut-breakout przy nazwach zawierających znaki specjalne. |

## Uruchomienie

1. Skopiuj wszystkie pliki (razem z katalogiem `js/`) do miejsca, skąd serwujesz frontend (np. przez VS Code „Live Server").
2. **Nie otwieraj plików bezpośrednio z dysku** (`file://...`) — ciasteczka i CORS tego nie obsłużą. Musisz serwować je przez HTTP (Live Server, `npx http-server`, itp.).
3. W `js/api-client.js` ustaw `API_URL` na adres Twojego backendu (domyślnie `http://localhost:3000/api`).
4. W backendzie w `.env` ustaw `FRONTEND_ORIGIN` na dokładny adres, pod którym serwujesz ten frontend (np. `http://127.0.0.1:5500`) — inaczej CORS zablokuje żądania.

## Dlaczego token "znika" po odświeżeniu strony i czy to normalne

Tak, to zamierzone. Access token żyje tylko w zmiennej JS, więc nawigacja między stronami (`Tworzenie.html` → `import.html`) go kasuje. Każda chroniona strona przy starcie **automatycznie** wywołuje `/api/auth/refresh`, które na podstawie HttpOnly ciasteczka (niewidocznego dla JS) wydaje nowy access token — użytkownik tego nie zauważa, poza ułamkiem sekundy opóźnienia przed załadowaniem treści. To świadomy kompromis: token nigdy nie trafia do `localStorage`, więc XSS nie ma go skąd wykraść.

## Znane ograniczenie

Skoro strony ładują się jako osobne dokumenty (pełne przeładowanie, nie SPA), krótki "mignięcie" niezalogowanej treści przed przekierowaniem na `auth.html` jest możliwe, jeśli sesja faktycznie wygasła. Jeśli to przeszkadza, rozważ dodanie prostego ekranu ładowania (`<div id="auth-check-overlay">`) wyświetlanego do czasu rozstrzygnięcia `requireAuth()` — nie zaimplementowałem tego, żeby nie komplikować kodu ponad potrzebę, ale to prosta zmiana do dodania w razie potrzeby.
