// =============================================
// CONFIGURAZIONE E VARIABILI GLOBALI
// =============================================

/**
 * Elenco dei dispositivi Shelly configurati
 * Ogni dispositivo contiene:
 * - id: Identificativo univoco del dispositivo
 * - auth_key: Chiave di autenticazione per l'API Shelly
 * - storage_key: Chiave per salvare il conteggio dei click in localStorage
 * - button_id: ID dell'elemento HTML del pulsante
 * - visible: Flag per la visibilità del pulsante nell'interfaccia
 */
const DEVICES = [
  {
    id: "e4b063f0c38c",
    auth_key:
      "MWI2MDc4dWlk4908A71DA809FCEC05C5D1F360943FBFC6A7934EC0FD9E3CFEAF03F8F5A6A4A0C60665B97A1AA2E2",
    storage_key: "clicks_MainDoor",
    button_id: "MainDoor",
    visible: true,
  },
  {
    id: "34945478d595",
    auth_key:
      "MWI2MDc4dWlk4908A71DA809FCEC05C5D1F360943FBFC6A7934EC0FD9E3CFEAF03F8F5A6A4A0C60665B97A1AA2E2",
    storage_key: "clicks_AptDoor",
    button_id: "AptDoor",
    visible: true,
  },
  {
    id: "3494547ab161",
    auth_key:
      "MWI2MDc4dWlk4908A71DA809FCEC05C5D1F360943FBFC6A7934EC0FD9E3CFEAF03F8F5A6A4A0C60665B97A1AA2E2",
    storage_key: "clicks_ExtraDoor1",
    button_id: "ExtraDoor1",
    visible: false,
  },
  {
    id: "placeholder_id_2",
    auth_key: "placeholder_auth_key_2",
    storage_key: "clicks_ExtraDoor2",
    button_id: "ExtraDoor2",
    visible: false,
  },
];

// Configurazioni con valori di default
let MAX_CLICKS = parseInt(localStorage.getItem("max_clicks")) || 3;
let TIME_LIMIT_MINUTES =
  parseInt(localStorage.getItem("time_limit_minutes")) || 500;
const BASE_URL_SET =
  "https://shelly-73-eu.shelly.cloud/v2/devices/api/set/switch";
let CORRECT_CODE = localStorage.getItem("secret_code") || "2245";
const SECRET_KEY = "musart_secret_123_fixed_key";
const ADMIN_PASSWORD = "1122";

// Variabili di stato
let timeCheckInterval;
let currentDevice = null; // Dispositivo selezionato per l'apertura

// Gestione versione codice per forzare il reset alla modifica
const CODE_VERSION_KEY = "code_version";
let currentCodeVersion = parseInt(localStorage.getItem(CODE_VERSION_KEY)) || 1;

// =============================================
// FUNZIONI DI STORAGE (localStorage e cookie)
// =============================================

/**
 * Salva un valore in localStorage e come cookie
 * @param {string} key - Chiave per il salvataggio
 * @param {string} value - Valore da salvare
 * @param {number} minutes - Durata in minuti
 */
function setStorage(key, value, minutes) {
  try {
    localStorage.setItem(key, value);
    const expirationDate = new Date();
    expirationDate.setTime(expirationDate.getTime() + minutes * 60 * 1000);
    const expires = "expires=" + expirationDate.toUTCString();
    document.cookie = `${key}=${value}; ${expires}; path=/; SameSite=Strict`;
  } catch (error) {
    console.error("Errore nel salvataggio dei dati:", error);
  }
}

/**
 * Recupera un valore da localStorage o dai cookie
 * @param {string} key - Chiave del valore da recuperare
 * @returns {string|null} Valore recuperato o null
 */
function getStorage(key) {
  try {
    // Prima controlla nel localStorage
    const localValue = localStorage.getItem(key);
    if (localValue !== null) return localValue;

    // Se non trovato, cerca nei cookie
    const cookies = document.cookie.split(";");
    for (let cookie of cookies) {
      const [name, value] = cookie.trim().split("=");
      if (name === key) return value;
    }
  } catch (error) {
    console.error("Errore nel recupero dei dati:", error);
  }
  return null;
}

/**
 * Rimuove un valore da localStorage e dai cookie
 * @param {string} key - Chiave del valore da rimuovere
 */
function clearStorage(key) {
  try {
    localStorage.removeItem(key);
    document.cookie = `${key}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
  } catch (error) {
    console.error("Errore nella rimozione dei dati:", error);
  }
}

// =============================================
// FUNZIONI DI SICUREZZA E CRITTOGRAFIA
// =============================================

/**
 * Genera un hash SHA-256 di una stringa
 * @param {string} str - Stringa da hashing
 * @returns {Promise<string>} Hash della stringa
 */
async function generateHash(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// =============================================
// GESTIONE TEMPO E SESSIONE
// =============================================

/**
 * Imposta l'orario di inizio della sessione con hash di sicurezza
 */
async function setUsageStartTime() {
  const now = Date.now().toString();
  const hash = await generateHash(now + SECRET_KEY);
  setStorage("usage_start_time", now, TIME_LIMIT_MINUTES);
  setStorage("usage_hash", hash, TIME_LIMIT_MINUTES);
  updateStatusBar();
}

/**
 * Verifica se il tempo della sessione è scaduto o se c'è una violazione
 * @returns {Promise<boolean>} True se la sessione è scaduta o compromessa
 */
async function checkTimeLimit() {
  const startTime = getStorage("usage_start_time");
  const storedHash = getStorage("usage_hash");

  // Se mancano i dati di sessione, considera la sessione come non attiva
  if (!startTime || !storedHash) return false;

  // Verifica l'integrità dei dati con l'hash
  const calcHash = await generateHash(startTime + SECRET_KEY);
  if (calcHash !== storedHash) {
    showFatalError("⚠️ Violazione di sicurezza rilevata!");
    return true;
  }

  // Calcola il tempo trascorso
  const now = Date.now();
  const minutesPassed = (now - parseInt(startTime, 10)) / (1000 * 60);

  // Verifica se il tempo è scaduto
  if (minutesPassed >= TIME_LIMIT_MINUTES) {
    showSessionExpired();
    return true;
  }

  updateStatusBar();
  return false;
}

/**
 * Mostra un errore irreversibile e blocca l'applicazione
 * @param {string} message - Messaggio di errore da visualizzare
 */
function showFatalError(message) {
  clearInterval(timeCheckInterval);
  document.body.innerHTML = `
    <div style="
      position: fixed; top: 0; left: 0; width: 100%; height: 100vh;
      display: flex; justify-content: center; align-items: center;
      background: #121111; color: #ff6b6b; font-size: 24px; text-align: center;
      padding: 20px; z-index: 9999;">
      ${message}
    </div>`;
}

/**
 * Gestisce la visualizzazione della schermata di sessione scaduta
 */
function showSessionExpired() {
  clearInterval(timeCheckInterval);

  // Mostra overlay di sessione scaduta
  document.getElementById("expiredOverlay").classList.remove("hidden");
  document.getElementById("controlPanel").classList.add("hidden");
  document.getElementById("sessionExpired").classList.remove("hidden");
  document.getElementById("test2").style.display = "none";

  // Disabilita tutti i pulsanti
  DEVICES.forEach((device) => {
    const btn = document.getElementById(device.button_id);
    if (btn) {
      btn.disabled = true;
      btn.classList.add("btn-error");
    }
  });

  // Aggiorna lo stato di sicurezza
  const securityStatus = document.getElementById("securityStatus");
  if (securityStatus) {
    securityStatus.textContent = "Scaduta";
    securityStatus.style.color = "var(--error)";
  }
}

// =============================================
// GESTIONE INTERFACCIA E STATO
// =============================================

/**
 * Aggiorna la barra di stato con i click rimanenti e il tempo
 */
function updateStatusBar() {
  const mainDoorCounter = document.getElementById("mainDoorCounter");
  const aptDoorCounter = document.getElementById("aptDoorCounter");
  const timeRemaining = document.getElementById("timeRemaining");

  // Aggiorna i contatori delle porte
  if (mainDoorCounter) {
    mainDoorCounter.textContent = `${getClicksLeft(
      DEVICES[0].storage_key
    )} click left`;
  }

  if (aptDoorCounter) {
    aptDoorCounter.textContent = `${getClicksLeft(
      DEVICES[1].storage_key
    )} click left`;
  }

  // Aggiorna il timer
  const startTime = getStorage("usage_start_time");
  if (!startTime || !timeRemaining) return;

  const now = Date.now();
  const minutesPassed = (now - parseInt(startTime, 10)) / (1000 * 60);
  const minutesLeft = Math.max(
    0,
    Math.floor(TIME_LIMIT_MINUTES - minutesPassed)
  );
  const secondsLeft = Math.max(0, Math.floor(60 - (minutesPassed % 1) * 60));

  timeRemaining.textContent = `${minutesLeft
    .toString()
    .padStart(2, "0")}:${secondsLeft.toString().padStart(2, "0")}`;

  // Cambia colore in base al tempo rimanente
  if (minutesLeft < 1) {
    timeRemaining.style.color = "var(--error)";
  } else if (minutesLeft < 5) {
    timeRemaining.style.color = "var(--warning)";
  } else {
    timeRemaining.style.color = "var(--primary)";
  }
}

/**
 * Recupera il numero di click rimanenti per una porta
 * @param {string} key - Chiave di storage della porta
 * @returns {number} Numero di click rimanenti
 */
function getClicksLeft(key) {
  const stored = getStorage(key);
  return stored === null ? MAX_CLICKS : parseInt(stored, 10);
}

/**
 * Salva il numero di click rimanenti per una porta
 * @param {string} key - Chiave di storage della porta
 * @param {number} count - Numero di click da salvare
 */
function setClicksLeft(key, count) {
  setStorage(key, count.toString(), TIME_LIMIT_MINUTES);
  updateStatusBar();
}

/**
 * Aggiorna lo stato visivo di un pulsante in base ai click rimanenti
 * @param {Object} device - Dispositivo da aggiornare
 */
function updateButtonState(device) {
  const btn = document.getElementById(device.button_id);
  if (!btn) return;

  const clicksLeft = getClicksLeft(device.storage_key);
  btn.disabled = clicksLeft <= 0;

  // Aggiorna le classi CSS in base allo stato
  if (clicksLeft <= 0) {
    btn.classList.add("btn-error");
    btn.classList.remove("btn-success");
  } else {
    btn.classList.add("btn-success");
    btn.classList.remove("btn-error");
  }
}

// =============================================
// GESTIONE POPUP E INTERAZIONI
// =============================================

/**
 * Mostra il popup di conferma per l'apertura di una porta
 * @param {Object} device - Dispositivo da aprire
 */
function showConfirmationPopup(device) {
  currentDevice = device;
  const doorName = device.button_id
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (str) => str.toUpperCase());

  document.getElementById(
    "confirmationMessage"
  ).textContent = `Are you sure you want to unlock the ${doorName}?`;
  document.getElementById("confirmationPopup").style.display = "flex";
}

/**
 * Chiude il popup di conferma
 */
function closeConfirmationPopup() {
  document.getElementById("confirmationPopup").style.display = "none";
  currentDevice = null;
}

/**
 * Mostra il popup di feedback dopo l'attivazione di un dispositivo
 * @param {Object} device - Dispositivo attivato
 * @param {number} clicksLeft - Click rimanenti dopo l'operazione
 */
function showDevicePopup(device, clicksLeft) {
  const popup = document.getElementById(`popup-${device.button_id}`);
  if (!popup) {
    console.error(`Popup per ${device.button_id} non trovato`);
    return;
  }

  const text = document.getElementById(`popup-text-${device.button_id}`);
  if (text) {
    if (clicksLeft > 0) {
      text.innerHTML = `
        <i class="fas fa-check-circle" style="color:#4CAF50;font-size:2.5rem;margin-bottom:15px;"></i>
        <div><strong>${clicksLeft}</strong> Click Left</div>
        <div style="margin-top:10px;font-size:1rem;">Door Unlocked!</div>`;
    } else {
      text.innerHTML = `
        <i class="fas fa-exclamation-triangle" style="color:#FFC107;font-size:2.5rem;margin-bottom:15px;"></i>
        <div><strong>No more clicks left!</strong></div>
        <div style="margin-top:10px;font-size:1rem;">Contact for Assistance.</div>`;
    }
  }

  popup.style.display = "flex";
  // Chiudi automaticamente il popup se ci sono ancora click disponibili
  if (clicksLeft > 0) setTimeout(() => closePopup(device.button_id), 3000);
}

/**
 * Chiude un popup specifico
 * @param {string} buttonId - ID del pulsante associato al popup
 */
function closePopup(buttonId) {
  const popup = document.getElementById(`popup-${buttonId}`);
  if (popup) popup.style.display = "none";
}

// =============================================
// COMUNICAZIONE CON DISPOSITIVI SHELLY
// =============================================

/**
 * Attiva un dispositivo Shelly per aprire una porta
 * @param {Object} device - Dispositivo da attivare
 */
async function activateDevice(device) {
  // Verifica se la sessione è ancora valida
  if (await checkTimeLimit()) return;

  // Controlla i click rimanenti
  let clicksLeft = getClicksLeft(device.storage_key);
  if (clicksLeft <= 0) {
    showDevicePopup(device, clicksLeft);
    updateButtonState(device);
    return;
  }

  // Decrementa i click rimanenti
  clicksLeft--;
  setClicksLeft(device.storage_key, clicksLeft);
  updateButtonState(device);

  try {
    // Invoca l'API Shelly per attivare il dispositivo
    const response = await fetch(BASE_URL_SET, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: device.id,
        auth_key: device.auth_key,
        channel: 0,
        on: true,
        turn: "on",
      }),
    });

    if (response.ok) {
      showDevicePopup(device, clicksLeft);
    } else {
      // Se la richiesta fallisce, ripristina il conteggio dei click
      setClicksLeft(device.storage_key, clicksLeft + 1);
      updateButtonState(device);
      console.error(
        "Errore nell'attivazione del dispositivo:",
        response.statusText
      );
    }
  } catch (error) {
    // In caso di errore di rete, ripristina il conteggio dei click
    console.error("Attivazione dispositivo fallita:", error);
    setClicksLeft(device.storage_key, clicksLeft + 1);
    updateButtonState(device);
  }
}

// =============================================
// GESTIONE AMMINISTRAZIONE
// =============================================

/**
 * Mostra il pannello di amministrazione
 */
function showAdminPanel() {
  document.getElementById("adminLogin").style.display = "none";
  document.getElementById("adminPanel").style.display = "block";
  document.getElementById("currentCode").textContent = CORRECT_CODE;
  document.getElementById("currentCodeVersion").textContent =
    currentCodeVersion;
  document.getElementById("currentMaxClicks").textContent = MAX_CLICKS;
  document.getElementById("currentTimeLimit").textContent = TIME_LIMIT_MINUTES;
  document.getElementById("newMaxClicks").value = MAX_CLICKS;
  document.getElementById("newTimeLimit").value = TIME_LIMIT_MINUTES;
}

/**
 * Gestisce il login amministrativo
 */
function handleAdminLogin() {
  const pass = document.getElementById("adminPass").value.trim();
  if (pass === ADMIN_PASSWORD) {
    showAdminPanel();
  } else {
    alert("Password admin errata!");
  }
}

/**
 * Aggiorna il codice di accesso
 */
function handleCodeUpdate() {
  const newCode = document.getElementById("newCode").value.trim();
  if (!newCode) {
    alert("Inserisci un codice valido");
    return;
  }

  // Aggiorna il codice e incrementa la versione
  CORRECT_CODE = newCode;
  localStorage.setItem("secret_code", newCode);
  currentCodeVersion += 1;
  localStorage.setItem(CODE_VERSION_KEY, currentCodeVersion.toString());

  // Aggiorna l'interfaccia
  document.getElementById("currentCode").textContent = CORRECT_CODE;
  document.getElementById("currentCodeVersion").textContent =
    currentCodeVersion;

  // Resetta completamente lo storage per forzare il reinserimento del codice
  clearStorage("usage_start_time");
  clearStorage("usage_hash");
  DEVICES.forEach((device) => {
    clearStorage(device.storage_key);
  });

  // Ripristina la visualizzazione del form di autenticazione
  document.getElementById("controlPanel").style.display = "none";
  document.getElementById("authCode").style.display = "block";
  document.getElementById("auth-form").style.display = "block";
  document.getElementById("btnCheckCode").style.display = "block";
  document.getElementById("important").style.display = "block";

  alert(
    "Codice aggiornato con successo! Tutti gli utenti dovranno inserire il nuovo codice."
  );
}

/**
 * Aggiorna le impostazioni di sistema (click massimi e tempo limite)
 */
function handleSettingsUpdate() {
  const newMaxClicks = document.getElementById("newMaxClicks").value.trim();
  const newTimeLimit = document.getElementById("newTimeLimit").value.trim();

  // Validazione input
  if (!newMaxClicks || isNaN(newMaxClicks) || parseInt(newMaxClicks) <= 0) {
    alert("Inserisci un numero valido per i click massimi");
    return;
  }

  if (!newTimeLimit || isNaN(newTimeLimit) || parseInt(newTimeLimit) <= 0) {
    alert("Inserisci un numero valido per il tempo limite");
    return;
  }

  // Aggiorna le impostazioni
  MAX_CLICKS = parseInt(newMaxClicks);
  TIME_LIMIT_MINUTES = parseInt(newTimeLimit);

  localStorage.setItem("max_clicks", MAX_CLICKS);
  localStorage.setItem("time_limit_minutes", TIME_LIMIT_MINUTES);

  // Aggiorna i contatori dei click se necessario
  DEVICES.forEach((device) => {
    const currentClicks = getClicksLeft(device.storage_key);
    if (currentClicks > MAX_CLICKS) {
      setClicksLeft(device.storage_key, MAX_CLICKS);
    }
    updateButtonState(device);
  });

  // Aggiorna l'interfaccia
  document.getElementById("currentMaxClicks").textContent = MAX_CLICKS;
  document.getElementById("currentTimeLimit").textContent = TIME_LIMIT_MINUTES;

  alert("Impostazioni aggiornate con successo!");
  updateStatusBar();
}

/**
 * Aggiorna la versione globale del codice e resetta la sessione se necessario
 * @returns {Promise<boolean>} True se la versione è cambiata
 */
async function updateGlobalCodeVersion() {
  const savedVersion = parseInt(localStorage.getItem(CODE_VERSION_KEY)) || 1;
  if (savedVersion < currentCodeVersion) {
    localStorage.setItem(CODE_VERSION_KEY, currentCodeVersion.toString());

    // Resetta la sessione se la versione è cambiata
    clearStorage("usage_start_time");
    clearStorage("usage_hash");
    DEVICES.forEach((device) => {
      clearStorage(device.storage_key);
    });

    // Ripristina la visualizzazione del form di autenticazione
    document.getElementById("controlPanel").style.display = "none";
    document.getElementById("authCode").style.display = "block";
    document.getElementById("auth-form").style.display = "block";
    document.getElementById("btnCheckCode").style.display = "block";
    document.getElementById("important").style.display = "block";

    return true;
  }
  return false;
}

// =============================================
// AUTENTICAZIONE UTENTE
// =============================================

/**
 * Gestisce l'invio del codice di accesso
 */
async function handleCodeSubmit() {
  const insertedCode = document.getElementById("authCode").value.trim();
  if (insertedCode !== CORRECT_CODE) {
    alert("Codice errato! Riprova.");
    return;
  }

  // Imposta l'inizio della sessione
  await setUsageStartTime();
  if (await checkTimeLimit()) return;

  // Mostra il pannello di controllo
  document.getElementById("controlPanel").style.display = "block";
  document.getElementById("authCode").style.display = "none";
  document.getElementById("auth-form").style.display = "none";
  document.getElementById("btnCheckCode").style.display = "none";
  document.getElementById("important").style.display = "none";

  // Aggiorna lo stato dei pulsanti e la barra di stato
  DEVICES.forEach(updateButtonState);
  updateStatusBar();
}

// =============================================
// INIZIALIZZAZIONE DELL'APPLICAZIONE
// =============================================

/**
 * Inizializza l'applicazione
 */
async function init() {
  // Verifica se la versione del codice è cambiata
  const savedCodeVersion =
    parseInt(localStorage.getItem(CODE_VERSION_KEY)) || 1;
  if (savedCodeVersion < currentCodeVersion) {
    // La versione è cambiata, resetta la sessione
    clearStorage("usage_start_time");
    clearStorage("usage_hash");
    DEVICES.forEach((device) => {
      clearStorage(device.storage_key);
    });
    localStorage.setItem(CODE_VERSION_KEY, currentCodeVersion.toString());

    // Mostra il form di autenticazione
    document.getElementById("controlPanel").style.display = "none";
    document.getElementById("authCode").style.display = "block";
    document.getElementById("auth-form").style.display = "block";
    document.getElementById("btnCheckCode").style.display = "block";
    document.getElementById("important").style.display = "block";
  }

  // Inizializza la visibilità dei pulsanti extra
  DEVICES.forEach((device, index) => {
    if (index >= 2) {
      // Solo per i dispositivi extra
      const containerElement = document.getElementById(
        `${device.button_id}Container`
      );
      if (containerElement) {
        containerElement.style.display = device.visible ? "block" : "none";
        if (device.visible) {
          updateButtonState(device);
        }
      }
    }
  });

  // Configura gli event listener

  // Bottone di verifica codice
  const btnCheck = document.getElementById("btnCheckCode");
  if (btnCheck) btnCheck.addEventListener("click", handleCodeSubmit);

  // Pulsanti dei dispositivi (mostrano popup di conferma)
  DEVICES.forEach((device) => {
    const btn = document.getElementById(device.button_id);
    if (btn) {
      btn.addEventListener("click", () => {
        showConfirmationPopup(device);
      });
    }
  });

  // Gestione conferma popup
  document.getElementById("confirmYes").addEventListener("click", () => {
    if (currentDevice) {
      activateDevice(currentDevice);
      closeConfirmationPopup();
    }
  });

  document
    .getElementById("confirmNo")
    .addEventListener("click", closeConfirmationPopup);

  // Chiusura popup
  document.querySelectorAll(".popup .btn").forEach((button) => {
    button.addEventListener("click", function () {
      const popup = this.closest(".popup");
      if (popup) {
        const id = popup.id.replace("popup-", "");
        closePopup(id);
      }
    });
  });

  // Funzionalità amministrative
  const btnAdminLogin = document.getElementById("btnAdminLogin");
  if (btnAdminLogin) btnAdminLogin.addEventListener("click", handleAdminLogin);

  const btnCodeUpdate = document.getElementById("btnCodeUpdate");
  if (btnCodeUpdate) btnCodeUpdate.addEventListener("click", handleCodeUpdate);

  const btnSettingsUpdate = document.getElementById("btnSettingsUpdate");
  if (btnSettingsUpdate)
    btnSettingsUpdate.addEventListener("click", handleSettingsUpdate);

  // Verifica lo stato della sessione
  const expired = await checkTimeLimit();
  if (!expired) {
    const startTime = getStorage("usage_start_time");
    if (startTime) {
      // Se c'è una sessione attiva, mostra il pannello di controllo
      document.getElementById("controlPanel").style.display = "block";
      document.getElementById("authCode").style.display = "none";
      document.getElementById("auth-form").style.display = "none";
      document.getElementById("btnCheckCode").style.display = "none";
      document.getElementById("important").style.display = "none";

      DEVICES.forEach(updateButtonState);
      updateStatusBar();
    }
  }

  // Avvia il controllo periodico del tempo
  timeCheckInterval = setInterval(async () => {
    const expired = await checkTimeLimit();
    if (!expired) {
      await updateGlobalCodeVersion();
    }
  }, 1000);

  // Disabilita il menu contestuale (tasto destro)
  document.addEventListener("contextmenu", (e) => e.preventDefault());

  // Toggle area amministrativa
  const toggleBtn = document.getElementById("toggleAdmin");
  if (toggleBtn) {
    toggleBtn.addEventListener("click", () => {
      const adminArea = document.getElementById("adminArea");
      if (
        adminArea.style.display === "none" ||
        adminArea.style.display === ""
      ) {
        adminArea.style.display = "block";
      } else {
        adminArea.style.display = "none";
      }
    });
  }
}

// =============================================
// AVVIO DELL'APPLICAZIONE
// =============================================

document.addEventListener("DOMContentLoaded", init);
