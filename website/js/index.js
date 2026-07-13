document.addEventListener('DOMContentLoaded', async () => {
            const btnCreate = document.getElementById('btn-create');
            const btnLogin = document.getElementById('btn-login');
            const userProfile = document.getElementById('user-profile');
            const displayUsername = document.getElementById('display-username');
            const btnLogout = document.getElementById('btn-logout');
            const btnHeroStart = document.getElementById('btn-hero-start');

            // Strona publiczna: sprawdzamy sesję PO CICHU (na podstawie HttpOnly
            // ciasteczka), bez przekierowania jeśli jej brak — w przeciwieństwie
            // do stron chronionych, gdzie używamy FiszkiAPI.requireAuth().
            const isLoggedIn = await FiszkiAPI.checkAuthSilently();
            const storedUsername = localStorage.getItem('currentUser');

            if (isLoggedIn && storedUsername) {
                btnLogin.classList.add('hidden');
                userProfile.classList.remove('hidden');
                displayUsername.innerText = storedUsername; // .innerText, nie innerHTML

                btnHeroStart.innerText = 'Przejdź do nauki';
                btnHeroStart.href = 'Tworzenie.html';
            } else {
                // Sesja nieważna/wygasła, ale w localStorage mogła zostać stara nazwa
                // z poprzedniego logowania — sprzątamy, żeby UI nie kłamało.
                localStorage.removeItem('currentUser');
            }

            btnCreate.addEventListener('click', (e) => {
                e.preventDefault();
                window.location.href = isLoggedIn ? 'Tworzenie.html' : 'auth.html';
            });

            btnLogout.addEventListener('click', async () => {
                await FiszkiAPI.logout();
                window.location.reload();
            });
        });