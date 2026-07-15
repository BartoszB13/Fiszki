// Obsługa hamburger menu na index.html i Tworzenie.html.
// Plik zewnętrzny (nie inline) - wymagane przez CSP script-src 'self'.
// Bezpieczny no-op na stronach bez #nav-hamburger / #header-buttons (np. import.html, nauka.html).
document.addEventListener('DOMContentLoaded', () => {
    const hamburgerBtn = document.getElementById('nav-hamburger');
    const headerButtons = document.getElementById('header-buttons');

    if (!hamburgerBtn || !headerButtons) return;

    hamburgerBtn.addEventListener('click', () => {
        const isOpen = headerButtons.classList.toggle('open');
        hamburgerBtn.classList.toggle('active', isOpen);
        hamburgerBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });

    // Zamykanie menu po kliknięciu w link/przycisk wewnątrz (np. "Twórz", "Zaloguj się")
    headerButtons.addEventListener('click', (e) => {
        const target = e.target;
        if (target.tagName === 'A' || (target.tagName === 'BUTTON' && target.id !== 'btn-logout')) {
            headerButtons.classList.remove('open');
            hamburgerBtn.classList.remove('active');
            hamburgerBtn.setAttribute('aria-expanded', 'false');
        }
    });

    // Toggle dropdownu użytkownika na dotyku (mobile nie ma :hover)
    const userProfile = document.getElementById('user-profile');
    if (userProfile) {
        userProfile.addEventListener('click', (e) => {
            if (window.innerWidth > 768) return; // desktop nadal używa :hover
            if (e.target.id === 'btn-logout') return; // nie blokuj kliknięcia w Wyloguj
            userProfile.classList.toggle('open');
        });
    }
});
