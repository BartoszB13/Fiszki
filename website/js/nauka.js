let bazaSlownictwa = {};
const urlParams = new URLSearchParams(window.location.search);
const deckId = urlParams.get('deckId');

function goBackToDeck() {
    window.location.href = 'import.html?deckId=' + deckId;
}

async function loadWords() {
    try {
        const response = await FiszkiAPI.apiFetch('/words/get', {
            method: 'POST',
            body: JSON.stringify({ deckId: parseInt(deckId, 10) }),
        });
        const data = await response.json();

        if (data.success) {
            data.words.forEach((word) => {
                bazaSlownictwa[word.base] = word.translation;
            });

            const count = Object.keys(bazaSlownictwa).length;
            if (count > 0) {
                document.getElementById('loading-screen').classList.add('hidden');
                startSession(bazaSlownictwa);
            } else {
                document.getElementById('loading-text').innerText = 'Talia jest pusta. Dodaj najpierw słówka!';
                document.getElementById('btn-back-empty').classList.remove('hidden');
            }
        } else {
            document.getElementById('loading-text').innerText = 'Wystąpił błąd podczas ładowania talii.';
            document.getElementById('btn-back-empty').classList.remove('hidden');
        }
    } catch (error) {
        console.error(error);
        document.getElementById('loading-text').innerText = 'Błąd połączenia z bazą.';
        document.getElementById('btn-back-empty').classList.remove('hidden');
    }
}

let currentDeck = [];
let mistakesDeck = {};
let currentIndex = 0;
let correctCount = 0;
let totalCardsInSession = 0;

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function startSession(sourceDictionary) {
    let entries = Object.entries(sourceDictionary);
    currentDeck = shuffleArray(entries);

    mistakesDeck = {};
    currentIndex = 0;
    correctCount = 0;
    totalCardsInSession = currentDeck.length;

    document.getElementById('summary-screen').classList.add('hidden');
    document.getElementById('flashcard-screen').classList.remove('hidden');

    loadCard();
}

function startNewSession() {
    startSession(bazaSlownictwa);
}

function loadCard() {
    if (currentIndex < currentDeck.length) {
        const [ang, pol] = currentDeck[currentIndex];

        document.getElementById('card-counter').innerText = `${currentIndex + 1} / ${totalCardsInSession}`;
        document.getElementById('english-word').innerText = ang;
        document.getElementById('polish-word').querySelector('span').innerText = pol;

        document.getElementById('polish-word').style.display = 'none';
        document.getElementById('btn-show-translation').classList.remove('hidden');
        document.getElementById('evaluation-buttons').classList.add('hidden');
    } else {
        endSession();
    }
}

function showTranslation() {
    document.getElementById('polish-word').style.display = 'block';
    document.getElementById('btn-show-translation').classList.add('hidden');
    document.getElementById('evaluation-buttons').classList.remove('hidden');
}

function evaluateAnswer(knewIt) {
    const [ang, pol] = currentDeck[currentIndex];

    if (knewIt) {
        correctCount++;
    } else {
        mistakesDeck[ang] = pol;
    }

    currentIndex++;
    loadCard();
}

function startMistakesSession() {
    startSession(mistakesDeck);
}

function endSession() {
    document.getElementById('flashcard-screen').classList.add('hidden');
    document.getElementById('summary-screen').classList.remove('hidden');

    document.getElementById('stat-total').innerText = currentIndex;
    document.getElementById('stat-correct').innerText = correctCount;
    document.getElementById('stat-mistakes').innerText = Object.keys(mistakesDeck).length;

    const mistakesContainer = document.getElementById('mistakes-container');
    const mistakesListUl = document.getElementById('mistakes-list-ul');
    const btnRetry = document.getElementById('btn-retry-mistakes');
    const congratsMsg = document.getElementById('congratulations-msg');

    mistakesListUl.innerHTML = '';

    if (Object.keys(mistakesDeck).length > 0) {
        mistakesContainer.classList.remove('hidden');
        btnRetry.classList.remove('hidden');
        congratsMsg.classList.add('hidden');

        // textContent zamiast innerHTML - słówka pochodzą z bazy danych
        // użytkownika i nie powinny być interpretowane jako HTML.
        for (const [ang, pol] of Object.entries(mistakesDeck)) {
            const li = document.createElement('li');
            const strong = document.createElement('strong');
            strong.textContent = ang;
            li.appendChild(strong);
            li.appendChild(document.createTextNode(pol));
            mistakesListUl.appendChild(li);
        }
    } else {
        mistakesContainer.classList.add('hidden');
        btnRetry.classList.add('hidden');
        congratsMsg.classList.toggle('hidden', currentIndex === 0);
    }
}

document.addEventListener('keydown', function (event) {
    const flashcardScreen = document.getElementById('flashcard-screen');
    if (flashcardScreen.classList.contains('hidden')) return;

    const evalButtonsHidden = document.getElementById('evaluation-buttons').classList.contains('hidden');

    if (evalButtonsHidden && (event.key === 'Enter' || event.key === ' ')) {
        showTranslation();
    } else if (!evalButtonsHidden) {
        const key = event.key.toLowerCase();
        if (key === 't') evaluateAnswer(true);
        else if (key === 'n') evaluateAnswer(false);
        else if (key === 'q') endSession();
    }
});

(async function init() {
    const authed = await FiszkiAPI.requireAuth();
    if (!authed) return;

    if (!deckId) {
        alert('Błąd: Brak ID talii w adresie URL!');
        window.location.href = 'Tworzenie.html';
        return;
    }

    document.getElementById('btn-back-empty').addEventListener('click', goBackToDeck);
    document.getElementById('btn-show-translation').addEventListener('click', showTranslation);
    document.getElementById('btn-eval-no').addEventListener('click', () => evaluateAnswer(false));
    document.getElementById('btn-eval-yes').addEventListener('click', () => evaluateAnswer(true));
    // UWAGA: id musi dokładnie zgadzać się z HTML - "btn-end-session" (bez "-1").
    document.getElementById('btn-end-session').addEventListener('click', endSession);
    document.getElementById('btn-back-to-deck-1').addEventListener('click', goBackToDeck);
    document.getElementById('btn-new-session').addEventListener('click', startNewSession);
    document.getElementById('btn-retry-mistakes').addEventListener('click', startMistakesSession);
    document.getElementById('btn-back-to-deck-2').addEventListener('click', goBackToDeck);

    loadWords();
})();