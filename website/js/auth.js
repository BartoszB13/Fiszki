function toggleForms() {
    document.getElementById('login-section').classList.toggle('hidden');
    document.getElementById('register-section').classList.toggle('hidden');
    document.querySelectorAll('input').forEach(input => input.value = '');
    document.querySelectorAll('.error-message, .success-message').forEach(msg => msg.style.display = 'none');
}

// Pokazuje ekran weryfikacji OTP, chowa rejestrację/logowanie.
// Osobna funkcja od toggleForms(), bo tu przechodzimy zawsze w jedną stronę
// (rejestracja -> weryfikacja), a nie przełączamy między dwoma stanami.
function showVerifySection(email) {
    document.getElementById('register-section').classList.add('hidden');
    document.getElementById('login-section').classList.add('hidden');
    document.getElementById('verify-section').classList.remove('hidden');
    document.getElementById('verify-email-display').innerText = email;
    document.querySelectorAll('.error-message, .success-message').forEach(msg => msg.style.display = 'none');
}

function backToLoginFromVerify() {
    document.getElementById('verify-section').classList.add('hidden');
    document.getElementById('login-section').classList.remove('hidden');
    document.querySelectorAll('input').forEach(input => input.value = '');
    document.querySelectorAll('.error-message, .success-message').forEach(msg => msg.style.display = 'none');
}

const API_URL = FiszkiAPI.API_URL;

// Trzymamy e-mail oczekujący na weryfikację w zmiennej modułu (nie w localStorage —
// to tylko stan UI na czas jednej sesji przeglądania tej strony).
let pendingVerificationEmail = null;

// --- REJESTRACJA ---
document.getElementById('register-form').addEventListener('submit', async function (e) {
    e.preventDefault();

    const errorMsg = document.getElementById('register-error');
    const successMsg = document.getElementById('register-success');
    const btn = document.getElementById('btn-register-submit');

    const username = document.getElementById('reg-username').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const pass1 = document.getElementById('reg-password').value;
    const pass2 = document.getElementById('reg-password-repeat').value;

    errorMsg.style.display = 'none';
    successMsg.style.display = 'none';

    if (pass1 !== pass2) {
        errorMsg.innerText = 'Hasła nie są identyczne!';
        errorMsg.style.display = 'block';
        return;
    }

    btn.disabled = true;
    try {
        const res = await fetch(`${API_URL}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, email, password: pass1 }),
        });
        const data = await res.json();

        if (data.success) {
            document.getElementById('register-form').reset();
            pendingVerificationEmail = email;
            showVerifySection(email);
        } else {
            errorMsg.innerText = data.message || 'Wystąpił błąd podczas rejestracji.';
            errorMsg.style.display = 'block';
        }
    } catch (err) {
        console.error('Error:', err);
        errorMsg.innerText = 'Błąd połączenia z serwerem.';
        errorMsg.style.display = 'block';
    } finally {
        btn.disabled = false;
    }
});

// --- WERYFIKACJA OTP ---
document.getElementById('verify-form').addEventListener('submit', async function (e) {
    e.preventDefault();

    const errorMsg = document.getElementById('verify-error');
    const successMsg = document.getElementById('verify-success');
    const btn = document.getElementById('btn-verify-submit');
    const otp = document.getElementById('verify-otp').value.trim();

    errorMsg.style.display = 'none';
    successMsg.style.display = 'none';

    if (!pendingVerificationEmail) {
        errorMsg.innerText = 'Brak adresu e-mail do weryfikacji. Zarejestruj się ponownie.';
        errorMsg.style.display = 'block';
        return;
    }

    btn.disabled = true;
    try {
        const res = await fetch(`${API_URL}/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: pendingVerificationEmail, otp }),
        });
        const data = await res.json();

        if (data.success) {
            successMsg.style.display = 'block';
            document.getElementById('verify-form').reset();
            setTimeout(() => {
                pendingVerificationEmail = null;
                backToLoginFromVerify();
            }, 1500);
        } else {
            errorMsg.innerText = data.message || 'Nieprawidłowy kod weryfikacyjny.';
            errorMsg.style.display = 'block';
        }
    } catch (err) {
        console.error('Error:', err);
        errorMsg.innerText = 'Błąd połączenia z serwerem.';
        errorMsg.style.display = 'block';
    } finally {
        btn.disabled = false;
    }
});

// --- LOGOWANIE ---
document.getElementById('login-form').addEventListener('submit', async function (e) {
    e.preventDefault();

    const errorMsg = document.getElementById('login-error');
    const btn = document.getElementById('btn-login-submit');
    const loginInput = document.getElementById('login-username').value.trim();
    const passwordInput = document.getElementById('login-password').value;

    errorMsg.style.display = 'none';
    btn.disabled = true;

    try {
        // credentials: 'include' -> przeglądarka zapisze HttpOnly ciasteczko
        // z refresh tokenem, które backend ustawi w odpowiedzi (Set-Cookie).
        const res = await fetch(`${API_URL}/login`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: loginInput, password: passwordInput }),
        });
        const data = await res.json();

        if (data.success) {
            // Username trzymamy w localStorage TYLKO do wyświetlenia w nagłówku
            // (np. "👤 Jan") — to nie jest sekret i nie służy do autoryzacji.
            // Sam accessToken NIE jest tu zapisywany nigdzie trwale: następna
            // strona i tak odświeży sesję z ciasteczka przy starcie.
            localStorage.setItem('currentUser', data.username);
            window.location.href = 'index.html';
        } else if (res.status === 403) {
            // Konto istnieje i hasło jest poprawne, ale e-mail nie został
            // zweryfikowany — dajemy użytkownikowi drogę do dokończenia weryfikacji
            // zamiast zwykłego komunikatu błędu.
            pendingVerificationEmail = loginInput;
            showVerifySection(loginInput);
            document.getElementById('verify-error').innerText = data.message || 'Konto nie zostało zweryfikowane. Sprawdź e-mail.';
            document.getElementById('verify-error').style.display = 'block';
        } else {
            errorMsg.innerText = data.message || 'Nieprawidłowy login lub hasło.';
            errorMsg.style.display = 'block';
        }
    } catch (err) {
        console.error('Error:', err);
        errorMsg.innerText = 'Błąd połączenia z serwerem.';
        errorMsg.style.display = 'block';
    } finally {
        btn.disabled = false;
    }
});