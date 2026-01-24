// 1. VARIABLES GLOBALS
let currentUser = localStorage.getItem("vocab_app_user") || "Usuari 1";
let progress = JSON.parse(localStorage.getItem("vocab_progress") || "{}");
let userWords = JSON.parse(localStorage.getItem("user_words") || "[]");
let dadesGlobals = [];
let filteredList = [];
let currentWord = null;
let currentStreak = 0;

// Forcem que el selector visual coincideixi amb la variable al carregar la pàgina
window.addEventListener("DOMContentLoaded", () => {
  const selector = document.getElementById("user-selector");
  if (selector) {
    selector.value = currentUser;
  }
});

const SHEET_URL =
  "https://script.google.com/macros/s/AKfycbxe46msC2XuGNUEk53E0jn6d1r-hWL0056PZ2PHGzK5xdmSoJV1Ro09ElmKNtVo3vg/exec";

// 2. CARREGA DE DADES (Núvol)
async function loadCloudData() {
  console.log(
    `Intentant connectar amb el núvol per a l'usuari: ${currentUser}...`,
  );

  try {
    // Fem la petició simple per evitar problemes de CORS
    const response = await fetch(SHEET_URL);
    const cloudData = await response.json();

    // A. VOCABULARI: Es carrega tot (comú per a tothom)
    if (cloudData.vocab) {
      userWords = cloudData.vocab.filter(
        (item) => item.headword && String(item.headword).trim() !== "",
      );
    }

    // B. PROGRÉS: FILTRE MULTIUSUARI
    if (cloudData.progress) {
      progress = {}; // Netegem la variable global
      cloudData.progress.forEach((p) => {
        // IMPORTANT: Forcem comparació de text i eliminem espais
        if (String(p.user_id).trim() === String(currentUser).trim()) {
          progress[p.headword] = p;
        }
      });

      // AQUESTA ÉS LA CLAU: Actualitzem el localStorage amb el que hem baixat del Sheets
      // perquè les funcions com 'renderStudyCard' llegeixin les dades noves.
      localStorage.setItem("vocab_progress", JSON.stringify(progress));
    }

    // Inicialitzem dades i apliquem filtres
    initializeData();
    applyFilters();

    // Refrescar vistes segons la secció activa
    const studyView = document.getElementById("view-study");
    const bookView = document.getElementById("view-book");

    if (studyView && !studyView.classList.contains("hidden")) {
      if (filteredList.length > 0) nextWord();
      else renderStudyCard();
    }

    if (bookView && !bookView.classList.contains("hidden")) {
      renderBook();
    }

    console.log(`Sincronització completada per a ${currentUser}.`);
  } catch (e) {
    console.error("Error connectant al núvol, carregant dades locals:", e);
    // En cas d'error (offline), intentem carregar el que hi hagi en local
    initializeData();
    applyFilters();
  }
} // <--- Aquest tanca la funció loadCloudData

// 3. ENGEGADA
window.onload = () => {
  loadCloudData(); // En lloc de initializeData(), ara cridem primer al núvol
};

// Funcio de Inicialització.
function initializeData() {
  const baseWords = typeof dades !== "undefined" ? [...dades] : [];
  const combined = [...baseWords, ...userWords];

  const uniqueMap = new Map();

  combined.forEach((item) => {
    // 1. FILTRE DE SEGURETAT: Si no hi ha headword, ignorem la fila
    // Això evita que files buides de Google Sheets trenquin l'app
    if (!item || !item.headword) return;

    // 2. PROTECCIÓ: Google Sheets envia el text de la cel·la.
    // Si 'categories' és un text, el convertim en Array.
    if (typeof item.categories === "string") {
      item.categories = item.categories
        .split(",")
        .map((c) => c.trim())
        .filter((c) => c);
    } else if (!item.categories) {
      item.categories = [];
    }

    // El mateix per a 'userSentences' (frases d'exemple)
    if (typeof item.userSentences === "string") {
      item.userSentences = item.userSentences
        .split("\n")
        .map((s) => s.trim())
        .filter((s) => s);
    } else if (!item.userSentences) {
      item.userSentences = [];
    }

    uniqueMap.set(item.headword, item);
  });

  // 3. ORDENACIÓ ROBUSTA
  dadesGlobals = Array.from(uniqueMap.values()).sort((a, b) => {
    // Forçem que tot sigui String abans de comparar
    const wordA = String(a.headword || "");
    const wordB = String(b.headword || "");
    return wordA.localeCompare(wordB, "en", { sensitivity: "base" });
  });

  console.log(
    "DadesGlobals inicialitzades amb",
    dadesGlobals.length,
    "paraules.",
  );
}

// 3. NAVEGACIÓ I FILTRES
function router(view) {
  document.querySelectorAll(".view").forEach((v) => v.classList.add("hidden"));
  document.getElementById(`view-${view}`).classList.remove("hidden");
  const filterBar = document.getElementById("common-filters");

  if (view === "stats") {
    filterBar.style.display = "none";
    renderStats();
  } else {
    filterBar.style.display = "flex";
    if (view === "book") renderBook();
    if (view === "study") renderStudyCard();
  }
  document
    .querySelectorAll(".main-nav button")
    .forEach((b) => b.classList.remove("active"));
  document.getElementById(`nav-${view}`).classList.add("active");

  if (view === "study") {
    nextWord(); // Cada cop que entris a Study, canvia de paraula
  }
}
// FILTRES
function applyFilters() {
  const cefr = document.getElementById("f-cefr").value;
  const status = document.getElementById("f-status").value;
  const cat = document.getElementById("f-category").value;

  const searchInput = document.getElementById("f-search");
  const search = searchInput ? searchInput.value.toLowerCase() : "";

  // 1. Re-calculem la llista filtrada
  filteredList = dadesGlobals.filter((item) => {
    // --- SEGURETAT: Si l'item no té headword o no és text, el saltem ---
    if (!item || !item.headword) return false;

    // Convertim headword a String per seguretat (per si és un número)
    const hWord = String(item.headword).toLowerCase();
    // ------------------------------------------------------------------

    const matchCefr =
      cefr === "ALL" || (cefr === "NONE" && !item.cefr) || item.cefr === cefr;

    const currentStat = progress[item.headword]?.status || "new";
    const matchStatus = status === "ALL" || currentStat === status;

    // Filtre de categories (Cambridge compatible)
    let matchCat = cat === "ALL";
    if (!matchCat && item.categories) {
      const itemCats = Array.isArray(item.categories)
        ? item.categories
        : String(item.categories)
            .split(",")
            .map((c) => c.trim());

      matchCat = itemCats.some(
        (c) => String(c).toLowerCase() === cat.toLowerCase(),
      );
    }

    // Filtre de cerca (Lupa) revisat per ser immune a errors
    const translation = item.translation
      ? String(item.translation).toLowerCase()
      : "";
    const matchSearch = hWord.includes(search) || translation.includes(search);

    return matchCefr && matchStatus && matchCat && matchSearch;
  });

  // 2. REFRESC PER A STUDY
  const isStudyView = !document
    .getElementById("view-study")
    .classList.contains("hidden");
  if (isStudyView) {
    if (!currentWord || !filteredList.includes(currentWord)) {
      nextWord();
    } else {
      renderStudyCard();
    }
  }

  // 3. REFRESC PER A BOOK
  const isBookView = !document
    .getElementById("view-book")
    .classList.contains("hidden");
  if (isBookView) {
    renderBook();
  }
}

// 4. VISTA STUDY
function nextWord() {
  if (filteredList.length === 0) {
    currentWord = null; // Important fer-ho null si no hi ha res
    document.getElementById("main-card").innerHTML = `
      <div style="padding:60px; text-align:center; background:white; border-radius:12px;">
        <h3 style="color:#666;">No words found</h3>
        <p>Try adjusting your filters (Level, Status or Category).</p>
      </div>`;
    return;
  }

  const randomIndex = Math.floor(Math.random() * filteredList.length);
  currentWord = filteredList[randomIndex];
  renderStudyCard();
}

function renderStudyCard() {
  const container = document.getElementById("main-card");
  if (!container || !currentWord) return;

  // 1. Càlculs i dades del progrés
  const totalKnown = Object.values(progress).filter(
    (p) => p.status === "known",
  ).length;
  const studiedToday = getWordsStudiedToday();

  const wordStatus = progress[currentWord.headword]?.status || "new";
  const statusLabels = {
    new: { text: "🆕 New", class: "status-new" },
    learning: { text: "📖 Learning", class: "status-learning" },
    known: { text: "✅ Known", class: "status-known" },
  };
  const currentStatus = statusLabels[wordStatus];

  const urlWord = encodeURIComponent(currentWord.headword.toLowerCase());

  // 2. Generem el contingut
  container.innerHTML = `
        <div class="card-header-stats">
            <div class="cefr-badge">${currentWord.cefr || "---"}</div>
            <div class="status-pill-indicator ${currentStatus.class}">
                ${currentStatus.text}
            </div>

            <div class="stat-pill" style="background: #fff8e1; border: 1px solid #ffca28; color: #856404;">
                🎯 Today: <strong>${studiedToday}</strong>
            </div>
            <div class="stat-pill">🔥 Streak: ${currentStreak}</div>
            <div class="stat-pill">🏅 Total: ${totalKnown}</div>
            
            <div class="card-actions-top">
                <button onclick="openEditModal()" class="btn-edit-small">✏️ Edit</button>
                <button onclick="updateStatus('learning')" class="btn-status learning">Still Learning</button>
                <button onclick="updateStatus('known')" class="btn-status known">I Know It</button>
                <button onclick="nextWord()" class="btn-status next">Next ➔</button>
            </div>
        </div>
        
        <div class="card-body">
            <div class="headword-row" style="display: flex; align-items: center; gap: 15px; margin-bottom: 5px;">
                <h2 style="margin: 0;">${currentWord.headword}</h2>
                <div class="audio-controls" style="display: flex; align-items: center; gap: 10px;">
                    <span class="phonetic-text" style="color: #666; font-size: 1.1rem;">
                        ${currentWord.phonetic || ""}
                    </span>
                   <button onclick="speakWord('${String(currentWord.headword).replace(/'/g, "\\'")}')" class="btn-audio" title="Listen UK English">
                      🔊
                   </button>
                </div>
            </div>
            <div class="word-cat-container">
                 ${(Array.isArray(currentWord.categories)
                   ? currentWord.categories
                   : currentWord.categories
                     ? currentWord.categories.split(",")
                     : []
                 )
                   .map(
                     (cat) =>
                       `<span class="cambridge-label">${cat.trim()}</span>`,
                   )
                   .join("")}
            </div>
            
            <div class="info-block">
                <strong>Definition:</strong>
                <p>${currentWord.definition || "No definition available."}</p>
            </div>
            
            <div class="info-block">
                <strong>Examples:</strong>
                <ul>${(currentWord.userSentences || []).map((s) => `<li>${s}</li>`).join("")}</ul>
            </div>

            <div class="practise-box">
                <strong>Practise:</strong>
                <div class="practise-input-group">
                    <input type="text" id="practice-input" placeholder="Type the word here..." onkeyup="checkPractice(this)">
                    <button class="btn-reveal" onclick="revealLetter()">Hint</button>
                </div>
                <p id="practice-feedback" class="hidden"></p>
            </div>

            <details>
                <summary>Show Translation</summary>
                <p class="trans-text">${currentWord.translation || "---"}</p>
            </details>

            <div class="dictionaries-box">
                <strong>External Dictionaries:</strong>
                <div class="dict-icons">
                    <a href="https://dictionary.cambridge.org/dictionary/english/${urlWord}" target="_blank" title="Cambridge Dictionary" class="dict-link cambridge"></a>
                    <a href="https://www.collinsdictionary.com/dictionary/english/${urlWord}" target="_blank" title="Collins Dictionary" class="dict-link collins"></a>
                    <a href="https://www.merriam-webster.com/dictionary/${urlWord}" target="_blank" title="Merriam-Webster" class="dict-link merriam"></a>
                    <a href="https://www.britannica.com/dictionary/${urlWord}" target="_blank" title="Britannica" class="dict-link britannica"></a>
                </div>
            </div>
        </div>`;
}

function showSuccessAnimation() {
  const overlay = document.createElement("div");
  overlay.className = "feedback-overlay";
  overlay.innerHTML = `<span class="medal-anim">🏅</span><br><b>Good Job!</b>`;
  document.body.appendChild(overlay);
  setTimeout(() => overlay.remove(), 1000);
}

async function updateStatus(newStatus) {
  if (!currentWord) return;

  // SEGURETAT: Si currentUser és indefinit, agafa el valor del selector o el per defecte
  if (!currentUser || currentUser === "undefined") {
    currentUser = document.getElementById("user-selector").value || "Usuari_1";
  }

  // 1. Feedback visual (Celebració)
  if (newStatus === "known") {
    const cardBody = document.querySelector(".card-body");
    if (cardBody) {
      const overlay = document.createElement("div");
      overlay.className = "celebration-overlay";
      overlay.innerHTML = `<div>🏅</div><p>Good Job!</p>`;
      cardBody.appendChild(overlay);
    }
  }

  // 2. Preparem l'objecte de progrés incloent l'usuari actual
  const progressData = {
    user_id: currentUser, // <--- AQUESTA ÉS LA CLAU: Identifiquem qui ets
    headword: currentWord.headword,
    status: newStatus,
    date: new Date().toISOString(),
  };

  // Actualitzem localment
  progress[currentWord.headword] = progressData;
  localStorage.setItem("vocab_progress", JSON.stringify(progress));

  // 3. Enviem al Google Sheets (Multi-user ready)
  fetch(SHEET_URL, {
    method: "POST",
    mode: "no-cors",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "saveProgress",
      data: progressData, // Ara aquest objecte ja porta el user_id a dins
    }),
  }).catch((e) => console.error("Error sincronitzant:", e));

  // 4. Gestió del canvi de paraula
  if (newStatus === "known") {
    currentStreak++;
    setTimeout(() => {
      nextWord();
    }, 600);
  } else {
    renderStudyCard();
  }
}

// 5. VISTA BOOK I EDICIÓ
function renderBook() {
  const tbody = document.getElementById("book-list");
  tbody.innerHTML = filteredList
    .map((item) => {
      const p = progress[item.headword] || { status: "new" };
      // Dins del .map de renderBook:
      const safeWord = item.headword.replace(/'/g, "\\'"); // Escapa l'apòstrof: ' passa a \'

      return `
    <tr>
        <td><strong>${item.headword}</strong></td>
        <td><span class="badge-cefr">${item.cefr || "-"}</span></td>
        <td><small>${(item.categories || []).join(", ")}</small></td>
        <td><span class="status-tag ${p.status}">${p.status.toUpperCase()}</span></td>
        <td>
            <button onclick="editFromBook('${safeWord}')" class="btn-icon">✏️</button>
        </td>
    </tr>`;
    })
    .join("");
}

// Aquesta funció és la que crida el botó llapis ✏️ del llistat
function editFromBook(name) {
  // Busquem la paraula a la llista global
  const wordToEdit = dadesGlobals.find((w) => w.headword === name);

  if (wordToEdit) {
    currentWord = wordToEdit; // Marquem aquesta com la paraula activa

    // 1. Canviem el títol del modal per saber què editem
    document.getElementById("modal-title").innerText =
      `Editing: ${currentWord.headword}`;

    // 2. Amaguem el camp d'introduir nom nou
    document.getElementById("new-headword-container").style.display = "none";

    // 3. Omplim el formulari amb la info que ja tenim
    document.getElementById("edit-cefr").value = currentWord.cefr || "";
    document.getElementById("edit-cat").value = (
      currentWord.categories || []
    ).join(", ");
    document.getElementById("edit-trans").value = currentWord.translation || "";
    document.getElementById("edit-def").value = currentWord.definition || "";
    document.getElementById("edit-ex").value = (
      currentWord.userSentences || []
    ).join("\n");

    // 4. Mostrem el modal (assegura't que l'ID sigui modal-edit)
    document.getElementById("modal-edit").classList.remove("hidden");
  }
}

// Aquesta funció s'encarrega d'obrir el modal i netejar-lo si és una paraula nova
function openEditModal(wordParam = null) {
  const modal = document.getElementById("modal-edit");
  const title = document.getElementById("modal-title");
  const headwordContainer = document.getElementById("new-headword-container");
  const headwordInput = document.getElementById("new-headword");

  // Decidim quina paraula anem a editar
  const targetWord = wordParam || currentWord;

  if (targetWord && !modal.dataset.isAdding) {
    // CAS: EDICIÓ
    title.innerText = `Editing: ${targetWord.headword}`;
    headwordContainer.style.display = "none";
    currentWord = targetWord; // Ens assegurem que sigui la activa

    // Omplim els camps (Arrays a text)
    document.getElementById("edit-cefr").value = targetWord.cefr || "";
    document.getElementById("edit-phonetic").value = targetWord.phonetic || "";
    document.getElementById("edit-cat").value = Array.isArray(
      targetWord.categories,
    )
      ? targetWord.categories.join(", ")
      : targetWord.categories || "";

    document.getElementById("edit-trans").value = targetWord.translation || "";
    document.getElementById("edit-def").value = targetWord.definition || "";

    document.getElementById("edit-ex").value = Array.isArray(
      targetWord.userSentences,
    )
      ? targetWord.userSentences.join("\n")
      : targetWord.userSentences || "";
  } else {
    // CAS: ALTA NOVA (+ Add Word)
    title.innerText = "Add New Word";
    headwordContainer.style.display = "block";
    headwordInput.value = "";

    // Netegem la resta de camps
    document.getElementById("edit-cefr").value = "A1";
    document.getElementById("edit-phonetic").value = "";
    document.getElementById("edit-cat").value = "";
    document.getElementById("edit-trans").value = "";
    document.getElementById("edit-def").value = "";
    document.getElementById("edit-ex").value = "";

    // Si estem en alta nova, no hi ha paraula actual fins que es guardi
    const isStudyView = !document
      .getElementById("view-study")
      .classList.contains("hidden");
    if (!isStudyView) currentWord = null;
  }

  modal.classList.remove("hidden");
  delete modal.dataset.isAdding; // Netegem la marca per al proper cop
  renderCategorySuggestions();
}

async function saveChanges() {
  const modalTitle = document.getElementById("modal-title").innerText;
  let isNew = modalTitle.includes("Add New Word");
  let wordData = {};

  // 1. Gestió del nom de la paraula (Headword)
  if (isNew) {
    const headwordValue = document.getElementById("new-headword").value.trim();
    if (!headwordValue) return alert("Please enter a word name");

    const exists = dadesGlobals.some(
      (w) => w.headword.toLowerCase() === headwordValue.toLowerCase(),
    );
    if (exists) return alert("This word already exists!");

    wordData.headword = headwordValue;
    userWords.push(wordData); // L'afegim al llistat de l'usuari
  } else {
    // Si editem, treballem sobre la que ja teníem
    wordData = currentWord;
  }

  // 2. Recollida dades i conversió a Arrays per a l'ús intern de l'App
  wordData.cefr = document.getElementById("edit-cefr").value;
  wordData.categories = document
    .getElementById("edit-cat")
    .value.split(",")
    .map((c) => c.trim())
    .filter((c) => c);
  wordData.phonetic = document.getElementById("edit-phonetic").value.trim();
  wordData.translation = document.getElementById("edit-trans").value;
  wordData.definition = document.getElementById("edit-def").value;
  wordData.userSentences = document
    .getElementById("edit-ex")
    .value.split("\n")
    .map((s) => s.trim())
    .filter((s) => s);

  // 3. Preparació per al Núvol (Enviem categories i frases com a TEXT pla)
  const dataForCloud = {
    ...wordData,
    categories: wordData.categories.join(", "),
    userSentences: wordData.userSentences.join("\n"),
  };

  // 4. Guardat ràpid local (LocalStorage)
  localStorage.setItem("user_words", JSON.stringify(userWords));

  // 5. Enviament al Google Sheets
  try {
    fetch(SHEET_URL, {
      method: "POST",
      mode: "no-cors", // Crucial per evitar errors de CORS amb Google
      body: JSON.stringify({
        type: "saveWord",
        data: dataForCloud,
      }),
    });
    console.log("Enviant canvis al núvol...");
  } catch (error) {
    console.error("Error al sincronitzar:", error);
  }

  // 6. Refresc de la interfície
  closeEditModal();
  initializeData();
  applyFilters();

  // Decidim què mostrar després de guardar
  if (!document.getElementById("view-book").classList.contains("hidden")) {
    renderBook();
  } else {
    currentWord = wordData;
    renderStudyCard();
  }
}

function closeEditModal() {
  document.getElementById("modal-edit").classList.add("hidden");
  // Molt important: Al tancar, resetejem la currentWord perquè el proper cop
  // que cliquem "+ Add Word" no recordi l'anterior.
  // Però només si NO estem a la vista Study!
  const isStudyView = !document
    .getElementById("view-study")
    .classList.contains("hidden");
  if (!isStudyView) {
    currentWord = null;
  }
}

// STATS Funció per calcular les paraules d'avui
function getWordsStudiedToday() {
  const avui = new Date().toISOString().split("T")[0];
  return Object.values(progress).filter((p) => {
    // Verifiquem que sigui 'known' i que la data coincideixi amb avui
    if (!p.date || p.status !== "known") return false;

    // Acceptem tant format ISO com format de data de Google Sheets
    const dataString =
      typeof p.date === "string" ? p.date : new Date(p.date).toISOString();
    return dataString.startsWith(avui);
  }).length;
}

// 6. VISTA STATS
// 2. Modificació de renderStats() per incloure el comptador
function renderStats() {
  const container = document.getElementById("view-stats");
  const totalGlobal = dadesGlobals.length;
  const knownGlobal = Object.values(progress).filter(
    (p) => p.status === "known",
  ).length;
  const studiedToday = getWordsStudiedToday();
  const percent = Math.round((knownGlobal / totalGlobal) * 100) || 0;

  let html = `
    <div class="global-summary-modern">
        <div class="stats-row-top">
            <div class="stat-card-modern today">
                <span class="stat-icon">🎯</span>
                <div class="stat-content">
                    <span class="stat-label">Studied Today</span>
                    <strong class="stat-value">${studiedToday}</strong>
                </div>
            </div>
            <div class="stat-card-modern total">
                <span class="stat-icon">📚</span>
                <div class="stat-content">
                    <span class="stat-label">Total Words</span>
                    <strong class="stat-value">${totalGlobal}</strong>
                </div>
            </div>
            <div class="stat-card-modern known">
                <span class="stat-icon">🏅</span>
                <div class="stat-content">
                    <span class="stat-label">Total Known</span>
                    <strong class="stat-value">${knownGlobal}</strong>
                </div>
            </div>
            <div class="stat-card-modern percent">
                <span class="stat-icon">📈</span>
                <div class="stat-content">
                    <span class="stat-label">Completion</span>
                    <strong class="stat-value">${percent}%</strong>
                </div>
            </div>
        </div>
        <div class="progress-bar-container-top">
            <div class="progress-bar-big"><div style="width:${percent}%"></div></div>
        </div>
    </div>
    
    <div class="levels-container-slim">`;

  ["A1", "A2", "B1", "B2", "C1", "C2"].forEach((lvl) => {
    const words = dadesGlobals.filter((w) => w.cefr === lvl);
    if (words.length === 0) return;
    const known = words.filter(
      (w) => progress[w.headword]?.status === "known",
    ).length;
    const percentLvl = Math.round((known / words.length) * 100);
    const isMastered = known === words.length;

    html += `
          <div class="level-row-slim ${isMastered ? "mastered" : ""}">
              <div class="level-badge-slim">${lvl}</div>
              <div class="level-progress-info">
                  <span class="level-count"><strong>${known}</strong> / ${words.length} words</span>
                  <div class="mini-bar-slim"><div style="width:${percentLvl}%"></div></div>
                  <span class="level-percent">${percentLvl}%</span>
              </div>
              ${isMastered ? '<span class="mastery-icon">🏆</span>' : ""}
          </div>`;
  });

  container.innerHTML = html + `</div>`;
}

function resetAllData() {
  if (confirm("Are you sure? This will delete everything!")) {
    localStorage.clear();
    location.reload();
  }
}

function checkPractice(input) {
  const feedback = document.getElementById("practice-feedback");
  const val = input.value.trim().toLowerCase();
  const target = currentWord.headword.toLowerCase();

  if (val === target) {
    input.style.borderColor = "#2ecc71";
    input.style.backgroundColor = "#e6ffed";
    feedback.innerText = "✨ Correct!";
    feedback.className = "practice-success";

    // Actualitzem l'objecte progress localment
    if (!progress[currentWord.headword]) {
      progress[currentWord.headword] = {
        headword: currentWord.headword,
        status: "learning",
      };
    }

    progress[currentWord.headword].practiceCount =
      (progress[currentWord.headword].practiceCount || 0) + 1;
    progress[currentWord.headword].lastPractice = new Date().toISOString();

    // ENVIEM A GOOGLE SHEETS
    fetch(SHEET_URL, {
      method: "POST",
      body: JSON.stringify({
        type: "saveProgress",
        data: progress[currentWord.headword],
      }),
    });
  } else if (val.length > 0 && !target.startsWith(val)) {
    input.style.borderColor = "#e74c3c";
  }
}

function revealLetter() {
  const input = document.getElementById("practice-input");
  const target = currentWord.headword;
  const currentVal = input.value;

  // Revela la següent lletra
  input.value = target.substring(0, currentVal.length + 1);
  input.focus();
  checkPractice(input);
}

const CAMBRIDGE_LABELS = [
  "noun",
  "[C]",
  "[U]",
  "[S]",
  "plural",
  "verb",
  "[T]",
  "[I]",
  "phrasal verb",
  "adjective",
  "[before noun]",
  "comparative",
  "superlative",
  "adverb",
  "preposition",
  "conjunction",
  "determiner",
];

function renderCategorySuggestions() {
  const container = document.getElementById("category-suggestions");
  if (!container) return;

  container.innerHTML = CAMBRIDGE_LABELS.map(
    (label) =>
      `<span class="tag-suggestion" onclick="addLabelToInput('${label}')">${label}</span>`,
  ).join("");
}

function addLabelToInput(label) {
  const input = document.getElementById("edit-cat");
  let currentVal = input.value.trim();

  if (currentVal === "") {
    input.value = label;
  } else {
    // Si la etiqueta ja existeix, no la tornem a afegir
    const labels = currentVal.split(",").map((l) => l.trim());
    if (!labels.includes(label)) {
      input.value = currentVal + ", " + label;
    }
  }
  input.focus();
}

// Funció per pronunciar en Anglès Britànic (UK)
function speakWord(text) {
  // Cancel·lem qualsevol veu anterior per evitar encavalcaments
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-GB"; // British English
  utterance.rate = 0.85; // Velocitat lleugerament reduïda per a millor claredat
  utterance.pitch = 1;

  // Intentem forçar una veu britànica si el navegador en té diverses
  const voices = window.speechSynthesis.getVoices();
  const ukVoice = voices.find(
    (v) => v.lang === "en-GB" || v.lang.includes("GB"),
  );
  if (ukVoice) utterance.voice = ukVoice;

  window.speechSynthesis.speak(utterance);
}

// Actualitza renderStudyCard per mostrar la fonètica i el botó d'àudio
// Substitueix la part del títol h2 per aquest bloc:
/*
<div class="headword-row" style="display: flex; align-items: center; gap: 15px;">
    <h2>${currentWord.headword}</h2>
    <div class="audio-box" style="display: flex; align-items: center; gap: 8px;">
        <span class="phonetic-text" style="color: #666; font-size: 1.1rem;">
            ${currentWord.phonetic || ""}
        </span>
        <button onclick="speakWord('${currentWord.headword.replace(/'/g, "\\'")}')" class="btn-audio">
            🔊
        </button>
    </div>
</div>
*/

function switchUser(newUserName) {
  if (!newUserName) {
    // Si per algun motiu no arriba el nom, el busquem directament al selector
    newUserName = document.getElementById("user-selector").value;
  }

  console.log("Canviant a l'usuari:", newUserName);
  currentUser = newUserName;
  localStorage.setItem("vocab_app_user", newUserName);

  // Reiniciem el progrés local per forçar la càrrega del nou usuari
  progress = {};

  // Tornem a carregar les dades del núvol
  loadCloudData();
}
