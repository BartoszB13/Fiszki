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

            userItems.forEach((item) => {
                const itemDiv = document.createElement('div');
                itemDiv.className = item.type === 'folder' ? 'grid-item item-folder' : 'grid-item item-deck';

                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'delete-btn';
                deleteBtn.type = 'button';
                deleteBtn.innerText = '✖';
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    deleteItem(item.id, item.name);
                });

                const icon = document.createElement('div');
                icon.className = 'item-icon';
                icon.innerText = item.type === 'folder' ? '📁' : '📇';

                const title = document.createElement('div');
                title.className = 'item-title';
                title.textContent = item.name; // textContent = zero ryzyka wstrzyknięcia HTML

                itemDiv.append(deleteBtn, icon, title);

                itemDiv.addEventListener('click', () => {
                    if (item.type === 'folder') {
                        enterFolder(item.id, item.name);
                    } else {
                        window.location.href = 'import.html?deckId=' + item.id;
                    }
                });

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

            document.getElementById('btn-new-folder').addEventListener('click', () => addNewItem('folder'));
            document.getElementById('btn-new-deck').addEventListener('click', () => addNewItem('deck'));

            document.getElementById('btn-go-back').addEventListener('click', () => {
                const previous = folderHistory.pop();
                if (previous) {
                    currentFolderId = previous.id;
                    document.getElementById('current-path-label').innerText = previous.name;
                    updateNavigationUI();
                    fetchItemsFromDB();
                }
            });

            fetchItemsFromDB();
        })();