# Fiszki.io — backend (Node.js + Express + PostgreSQL + Prisma)

## 1. Instalacja

```bash
npm init -y   # (już zrobione — masz gotowy package.json, więc pomiń)
npm install express @prisma/client bcrypt cors dotenv @google/generative-ai
npm install --save-dev prisma nodemon
```

## 2. Konfiguracja

1. Skopiuj `.env.example` do `.env` i uzupełnij:
   - `DATABASE_URL` — connection string do Twojej bazy PostgreSQL
   - `GEMINI_API_KEY` — klucz z Google AI Studio
   - `FRONTEND_ORIGIN` — adres, z którego serwujesz pliki HTML (np. `http://127.0.0.1:5500` dla Live Server)

## 3. Baza danych

```bash
npx prisma migrate dev --name init
npx prisma generate
```

To utworzy tabele `users`, `items`, `words` w Twojej (czystej) bazie PostgreSQL, zgodnie z `prisma/schema.prisma`.

## 4. Uruchomienie

```bash
npm run dev     # z auto-restartem (nodemon)
# lub
npm start
```

Serwer wystartuje na `http://localhost:3000` (albo porcie z `.env`).

## 5. Mapowanie endpointów (PHP → Node)

| Stary plik PHP        | Nowy endpoint            | Metoda |
|------------------------|---------------------------|--------|
| `register.php`         | `/api/register`           | POST   |
| `login.php`            | `/api/login`               | POST   |
| `get_items.php`        | `/api/items/get`          | POST   |
| `add_item.php`         | `/api/items/add`          | POST   |
| `delete_item.php`      | `/api/items/delete`       | POST   |
| `get_words.php`        | `/api/words/get`          | POST   |
| `add_word.php`         | `/api/words/add`          | POST   |
| `delete_word.php`      | `/api/words/delete`       | POST   |
| `scan_gemini.php`      | `/api/scan-ai`            | POST   |

Kształt danych wejściowych/wyjściowych (nazwy pól JSON) jest identyczny jak w starych plikach PHP — frontend nie musi zmieniać struktury zapytań, tylko adresy URL.

## Warstwa bezpieczeństwa (JWT + refresh tokeny) — wymagane zmiany we frontendzie

Ta wersja backendu **wymaga** zmian w `auth.html` / pozostałych plikach — sama zamiana adresów URL już nie wystarczy, bo endpointy `items`/`words`/`scan-ai` są teraz chronione tokenem.

1. **Logowanie** musi wysyłać `credentials: 'include'` (żeby przeglądarka przyjęła ciasteczko z refresh tokenem) i zapisać `accessToken` ze zwróconego JSON-a **w zmiennej JS**, nie w `localStorage` (żeby XSS nie mógł go wykraść):
   ```js
   let accessToken = null; // trzymane tylko w pamięci karty przeglądarki

   const res = await fetch(`${API_URL}/login`, {
     method: 'POST',
     credentials: 'include',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ username, password }),
   });
   const data = await res.json();
   if (data.success) accessToken = data.accessToken;
   ```

2. **Każde chronione zapytanie** (`items/*`, `words/*`, `scan-ai`) musi dołączać nagłówek `Authorization`:
   ```js
   fetch(`${API_URL}/items/get`, {
     method: 'POST',
     credentials: 'include',
     headers: {
       'Content-Type': 'application/json',
       'Authorization': `Bearer ${accessToken}`,
     },
     body: JSON.stringify({ parentId }),
   });
   ```

3. **Obsługa wygaśnięcia access tokenu (co 15 min):** gdy odpowiedź to `401` z `code: 'TOKEN_EXPIRED'`, wywołaj `/api/auth/refresh` (z `credentials: 'include'`), zapisz nowy `accessToken` i powtórz oryginalne zapytanie:
   ```js
   async function apiFetch(path, options = {}) {
     const doFetch = () => fetch(`${API_URL}${path}`, {
       ...options,
       credentials: 'include',
       headers: { ...options.headers, 'Authorization': `Bearer ${accessToken}` },
     });

     let res = await doFetch();
     if (res.status === 401) {
       const refreshRes = await fetch(`${API_URL}/auth/refresh`, { method: 'POST', credentials: 'include' });
       if (refreshRes.ok) {
         accessToken = (await refreshRes.json()).accessToken;
         res = await doFetch(); // ponów oryginalne żądanie z nowym tokenem
       } else {
         window.location.replace('auth.html'); // sesja faktycznie wygasła
       }
     }
     return res;
   }
   ```

4. **Wylogowanie** wywołaj `POST /api/auth/logout` (z `credentials: 'include'`) i wyczyść lokalną zmienną `accessToken`.

Skutek uboczny (pożądany): odświeżenie strony (F5) czyści `accessToken` z pamięci. Przy starcie aplikacji warto od razu spróbować `POST /api/auth/refresh` i dopiero brak sukcesu traktować jako "niezalogowany" — inaczej user byłby wylogowywany po każdym odświeżeniu strony.

## Zaimplementowane zabezpieczenia — podsumowanie

| Zagrożenie | Mechanizm obrony | Gdzie w kodzie |
|---|---|---|
| SQL Injection | Prisma ORM — wyłącznie zapytania parametryzowane, brak sklejania stringów SQL | wszystkie routery |
| XSS (stored) | `sanitize-html` usuwa tagi HTML z `term`/`definition` przed zapisem | `validators/flashcard.validator.js` |
| Session/token hijacking | Access token krótkożyjący (15 min), refresh token HttpOnly + rotacja + wykrywanie ponownego użycia | `utils/tokens.js` |
| CSRF | `SameSite=Strict` na ciasteczku refresh + ścisły CORS (jeden origin) + access token w nagłówku (nie w ciasteczku) | `utils/cookies.js`, `middleware/security.middleware.js` |
| Brute force logowania | Rate limiter (5/15 min per IP+login) + blokada konta w DB po 5 nieudanych próbach | `middleware/rateLimit.middleware.js`, `routes/auth.routes.js` |
| IDOR (dostęp do cudzych zasobów) | Tożsamość użytkownika wyłącznie z tokenu (`req.user.id`), jawna weryfikacja własności talii/folderu przed każdą operacją | `routes/items.routes.js`, `routes/words.routes.js` |
| Database/payload bloat | Twarde limity: 50 znaków (termin), 200 znaków (definicja), 100 znaków (nazwa folderu/talii), 15 MB na obraz do OCR | `validators/flashcard.validator.js`, `routes/items.routes.js`, `server.js` |
| Spam / DoS przez tworzenie zasobów | Rate limiter 60 fiszek/min per zalogowany użytkownik | `middleware/rateLimit.middleware.js` |
| Ujawnienie stack trace / szczegółów błędu | Globalny error handler zwraca generyczny komunikat, szczegóły trafiają tylko do logów serwera | `server.js` |
| Nagłówki HTTP / clickjacking | `helmet` (CSP, `frame-ancestors: none`, wyłączony `X-Powered-By` itd.) | `middleware/security.middleware.js` |

### Świadomy kompromis do wiedzy
Access token nie ma mechanizmu natychmiastowego unieważnienia (jest stateless) — w najgorszym razie żyje do 15 minut po np. wylogowaniu. To standardowy, akceptowalny kompromis w architekturze JWT; gdybyś potrzebował natychmiastowego odcięcia dostępu (np. przy podejrzeniu włamania), dodaj krótką listę odwołanych `jti` w Redis sprawdzaną w `auth.middleware.js`.

### Uwaga dot. istniejącego frontendu
W `import.html` lista słówek jest renderowana przez `li.innerHTML = ...${word.base}...`. Backend teraz sanityzuje dane WEJŚCIOWE (nic złośliwego już się nie zapisze), ale dobrą praktyką "defense in depth" byłoby też przejście na `textContent` / `element.innerText` zamiast `innerHTML` przy wyświetlaniu `word.base` i `word.translation` w tym pliku.
