// =============================================
// CONFIGURAZIONE E VARIABILI GLOBALI
// =============================================

/**
 * Elenco dei dispositivi Shelly configurati
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

// Variabili per l'orario di check-in
let CHECKIN_TIME = localStorage.getItem("checkin_time") || "14:00";

// Variabili di stato
let timeCheckInterval;
let currentDevice = null;

// Gestione versione codice per forzare il reset alla modifica
const CODE_VERSION_KEY = "code_version";
let currentCodeVersion = parseInt(localStorage.getItem(CODE_VERSION_KEY)) || 1;

// =============================================
// FUNZIONI DI STORAGE (localStorage e cookie)
// =============================================

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

function getStorage(key) {
  try {
    const localValue = localStorage.getItem(key);
    if (localValue !== null) return localValue;

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

async function setUsageStartTime() {
  const now = Date.now().toString();
  const hash = await generateHash(now + SECRET_KEY);
  setStorage("usage_start_time", now, TIME_LIMIT_MINUTES);
  setStorage("usage_hash", hash, TIME_LIMIT_MINUTES);
  updateStatusBar();
}

async function checkTimeLimit() {
  const startTime = getStorage("usage_start_time");
  const storedHash = getStorage("usage_hash");

  if (!startTime || !storedHash) return false;

  const calcHash = await generateHash(startTime + SECRET_KEY);
  if (calcHash !== storedHash) {
    showFatalError("⚠️ Violazione di sicurezza rilevata!");
    return true;
  }

  const now = Date.now();
  const minutesPassed = (now - parseInt(startTime, 10)) / (1000 * 60);

  if (minutesPassed >= TIME_LIMIT_MINUTES) {
    showSessionExpired();
    return true;
  }

  updateStatusBar();
  return false;
}

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

function showSessionExpired() {
  clearInterval(timeCheckInterval);

  document.getElementById("expiredOverlay").classList.remove("hidden");
  document.getElementById("controlPanel").classList.add("hidden");
  document.getElementById("sessionExpired").classList.remove("hidden");
  document.getElementById("test2").style.display = "none";

  DEVICES.forEach((device) => {
    const btn = document.getElementById(device.button_id);
    if (btn) {
      btn.disabled = true;
      btn.classList.add("btn-error");
    }
  });

  const securityStatus = document.getElementById("securityStatus");
  if (securityStatus) {
    securityStatus.textContent = "Scaduta";
    securityStatus.style.color = "var(--error)";
  }
}

// =============================================
// GESTIONE ORARIO DI CHECK-IN
// =============================================

/**
 * Verifica se l'orario corrente è dopo l'orario di check-in configurato
 * @returns {boolean} True se è possibile fare check-in
 */
function isCheckinTime() {
  const now = new Date();
  const currentHours = now.getHours();
  const currentMinutes = now.getMinutes();

  const [checkinHours, checkinMinutes] = CHECKIN_TIME.split(":").map(Number);

  // Confronta ore e minuti
  if (currentHours > checkinHours) {
    return true;
  } else if (
    currentHours === checkinHours &&
    currentMinutes >= checkinMinutes
  ) {
    return true;
  }

  return false;
}

/**
 * Formatta l'orario per la visualizzazione
 * @param {string} timeString - Stringa orario nel formato "HH:MM"
 * @returns {string} Orario formattato
 */
function formatTime(timeString) {
  const [hours, minutes] = timeString.split(":");
  return `${hours}:${minutes}`;
}

/**
 * Aggiorna la visualizzazione dell'orario di check-in
 */
function updateCheckinTimeDisplay() {
  document.getElementById("checkinTimeDisplay").textContent =
    formatTime(CHECKIN_TIME);
  document.getElementById("checkinTimePopup").textContent =
    formatTime(CHECKIN_TIME);
  document.getElementById("currentCheckinTime").textContent =
    formatTime(CHECKIN_TIME);

  // Aggiorna lo stato corrente
  const statusElement = document.getElementById("currentTimeStatus");
  if (statusElement) {
    if (isCheckinTime()) {
      statusElement.innerHTML =
        '<i class="fas fa-check-circle" style="color:green;"></i> Check-in is now available';
    } else {
      const now = new Date();
      const [checkinHours, checkinMinutes] =
        CHECKIN_TIME.split(":").map(Number);
      const checkinTime = new Date(now);
      checkinTime.setHours(checkinHours, checkinMinutes, 0, 0);

      const timeDiff = checkinTime - now;
      const hoursLeft = Math.floor(timeDiff / (1000 * 60 * 60));
      const minutesLeft = Math.floor(
        (timeDiff % (1000 * 60 * 60)) / (1000 * 60)
      );

      statusElement.innerHTML = `<i class="fas fa-clock" style="color:orange;"></i> Check-in will be available in ${hoursLeft}h ${minutesLeft}m`;
    }
  }
}

/**
 * Mostra il popup per check-in troppo presto
 */
function showEarlyCheckinPopup() {
  document.getElementById("earlyCheckinPopup").style.display = "flex";
}

// =============================================
// GESTIONE INTERFACCIA E STATO
// =============================================

function updateStatusBar() {
  const mainDoorCounter = document.getElementById("mainDoorCounter");
  const aptDoorCounter = document.getElementById("aptDoorCounter");
  const timeRemaining = document.getElementById("timeRemaining");

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

  if (minutesLeft < 1) {
    timeRemaining.style.color = "var(--error)";
  } else if (minutesLeft < 5) {
    timeRemaining.style.color = "var(--warning)";
  } else {
    timeRemaining.style.color = "var(--primary)";
  }
}

function getClicksLeft(key) {
  const stored = getStorage(key);
  return stored === null ? MAX_CLICKS : parseInt(stored, 10);
}

function setClicksLeft(key, count) {
  setStorage(key, count.toString(), TIME_LIMIT_MINUTES);
  updateStatusBar();
}

function updateButtonState(device) {
  const btn = document.getElementById(device.button_id);
  if (!btn) return;

  const clicksLeft = getClicksLeft(device.storage_key);
  btn.disabled = clicksLeft <= 0 || !isCheckinTime();

  if (clicksLeft <= 0) {
    btn.classList.add("btn-error");
    btn.classList.remove("btn-success");
  } else if (!isCheckinTime()) {
    btn.classList.remove("btn-error", "btn-success");
  } else {
    btn.classList.add("btn-success");
    btn.classList.remove("btn-error");
  }
}

// =============================================
// GESTIONE POPUP E INTERAZIONI
// =============================================

function showConfirmationPopup(device) {
  // Verifica l'orario di check-in prima di mostrare la conferma
  if (!isCheckinTime()) {
    showEarlyCheckinPopup();
    return;
  }

  currentDevice = device;
  const doorName = device.button_id
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (str) => str.toUpperCase());

  document.getElementById(
    "confirmationMessage"
  ).textContent = `Are you sure you want to unlock the ${doorName}?`;
  document.getElementById("confirmationPopup").style.display = "flex";
}

function closeConfirmationPopup() {
  document.getElementById("confirmationPopup").style.display = "none";
  currentDevice = null;
}

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
  if (clicksLeft > 0) setTimeout(() => closePopup(device.button_id), 3000);
}

function closePopup(buttonId) {
  const popup = document.getElementById(`popup-${buttonId}`);
  if (popup) popup.style.display = "none";
}

// =============================================
// COMUNICAZIONE CON DISPOSITIVI SHELLY
// =============================================

async function activateDevice(device) {
  if (await checkTimeLimit()) return;

  // Verifica l'orario di check-in
  if (!isCheckinTime()) {
    showEarlyCheckinPopup();
    return;
  }

  let clicksLeft = getClicksLeft(device.storage_key);
  if (clicksLeft <= 0) {
    showDevicePopup(device, clicksLeft);
    updateButtonState(device);
    return;
  }

  clicksLeft--;
  setClicksLeft(device.storage_key, clicksLeft);
  updateButtonState(device);

  try {
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
      setClicksLeft(device.storage_key, clicksLeft + 1);
      updateButtonState(device);
      console.error(
        "Errore nell'attivazione del dispositivo:",
        response.statusText
      );
    }
  } catch (error) {
    console.error("Attivazione dispositivo fallita:", error);
    setClicksLeft(device.storage_key, clicksLeft + 1);
    updateButtonState(device);
  }
}

// =============================================
// GESTIONE AMMINISTRAZIONE
// =============================================

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

  // Carica lo stato delle porte extra
  // document.getElementById("extraDoor1Visible").checked = DEVICES[2].visible;
  // document.getElementById("extraDoor2Visible").checked = DEVICES[3].visible;

  // Imposta l'orario di check-in
  document.getElementById("checkinTime").value = CHECKIN_TIME;
  document.getElementById("currentCheckinTime").textContent =
    formatTime(CHECKIN_TIME);
}

function handleAdminLogin() {
  const pass = document.getElementById("adminPass").value.trim();
  if (pass === ADMIN_PASSWORD) {
    showAdminPanel();
  } else {
    alert("Password admin errata!");
  }
}

function handleCodeUpdate() {
  const newCode = document.getElementById("newCode").value.trim();
  if (!newCode) {
    alert("Inserisci un codice valido");
    return;
  }

  CORRECT_CODE = newCode;
  localStorage.setItem("secret_code", newCode);
  currentCodeVersion += 1;
  localStorage.setItem(CODE_VERSION_KEY, currentCodeVersion.toString());

  document.getElementById("currentCode").textContent = CORRECT_CODE;
  document.getElementById("currentCodeVersion").textContent =
    currentCodeVersion;

  clearStorage("usage_start_time");
  clearStorage("usage_hash");
  DEVICES.forEach((device) => {
    clearStorage(device.storage_key);
  });

  document.getElementById("controlPanel").style.display = "none";
  document.getElementById("authCode").style.display = "block";
  document.getElementById("auth-form").style.display = "block";
  document.getElementById("btnCheckCode").style.display = "block";
  document.getElementById("important").style.display = "block";

  alert(
    "Codice aggiornato con successo! Tutti gli utenti dovranno inserire il nuovo codice."
  );
}

function handleSettingsUpdate() {
  const newMaxClicks = document.getElementById("newMaxClicks").value.trim();
  const newTimeLimit = document.getElementById("newTimeLimit").value.trim();

  if (!newMaxClicks || isNaN(newMaxClicks) || parseInt(newMaxClicks) <= 0) {
    alert("Inserisci un numero valido per i click massimi");
    return;
  }

  if (!newTimeLimit || isNaN(newTimeLimit) || parseInt(newTimeLimit) <= 0) {
    alert("Inserisci un numero valido per il tempo limite");
    return;
  }

  MAX_CLICKS = parseInt(newMaxClicks);
  TIME_LIMIT_MINUTES = parseInt(newTimeLimit);

  localStorage.setItem("max_clicks", MAX_CLICKS);
  localStorage.setItem("time_limit_minutes", TIME_LIMIT_MINUTES);

  DEVICES.forEach((device) => {
    const currentClicks = getClicksLeft(device.storage_key);
    if (currentClicks > MAX_CLICKS) {
      setClicksLeft(device.storage_key, MAX_CLICKS);
    }
    updateButtonState(device);
  });

  document.getElementById("currentMaxClicks").textContent = MAX_CLICKS;
  document.getElementById("currentTimeLimit").textContent = TIME_LIMIT_MINUTES;

  alert("Impostazioni aggiornate con successo!");
  updateStatusBar();
}

// FUNZIONE AGGIUNTA: Gestione visibilità porte extra
function handleExtraDoorsVisibility() {
  const extraDoor1Visible =
    document.getElementById("extraDoor1Visible").checked;
  const extraDoor2Visible =
    document.getElementById("extraDoor2Visible").checked;

  // Aggiorna lo stato nei dispositivi
  DEVICES[2].visible = extraDoor1Visible;
  DEVICES[3].visible = extraDoor2Visible;

  // Salva le preferenze
  localStorage.setItem("extraDoor1Visible", extraDoor1Visible);
  localStorage.setItem("extraDoor2Visible", extraDoor2Visible);

  // Aggiorna l'interfaccia
  document.getElementById("ExtraDoor1Container").style.display =
    extraDoor1Visible ? "block" : "none";
  document.getElementById("ExtraDoor2Container").style.display =
    extraDoor2Visible ? "block" : "none";

  alert("Impostazioni porte extra aggiornate!");
}

// FUNZIONE AGGIUNTA: Gestione orario di check-in
function handleCheckinTimeUpdate() {
  const newCheckinTime = document.getElementById("checkinTime").value;

  if (!newCheckinTime) {
    alert("Inserisci un orario valido");
    return;
  }

  CHECKIN_TIME = newCheckinTime;
  localStorage.setItem("checkin_time", newCheckinTime);

  // Aggiorna la visualizzazione
  updateCheckinTimeDisplay();
  DEVICES.forEach(updateButtonState);

  alert("Orario di check-in aggiornato con successo!");
}

async function updateGlobalCodeVersion() {
  const savedVersion = parseInt(localStorage.getItem(CODE_VERSION_KEY)) || 1;
  if (savedVersion < currentCodeVersion) {
    localStorage.setItem(CODE_VERSION_KEY, currentCodeVersion.toString());

    clearStorage("usage_start_time");
    clearStorage("usage_hash");
    DEVICES.forEach((device) => {
      clearStorage(device.storage_key);
    });

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

async function handleCodeSubmit() {
  const insertedCode = document.getElementById("authCode").value.trim();
  if (insertedCode !== CORRECT_CODE) {
    alert("Codice errato! Riprova.");
    return;
  }

  await setUsageStartTime();
  if (await checkTimeLimit()) return;

  document.getElementById("controlPanel").style.display = "block";
  document.getElementById("authCode").style.display = "none";
  document.getElementById("auth-form").style.display = "none";
  document.getElementById("btnCheckCode").style.display = "none";
  document.getElementById("important").style.display = "none";

  // Mostra informazioni sull'orario di check-in
  document.getElementById("checkinTimeInfo").style.display = "block";
  updateCheckinTimeDisplay();

  DEVICES.forEach(updateButtonState);
  updateStatusBar();
}

// =============================================
// INIZIALIZZAZIONE DELL'APPLICAZIONE
// =============================================

async function init() {
  // Verifica se la versione del codice è cambiata
  const savedCodeVersion =
    parseInt(localStorage.getItem(CODE_VERSION_KEY)) || 1;
  if (savedCodeVersion < currentCodeVersion) {
    clearStorage("usage_start_time");
    clearStorage("usage_hash");
    DEVICES.forEach((device) => {
      clearStorage(device.storage_key);
    });
    localStorage.setItem(CODE_VERSION_KEY, currentCodeVersion.toString());

    document.getElementById("controlPanel").style.display = "none";
    document.getElementById("authCode").style.display = "block";
    document.getElementById("auth-form").style.display = "block";
    document.getElementById("btnCheckCode").style.display = "block";
    document.getElementById("important").style.display = "block";
  }

  // Carica le impostazioni delle porte extra
  const savedExtraDoor1Visible =
    localStorage.getItem("extraDoor1Visible") === "true";
  const savedExtraDoor2Visible =
    localStorage.getItem("extraDoor2Visible") === "true";

  DEVICES[2].visible = savedExtraDoor1Visible;
  DEVICES[3].visible = savedExtraDoor2Visible;

  document.getElementById("ExtraDoor1Container").style.display =
    savedExtraDoor1Visible ? "block" : "none";
  document.getElementById("ExtraDoor2Container").style.display =
    savedExtraDoor2Visible ? "block" : "none";

  // Configura gli event listener
  const btnCheck = document.getElementById("btnCheckCode");
  if (btnCheck) btnCheck.addEventListener("click", handleCodeSubmit);

  DEVICES.forEach((device) => {
    const btn = document.getElementById(device.button_id);
    if (btn) {
      btn.addEventListener("click", () => {
        showConfirmationPopup(device);
      });
    }
  });

  document.getElementById("confirmYes").addEventListener("click", () => {
    if (currentDevice) {
      activateDevice(currentDevice);
      closeConfirmationPopup();
    }
  });

  document
    .getElementById("confirmNo")
    .addEventListener("click", closeConfirmationPopup);

  document.querySelectorAll(".popup .btn").forEach((button) => {
    button.addEventListener("click", function () {
      const popup = this.closest(".popup");
      if (popup) {
        const id = popup.id.replace("popup-", "");
        closePopup(id);
      }
    });
  });

  // Event listener per il pulsante delle porte extra
  const btnExtraDoorsVisibility = document.getElementById(
    "btnExtraDoorsVisibility"
  );
  if (btnExtraDoorsVisibility) {
    btnExtraDoorsVisibility.addEventListener(
      "click",
      handleExtraDoorsVisibility
    );
  }

  // Event listener per il pulsante dell'orario di check-in
  const btnUpdateCheckinTime = document.getElementById("btnUpdateCheckinTime");
  if (btnUpdateCheckinTime) {
    btnUpdateCheckinTime.addEventListener("click", handleCheckinTimeUpdate);
  }

  const btnAdminLogin = document.getElementById("btnAdminLogin");
  if (btnAdminLogin) btnAdminLogin.addEventListener("click", handleAdminLogin);

  const btnCodeUpdate = document.getElementById("btnCodeUpdate");
  if (btnCodeUpdate) btnCodeUpdate.addEventListener("click", handleCodeUpdate);

  const btnSettingsUpdate = document.getElementById("btnSettingsUpdate");
  if (btnSettingsUpdate)
    btnSettingsUpdate.addEventListener("click", handleSettingsUpdate);

  const expired = await checkTimeLimit();
  if (!expired) {
    const startTime = getStorage("usage_start_time");
    if (startTime) {
      document.getElementById("controlPanel").style.display = "block";
      document.getElementById("authCode").style.display = "none";
      document.getElementById("auth-form").style.display = "none";
      document.getElementById("btnCheckCode").style.display = "none";
      document.getElementById("important").style.display = "none";

      // Mostra informazioni sull'orario di check-in
      document.getElementById("checkinTimeInfo").style.display = "block";
      updateCheckinTimeDisplay();

      DEVICES.forEach(updateButtonState);
      updateStatusBar();
    }
  }

  timeCheckInterval = setInterval(async () => {
    const expired = await checkTimeLimit();
    if (!expired) {
      await updateGlobalCodeVersion();
      updateCheckinTimeDisplay();
    }
  }, 1000);

  // Aggiorna l'orario ogni minuto
  setInterval(updateCheckinTimeDisplay, 60000);

  document.addEventListener("contextmenu", (e) => e.preventDefault());

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

  // Inizializza la visualizzazione dell'orario
  updateCheckinTimeDisplay();
}

// =============================================
// AVVIO DELL'APPLICAZIONE
// =============================================

document.addEventListener("DOMContentLoaded", init);
