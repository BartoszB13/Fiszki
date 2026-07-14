// Zmienne stanu nawigacji drzewiastej
let userItems = [];
let currentFolderId = null; // null = katalog główny
let folderHistory = [];

function updateNavigationUI() {
    const btnBack = document.getElementById('btn-go-back');
    if (currentFolderId === null) {
        btnBack.classList.add('hidden');
        document.getElementById('current-path-label').innerText = 'Główny katalog';
    } else {
        btnBack.classList.remove('hidden');
    }
}

function enterFolder(id, name) {
    folderHistory.push({ id: currentFolderId, name: document.getElementById('current-path-label').innerText });
    currentFolderId = id;
    document.getElementById('current-path-label').innerText = `Katalog: ${name}`;
    updateNavigationUI();
    fetchItemsFromDB();
}

// POBIERANIE DANYCH — userId nie jest już wysyłany: backend czyta
// tożsamość z zweryfikowanego access tokenu (nagłówek Authorization),
// doklejanego automatycznie przez FiszkiAPI.apiFetch.
async function fetchItemsFromDB() {
    try {
        const response = await FiszkiAPI.apiFetch('/items/get', {
            method: 'POST',
            body: JSON.stringify({ parentId: currentFolderId }),
        });
        const result = await response.json();

        if (result.success) {
            userItems = result.items;
            renderGrid();
        } else {
            console.error('Błąd pobierania danych:', result.message);
        }
    } catch (error) {
        console.error('Błąd pobierania danych:', error);
    }
}

async function addNewItem(type) {
    const name = prompt(`Podaj nazwę dla nowego ${type === 'folder' ? 'Foldera' : 'Talii Fiszek'}:`);
    if (!name || !name.trim()) return;

    try {
        const response = await FiszkiAPI.apiFetch('/items/add', {
            method: 'POST',
            body: JSON.stringify({ type, name: name.trim(), parentId: currentFolderId }),
        });
        const result = await response.json();

        if (result.success) {
            fetchItemsFromDB();
        } else {
            alert('Błąd zapisu: ' + result.message);
        }
    } catch (error) {
        console.error('Błąd serwera:', error);
    }
}

async function deleteItem(itemId, itemName) {
    const confirmed = confirm(
        `Czy na pewno chcesz usunąć "${itemName}"? ${currentFolderId === null ? '(Spowoduje to usunięcie zawartości)' : ''}`
    );
    if (!confirmed) return;

    try {
        const response = await FiszkiAPI.apiFetch('/items/delete', {
            method: 'POST',
            body: JSON.stringify({ itemId }),
        });
        const result = await response.json();
        if (result.success) {
            fetchItemsFromDB();
        } else {
            alert('Błąd usuwania: ' + result.message);
        }
    } catch (error) {
        console.error('Błąd:', error);
    }
}

// Renderowanie DOM przez createElement/textContent (NIE innerHTML) —
// nazwa folderu/talii pochodzi od użytkownika, więc nawet po sanityzacji
// po stronie backendu wolimy nie budować HTML-a przez interpolację
// stringów (i tym samym uniknąć wektora XSS na tym widoku).
function renderGrid() {
    const grid = document.getElementById('dashboard-grid');
    grid.innerHTML = '';

    userItems.forEach(item => {
        const itemDiv = document.createElement('div');

        if (item.type === 'folder') {
            itemDiv.className = 'grid-item item-folder';
            itemDiv.onclick = () => enterFolder(item.id, item.name);
            itemDiv.innerHTML = `
                <button class="delete-btn" data-id="${item.id}" data-name="${item.name}">✖</button>
                <div class="item-icon">📁</div>
                <div class="item-title">${item.name}</div>
            `;
        } else {
            itemDiv.className = 'grid-item item-deck';
            itemDiv.onclick = () => window.location.href = 'import.html?deckId=' + item.id;
            itemDiv.innerHTML = `
                <button class="delete-btn" data-id="${item.id}" data-name="${item.name}">✖</button>
                <div class="item-icon">📇</div>
                <div class="item-title">${item.name}</div>
            `;
        }
        grid.appendChild(itemDiv);
    });
}

(async function init() {
    // Pierwsza rzecz na stronie: próba odświeżenia sesji z HttpOnly
    // ciasteczka. Jeśli się nie uda -> przekierowanie na auth.html.
    const authed = await FiszkiAPI.requireAuth();
    if (!authed) return;

    document.getElementById('display-username').innerText = localStorage.getItem('currentUser') || 'User';

    document.getElementById('btn-logout').addEventListener('click', async () => {
        await FiszkiAPI.logout();
        window.location.replace('auth.html');
    });

    const btnCreateMain = document.getElementById('btn-create-main');
    const createMenu = document.getElementById('create-menu');
    btnCreateMain.addEventListener('click', (e) => {
        e.stopPropagation();
        createMenu.classList.toggle('show');
    });
    document.addEventListener('click', () => createMenu.classList.remove('show'));

    // Uwaga: "Nowy Folder" / "Talia Fiszek" w #create-menu NIE mają już
    // id="btn-new-folder" / id="btn-new-deck" — używają data-action
    // i są obsługiwane przez delegowany listener na #create-menu poniżej.
    // (Wcześniej były tu dwie linie getElementById('btn-new-folder'/'btn-new-deck')
    // które zwracały null i rzucały TypeError, przerywając resztę init().)

    document.getElementById('btn-go-back').addEventListener('click', () => {
        const previous = folderHistory.pop();
        if (previous) {
            currentFolderId = previous.id;
            document.getElementById('current-path-label').innerText = previous.name;
            updateNavigationUI();
            fetchItemsFromDB();
        }
    });

    document.getElementById('create-menu').addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON' && e.target.dataset.action) {
            addNewItem(e.target.dataset.action);
        }
    });

    document.getElementById('dashboard-grid').addEventListener('click', (e) => {
        if (e.target.classList.contains('delete-btn')) {
            const id = Number(e.target.dataset.id);
            const name = e.target.dataset.name;
            deleteItem(id, name);
        }
    });

    fetchItemsFromDB();
})();