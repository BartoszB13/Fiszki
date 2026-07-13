function toggleForms() {
            document.getElementById('login-section').classList.toggle('hidden');
            document.getElementById('register-section').classList.toggle('hidden');
            document.querySelectorAll('input').forEach(input => input.value = '');
            document.querySelectorAll('.error-message, .success-message').forEach(msg => msg.style.display = 'none');
        }

        const API_URL = FiszkiAPI.API_URL;

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
                    successMsg.style.display = 'block';
                    document.getElementById('register-form').reset();
                    setTimeout(() => toggleForms(), 1500);
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