let wordsList = [];
const urlParams = new URLSearchParams(window.location.search);
const deckId = urlParams.get('deckId');

const wordsListContainer = document.getElementById('words-list');
const wordCounter = document.getElementById('word-counter');
const inputBase = document.getElementById('input-base');
const btnSubmit = document.getElementById('btn-submit');
const foreignLangSelect = document.getElementById('foreign-lang');

inputBase.addEventListener('input', () => {
    document.getElementById('base-counter').innerText = inputBase.value.length;
});

// --- ZAPIS SŁÓWKA DO BAZY ---
// Inwariant obowiązujący w całej aplikacji: base_word = słowo OBCE,
// translation = jego polski odpowiednik. Dzięki temu nauka.js zawsze
// wyświetla to samo pole jako pierwsze (do odgadnięcia) i to samo jako
// odkrywane tłumaczenie, niezależnie od wybranego języka obcego.
async function saveWordToDatabase(baseWord, translatedWord) {
    if (!deckId) {
        console.error('Błąd: Brak deckId w adresie URL.');
        alert('Ostrzeżenie: Brak ID talii w pasku adresu (np. ?deckId=1).');
        return;
    }

    try {
        const response = await FiszkiAPI.apiFetch('/words/add', {
            method: 'POST',
            body: JSON.stringify({
                deck_id: parseInt(deckId, 10),
                base_word: baseWord,
                translation: translatedWord,
            }),
        });
        const data = await response.json();

        if (data.success) {
            wordsList.push({ id: data.id, base: baseWord, translation: translatedWord });
            renderWords();
        } else {
            alert('Błąd zapisu: ' + data.message);
        }
    } catch (error) {
        console.error('Błąd połączenia z serwerem bazodanowym:', error);
    }
}

// --- POBIERANIE SŁÓWEK Z BAZY ---
async function fetchWordsFromDatabase() {
    if (!deckId) return;

    try {
        const response = await FiszkiAPI.apiFetch('/words/get', {
            method: 'POST',
            body: JSON.stringify({ deckId: parseInt(deckId, 10) }),
        });
        const data = await response.json();

        if (data.success) {
            wordsList = data.words;
            renderWords();
        } else {
            console.error('Błąd pobierania bazy:', data.message);
        }
    } catch (error) {
        console.error('Błąd połączenia z serwerem pobierania:', error);
    }
}

function renderWords() {
    wordsListContainer.innerHTML = '';
    wordsList.forEach(word => {
        const li = document.createElement('li');
        li.className = 'word-item';
        li.innerHTML = `
            <div>
                <div class="word-base">${word.base}</div>
                <div class="word-translation">${word.translation}</div>
            </div>
            <button class="btn-remove-word" data-id="${word.id}">✖</button>
        `;
        wordsListContainer.appendChild(li);
    });
    wordCounter.innerText = wordsList.length;
}

document.getElementById('add-word-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    const query = inputBase.value.trim();
    if (!query) return;

    // Zawsze tłumaczymy Z wybranego języka obcego NA polski (|pl) —
    // kierunek nie jest już wyborem użytkownika.
    const langPair = `${foreignLangSelect.value}|pl`;

    btnSubmit.disabled = true;
    btnSubmit.innerText = '⏳ Tłumaczę...';

    try {
        const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(query)}&langpair=${langPair}`);
        const data = await res.json();

        let translatedText = query;
        if (data && data.responseData && data.responseData.translatedText) {
            translatedText = data.responseData.translatedText;
        }

        // query = słowo obce (to, co user wpisał) -> base
        // translatedText = polski odpowiednik -> translation
        await saveWordToDatabase(query, translatedText.toLowerCase());

        inputBase.value = '';
        document.getElementById('base-counter').innerText = '0';
        inputBase.focus();
    } catch (err) {
        alert('Błąd połączenia z tłumaczem MyMemory.');
    } finally {
        btnSubmit.disabled = false;
        btnSubmit.innerText = '➕ Przetłumacz i dodaj';
    }
});

async function removeWord(id) {
    if (!confirm('Czy na pewno chcesz bezpowrotnie usunąć to słówko?')) return;

    try {
        const response = await FiszkiAPI.apiFetch('/words/delete', {
            method: 'POST',
            body: JSON.stringify({ wordId: id }),
        });
        const data = await response.json();
        if (data.success) {
            wordsList = wordsList.filter((w) => w.id !== id);
            renderWords();
        } else {
            alert('Błąd bazy danych: ' + data.message);
        }
    } catch (error) {
        console.error('Błąd połączenia:', error);
        alert('Nie udało się połączyć z serwerem, aby usunąć słówko.');
    }
}

// --- SKANOWANIE ZDJĘĆ PRZEZ GEMINI ---
const btnScanPhoto = document.getElementById('btn-scan-photo');
const imageUpload = document.getElementById('image-upload');
const scanLabel = document.getElementById('scan-label');

btnScanPhoto.addEventListener('click', () => imageUpload.click());

imageUpload.addEventListener('change', function () {
    const file = this.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function (e) {
        const base64Image = e.target.result;

        scanLabel.innerText = '⏳ Skanowanie przez AI (to może potrwać)...';
        btnScanPhoto.style.pointerEvents = 'none';
        btnScanPhoto.style.opacity = '0.7';

        try {
            const response = await FiszkiAPI.apiFetch('/scan-ai', {
                method: 'POST',
                body: JSON.stringify({
                    image: base64Image,
                    foreignLang: foreignLangSelect.value, // target jest zawsze 'pl' po stronie backendu
                }),
            });
            const result = await response.json();

            if (result.success && result.words && Array.isArray(result.words)) {
                alert(`Znalazłem ${result.words.length} słówek! Rozpoczynam dodawanie do bazy...`);

                for (const word of result.words) {
                    if (word.base && word.translation) {
                        await saveWordToDatabase(word.base.trim(), word.translation.trim());
                    }
                }

                alert('Gotowe! Wszystkie zeskanowane słówka zostały zapisane.');
            } else {
                alert('Błąd skanowania: ' + (result.message || 'Model nie zwrócił poprawnych danych.'));
                console.error('Szczegóły błędu:', result);
            }
        } catch (error) {
            console.error('Błąd sieci:', error);
            alert('Wystąpił problem z połączeniem z serwerem.');
        } finally {
            scanLabel.innerText = 'Skanuj ze zdjęcia (AI)';
            btnScanPhoto.style.pointerEvents = 'auto';
            btnScanPhoto.style.opacity = '1';
            imageUpload.value = '';
        }
    };
    reader.readAsDataURL(file);
});

document.getElementById('btn-start-learning').addEventListener('click', () => {
    window.location.href = 'nauka.html' + window.location.search;
});

(async function init() {
    const authed = await FiszkiAPI.requireAuth();
    if (!authed) return;

    document.getElementById('display-username').innerText = localStorage.getItem('currentUser') || 'User';

    if (!deckId) {
        alert('Błąd: Brak ID talii w adresie URL!');
        window.location.href = 'Tworzenie.html';
        return;
    }

    fetchWordsFromDatabase();

    wordsListContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('btn-remove-word')) {
            removeWord(Number(e.target.dataset.id));
        }
    });
})();