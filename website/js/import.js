let wordsList = [];
const urlParams = new URLSearchParams(window.location.search);
const deckId = urlParams.get('deckId');

const wordsListContainer = document.getElementById('words-list');
const wordCounter = document.getElementById('word-counter');
const inputBase = document.getElementById('input-base');
const inputTranslation = document.getElementById('input-translation');
const btnSubmit = document.getElementById('btn-submit');
const btnAutoTranslate = document.getElementById('btn-auto-translate');
const translationHint = document.getElementById('translation-hint');

inputBase.addEventListener('input', () => {
    document.getElementById('base-counter').innerText = inputBase.value.length;
});

// Trzymamy ostatnią automatycznie wykrytą sugestię osobno od realnej
// wartości inputa - użytkownik może ją zaakceptować (przycisk/submit)
// albo ją zignorować i wpisać własne tłumaczenie ręcznie.
let currentSuggestion = null;
let debounceTimer = null;

function showHint(text, isError = false) {
    translationHint.innerText = text;
    translationHint.style.color = isError ? 'var(--danger)' : '#94A3B8';
    translationHint.classList.remove('hidden');
}

function clearHint() {
    translationHint.classList.add('hidden');
    translationHint.innerText = '';
}

/**
 * Wywołuje MyMemory z langpair="autodetect|pl" - MyMemory samo rozpoznaje
 * język źródłowy, więc użytkownik nie musi go wybierać z listy.
 * Zwraca string tłumaczenia albo null, jeśli się nie udało.
 */
async function detectAndTranslate(word) {
    const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(word)}&langpair=autodetect|pl`);
    const data = await res.json();
    if (data && data.responseData && data.responseData.translatedText) {
        return data.responseData.translatedText.toLowerCase();
    }
    return null;
}

// --- SUGESTIA "OPACITY TEXT" W TLE (placeholder) ---
// Po pauzie w pisaniu, jeśli pole tłumaczenia jest wciąż puste, pobieramy
// sugestię i wstawiamy ją jako placeholder (naturalnie wyszarzony/przezroczysty
// tekst w polu) - widoczna, ale nie nadpisuje tego, co user ewentualnie zacznie
// pisać. Jeśli user nic nie wpisze i wyśle formularz, użyjemy tej sugestii
// automatycznie (patrz submit handler niżej).
inputBase.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    currentSuggestion = null;

    if (inputTranslation.value.trim() !== '') return; // user już pisze własne tłumaczenie - nie przeszkadzamy

    const word = inputBase.value.trim();
    if (word.length < 2) {
        inputTranslation.placeholder = 'Tłumaczenie pojawi się tu automatycznie w miarę pisania...';
        clearHint();
        return;
    }

    debounceTimer = setTimeout(async () => {
        try {
            const suggestion = await detectAndTranslate(word);
            if (suggestion && inputTranslation.value.trim() === '') {
                currentSuggestion = suggestion;
                inputTranslation.placeholder = suggestion;
                showHint('Sugestia gotowa - wpisz własne tłumaczenie albo zostaw puste, aby jej użyć.');
            }
        } catch (err) {
            console.error('Błąd auto-sugestii tłumaczenia:', err);
        }
    }, 700);
});

// --- PRZYCISK "🪄 Auto": wymusza detekcję+tłumaczenie i wstawia je NAPRAWDĘ do pola ---
btnAutoTranslate.addEventListener('click', async () => {
    const word = inputBase.value.trim();
    if (!word) {
        showHint('Najpierw wpisz słowo.', true);
        return;
    }

    btnAutoTranslate.disabled = true;
    btnAutoTranslate.innerText = '⏳';
    clearHint();

    try {
        const suggestion = await detectAndTranslate(word);
        if (suggestion) {
            inputTranslation.value = suggestion;
            currentSuggestion = null; // wpisane na sztywno, nie jest już "tylko sugestią"
            showHint('Przetłumaczono automatycznie - możesz poprawić ręcznie.');
        } else {
            showHint('Nie udało się rozpoznać języka / przetłumaczyć. Wpisz tłumaczenie ręcznie.', true);
        }
    } catch (err) {
        console.error('Błąd auto-tłumaczenia:', err);
        showHint('Błąd połączenia z tłumaczem. Wpisz tłumaczenie ręcznie.', true);
    } finally {
        btnAutoTranslate.disabled = false;
        btnAutoTranslate.innerText = '🪄 Auto';
    }
});

// --- ZAPIS SŁÓWKA DO BAZY ---
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
    const baseWord = inputBase.value.trim();
    if (!baseWord) return;

    // Priorytet: to, co user faktycznie wpisał ręcznie -> jeśli puste,
    // spadamy na ostatnią automatyczną sugestię (ta trzymana w placeholderze) ->
    // jeśli i tej brak, prosimy o ręczne tłumaczenie zamiast zgadywać.
    let translation = inputTranslation.value.trim();
    if (!translation && currentSuggestion) {
        translation = currentSuggestion;
    }
    if (!translation) {
        showHint('Podaj tłumaczenie ręcznie albo poczekaj na automatyczną sugestię / użyj przycisku 🪄 Auto.', true);
        return;
    }

    btnSubmit.disabled = true;
    btnSubmit.innerText = '⏳ Zapisywanie...';

    try {
        await saveWordToDatabase(baseWord, translation);

        inputBase.value = '';
        inputTranslation.value = '';
        inputTranslation.placeholder = 'Tłumaczenie pojawi się tu automatycznie w miarę pisania...';
        currentSuggestion = null;
        clearHint();
        document.getElementById('base-counter').innerText = '0';
        inputBase.focus();
    } finally {
        btnSubmit.disabled = false;
        btnSubmit.innerText = '➕ Dodaj słówko';
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
// Gemini sam rozpoznaje język(i) na stronie i sam tłumaczy - żadna
// dodatkowa informacja o języku nie jest już wysyłana z frontendu.
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
                body: JSON.stringify({ image: base64Image }),
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