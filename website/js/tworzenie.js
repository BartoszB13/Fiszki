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
// Formatuje ISO datę z backendu (createdAt) na czytelny format dd.mm.rrrr.
function formatItemDate(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// Renderowanie przez createElement/textContent (NIE innerHTML) — nazwa
// folderu/talii pochodzi od użytkownika, więc unikamy budowania HTML-a
// przez interpolację stringów (spójne z resztą apki, np. import.js).
function renderGrid() {
    const grid = document.getElementById('dashboard-grid');
    grid.innerHTML = '';

    userItems.forEach(item => {
        const isFolder = item.type === 'folder';

        const itemDiv = document.createElement('div');
        itemDiv.className = isFolder ? 'grid-item item-folder' : 'grid-item item-deck';
        itemDiv.dataset.id = item.id;

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.dataset.id = item.id;
        deleteBtn.dataset.name = item.name;
        deleteBtn.textContent = '✖';

        const iconBadge = document.createElement('div');
        iconBadge.className = 'item-icon-badge';
        iconBadge.textContent = isFolder ? '📁' : '📇';

        const content = document.createElement('div');
        content.className = 'item-content';

        const typeLabel = document.createElement('span');
        typeLabel.className = 'item-type-label';
        typeLabel.textContent = isFolder ? 'Folder' : 'Talia fiszek';

        const title = document.createElement('div');
        title.className = 'item-title';
        title.textContent = item.name;

        content.appendChild(typeLabel);
        content.appendChild(title);

        const dateLabel = document.createElement('span');
        dateLabel.className = 'item-date';
        dateLabel.textContent = formatItemDate(item.createdAt);

        itemDiv.appendChild(deleteBtn);
        itemDiv.appendChild(iconBadge);
        itemDiv.appendChild(content);
        itemDiv.appendChild(dateLabel);

        attachDragHandlers(itemDiv, item); // dokleja i nawigację (klik), i przeciąganie

        grid.appendChild(itemDiv);
    });
}

// ===== Drag & drop ("przytrzymaj i przeciągnij") — przenoszenie talii/folderów =====
// Oparte na Pointer Events (nie HTML5 Drag&Drop), bo natywne DnD słabo
// współpracuje z ekranami dotykowymi. Wymaga krótkiego przytrzymania
// (LONG_PRESS_MS), żeby zwykłe stuknięcie dalej nawigowało jak wcześniej,
// a przypadkowe muśnięcie przy scrollowaniu nie uruchamiało przeciągania.
const LONG_PRESS_MS = 350;
const MOVE_CANCEL_PX = 10;

let pressTimer = null;
let pressStartPos = null;
let pendingPress = null;
let dragState = null;

function clearPendingPress() {
    if (pressTimer) clearTimeout(pressTimer);
    pressTimer = null;
    pendingPress = null;
    pressStartPos = null;
}

function attachDragHandlers(itemDiv, item) {
    itemDiv.addEventListener('pointerdown', (e) => {
        if (e.target.closest('.delete-btn')) return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;

        pressStartPos = { x: e.clientX, y: e.clientY };
        pendingPress = { item, itemDiv };
        pressTimer = setTimeout(() => {
            if (pendingPress) startDrag(pendingPress.item, pendingPress.itemDiv, pressStartPos);
        }, LONG_PRESS_MS);
    });

    // Ruch przed upłynięciem czasu przytrzymania = user chce scrollować/kliknąć,
    // a nie przeciągać -> anulujemy oczekujące przeciąganie.
    itemDiv.addEventListener('pointermove', (e) => {
        if (!pressStartPos || dragState) return;
        const dx = e.clientX - pressStartPos.x;
        const dy = e.clientY - pressStartPos.y;
        if (Math.hypot(dx, dy) > MOVE_CANCEL_PX) clearPendingPress();
    });

    itemDiv.addEventListener('pointerup', clearPendingPress);
    itemDiv.addEventListener('pointercancel', clearPendingPress);

    itemDiv.addEventListener('click', (e) => {
        if (itemDiv._suppressNextClick) {
            itemDiv._suppressNextClick = false;
            return;
        }
        if (e.target.closest('.delete-btn')) return;
        if (item.type === 'folder') {
            enterFolder(item.id, item.name);
        } else {
            window.location.href = 'import.html?deckId=' + item.id;
        }
    });
}

function startDrag(item, itemDiv, startPos) {
    pendingPress = null;
    pressTimer = null;

    const rect = itemDiv.getBoundingClientRect();
    const ghost = itemDiv.cloneNode(true);
    ghost.classList.add('drag-ghost');
    ghost.style.width = rect.width + 'px';
    ghost.querySelectorAll('.delete-btn').forEach((btn) => btn.remove());
    document.body.appendChild(ghost);

    itemDiv.classList.add('is-dragging-source');
    document.body.style.touchAction = 'none';
    document.body.style.userSelect = 'none';

    dragState = {
        item,
        itemDiv,
        ghost,
        offsetX: startPos.x - rect.left,
        offsetY: startPos.y - rect.top,
        currentDropTarget: null,
    };

    positionGhost(startPos.x, startPos.y);

    document.addEventListener('pointermove', onDragMove, { passive: false });
    document.addEventListener('pointerup', onDragEnd);

    if (navigator.vibrate) navigator.vibrate(15); // subtelny feedback na telefonie, jeśli dostępny
}

function positionGhost(x, y) {
    if (!dragState) return;
    dragState.ghost.style.left = `${x - dragState.offsetX}px`;
    dragState.ghost.style.top = `${y - dragState.offsetY}px`;
}

function onDragMove(e) {
    if (!dragState) return;
    e.preventDefault(); // blokuje scroll strony w trakcie aktywnego przeciągania
    positionGhost(e.clientX, e.clientY);

    dragState.ghost.style.visibility = 'hidden';
    const elUnder = document.elementFromPoint(e.clientX, e.clientY);
    dragState.ghost.style.visibility = 'visible';

    // Tylko foldery są prawidłowym celem — talia nie może zawierać kolejnych elementów.
    const folderTarget = elUnder ? elUnder.closest('.grid-item.item-folder') : null;
    const validTarget = folderTarget && folderTarget !== dragState.itemDiv ? folderTarget : null;

    if (dragState.currentDropTarget && dragState.currentDropTarget !== validTarget) {
        dragState.currentDropTarget.classList.remove('drag-over');
    }
    if (validTarget) validTarget.classList.add('drag-over');
    dragState.currentDropTarget = validTarget;
}

async function onDragEnd() {
    document.removeEventListener('pointermove', onDragMove);
    document.removeEventListener('pointerup', onDragEnd);

    if (!dragState) return;

    const { item, itemDiv, ghost, currentDropTarget } = dragState;
    itemDiv.classList.remove('is-dragging-source');
    if (currentDropTarget) currentDropTarget.classList.remove('drag-over');
    ghost.remove();
    document.body.style.touchAction = '';
    document.body.style.userSelect = '';

    // Blokuje "click", który przeglądarka wyemituje zaraz po pointerup,
    // gdyby zwolnienie nastąpiło dokładnie nad kartą źródłową.
    itemDiv._suppressNextClick = true;

    const targetFolderId = currentDropTarget ? Number(currentDropTarget.dataset.id) : null;
    dragState = null;

    if (!targetFolderId) return; // upuszczone poza folderem -> anuluj

    await moveItemToFolder(item.id, targetFolderId);
}

async function moveItemToFolder(itemId, targetFolderId) {
    try {
        const response = await FiszkiAPI.apiFetch('/items/move', {
            method: 'POST',
            body: JSON.stringify({ itemId, targetFolderId }),
        });
        const result = await response.json();
        if (result.success) {
            fetchItemsFromDB(); // odświeża widok — przeniesiony element znika z bieżącej listy
        } else {
            alert('Nie udało się przenieść elementu: ' + result.message);
        }
    } catch (error) {
        console.error('Błąd przenoszenia elementu:', error);
        alert('Nie udało się połączyć z serwerem, aby przenieść element.');
    }
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