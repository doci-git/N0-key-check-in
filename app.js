// --- Configurazione ---
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

let MAX_CLICKS = parseInt(localStorage.getItem("max_clicks")) || 3;
let TIME_LIMIT_MINUTES =
  parseInt(localStorage.getItem("time_limit_minutes")) || 5;
const BASE_URL_SET =
  "https://shelly-73-eu.shelly.cloud/v2/devices/api/set/switch";
let CORRECT_CODE = localStorage.getItem("secret_code") || "2245";
const SECRET_KEY = "musart_secret_123_fixed_key";
const ADMIN_PASSWORD = "1122";
let timeCheckInterval;
let currentDevice = null; // Per tenere traccia della porta selezionata

// Aggiungere una costante per la versione del codice
const CODE_VERSION_KEY = "code_version";
let currentCodeVersion = parseInt(localStorage.getItem(CODE_VERSION_KEY)) || 1;

// --- Funzioni di storage ---
function setStorage(key, value, minutes) {
  try {
    localStorage.setItem(key, value);
    const d = new Date();
    d.setTime(d.getTime() + minutes * 60 * 1000);
    const expires = "expires=" + d.toUTCString();
    document.cookie = `${key}=${value}; ${expires}; path=/; SameSite=Strict`;
  } catch (e) {
    console.error("Storage error:", e);
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
  } catch (e) {
    console.error("Storage read error:", e);
  }
  return null;
}

function clearStorage(key) {
  try {
    localStorage.removeItem(key);
    document.cookie = `${key}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
  } catch (e) {
    console.error("Storage clear error:", e);
  }
}

// --- Funzioni di sicurezza ---
async function generateHash(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// --- Gestione tempo ---
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
          position: fixed;top:0;left:0;width:100%;height:100vh;
          display:flex;justify-content:center;align-items:center;
          background:#121111;color:#ff6b6b;font-size:24px;text-align:center;
          padding:20px;z-index:9999;">${message}</div>`;
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

// --- Barra di stato ---
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

  if (minutesLeft < 1) timeRemaining.style.color = "var(--error)";
  else if (minutesLeft < 5) timeRemaining.style.color = "var(--warning)";
  else timeRemaining.style.color = "var(--primary)";
}

// --- Gestione click ---
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
  btn.disabled = clicksLeft <= 0;

  if (clicksLeft <= 0) {
    btn.classList.add("btn-error");
    btn.classList.remove("btn-success");
  } else {
    btn.classList.add("btn-success");
    btn.classList.remove("btn-error");
  }
}

// --- Popup ---
function showDevicePopup(device, clicksLeft) {
  const popup = document.getElementById(`popup-${device.button_id}`);
  if (!popup) {
    console.error(`Popup for ${device.button_id} not found`);
    return;
  }

  const text = document.getElementById(`popup-text-${device.button_id}`);
  if (text) {
    if (clicksLeft > 0) {
      text.innerHTML = `<i class="fas fa-check-circle" style="color:#4CAF50;font-size:2.5rem;margin-bottom:15px;"></i>
            <div><strong>${clicksLeft}</strong> Click Left</div>
            <div style="margin-top:10px;font-size:1rem;">Door Unlocked!</div>`;
    } else {
      text.innerHTML = `<i class="fas fa-exclamation-triangle" style="color:#FFC107;font-size:2.5rem;margin-bottom:15px;"></i>
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

// --- Popup di conferma ---
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

function closeConfirmationPopup() {
  document.getElementById("confirmationPopup").style.display = "none";
  currentDevice = null;
}

// --- Attivazione device ---
async function activateDevice(device) {
  if (await checkTimeLimit()) return;

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
    }
  } catch (error) {
    console.error("Device activation failed:", error);
    setClicksLeft(device.storage_key, clicksLeft + 1);
    updateButtonState(device);
  }
}

// --- Admin Login ---
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

  // Incrementare la versione del codice per forzare il reinserimento
  currentCodeVersion += 1;
  localStorage.setItem(CODE_VERSION_KEY, currentCodeVersion.toString());

  document.getElementById("currentCode").textContent = CORRECT_CODE;
  document.getElementById("currentCodeVersion").textContent =
    currentCodeVersion;

  // Reset completo dello storage per forzare il reinserimento del codice
  clearStorage("usage_start_time");
  clearStorage("usage_hash");
  DEVICES.forEach((device) => {
    clearStorage(device.storage_key);
  });

  // Nascondere il pannello di controllo e mostrare di nuovo il form di autenticazione
  document.getElementById("controlPanel").style.display = "none";
  document.getElementById("authCode").style.display = "block";
  document.getElementById("auth-form").style.display = "block";
  document.getElementById("btnCheckCode").style.display = "block";
  document.getElementById("important").style.display = "block";
  // document.getElementById("hh2").style.display = "block";

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

  // Aggiornare i contatori dei click
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

// Aggiungere questa funzione per aggiornare la versione del codice globale
async function updateGlobalCodeVersion() {
  // Verifica se la versione del codice è cambiata
  const savedVersion = parseInt(localStorage.getItem(CODE_VERSION_KEY)) || 1;
  if (savedVersion < currentCodeVersion) {
    localStorage.setItem(CODE_VERSION_KEY, currentCodeVersion.toString());

    // Resettare la sessione se la versione è cambiata
    clearStorage("usage_start_time");
    clearStorage("usage_hash");
    DEVICES.forEach((device) => {
      clearStorage(device.storage_key);
    });

    // Mostrare il form di autenticazione
    document.getElementById("controlPanel").style.display = "none";
    document.getElementById("authCode").style.display = "block";
    document.getElementById("auth-form").style.display = "block";
    document.getElementById("btnCheckCode").style.display = "block";
    document.getElementById("important").style.display = "block";
    document.getElementById("hh2").style.display = "block";

    return true;
  }
  return false;
}

// --- Inizializzazione ---
async function init() {
  // Verificare se la versione del codice è cambiata
  const savedCodeVersion =
    parseInt(localStorage.getItem(CODE_VERSION_KEY)) || 1;
  if (savedCodeVersion < currentCodeVersion) {
    // La versione del codice è cambiata, resettare la sessione
    clearStorage("usage_start_time");
    clearStorage("usage_hash");
    DEVICES.forEach((device) => {
      clearStorage(device.storage_key);
    });
    localStorage.setItem(CODE_VERSION_KEY, currentCodeVersion.toString());

    // Mostrare il form di autenticazione
    document.getElementById("controlPanel").style.display = "none";
    document.getElementById("authCode").style.display = "block";
    document.getElementById("auth-form").style.display = "block";
    document.getElementById("btnCheckCode").style.display = "block";
    document.getElementById("important").style.display = "block";
    document.getElementById("hh2").style.display = "block";
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

  // codice utente
  const btnCheck = document.getElementById("btnCheckCode");
  if (btnCheck) btnCheck.addEventListener("click", handleCodeSubmit);

  // dispositivi - modificato per mostrare il popup di conferma
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

  // chiusura popup
  document.querySelectorAll(".popup .btn").forEach((button) => {
    button.addEventListener("click", function () {
      const popup = this.closest(".popup");
      if (popup) {
        const id = popup.id.replace("popup-", "");
        closePopup(id);
      }
    });
  });

  // admin
  const btnAdminLogin = document.getElementById("btnAdminLogin");
  if (btnAdminLogin) btnAdminLogin.addEventListener("click", handleAdminLogin);

  const btnCodeUpdate = document.getElementById("btnCodeUpdate");
  if (btnCodeUpdate) btnCodeUpdate.addEventListener("click", handleCodeUpdate);

  const btnSettingsUpdate = document.getElementById("btnSettingsUpdate");
  if (btnSettingsUpdate)
    btnSettingsUpdate.addEventListener("click", handleSettingsUpdate);

  // tempo
  const expired = await checkTimeLimit();
  if (!expired) {
    const startTime = getStorage("usage_start_time");
    if (startTime) {
      document.getElementById("controlPanel").style.display = "block";
      document.getElementById("authCode").style.display = "none";
      document.getElementById("auth-form").style.display = "none";
      document.getElementById("btnCheckCode").style.display = "none";
      document.getElementById("important").style.display = "none";
      // document.getElementById("hh2").style.display = "none";
      DEVICES.forEach(updateButtonState);
      updateStatusBar();
    }
  }

  timeCheckInterval = setInterval(async () => {
    const expired = await checkTimeLimit();
    if (!expired) {
      await updateGlobalCodeVersion();
    }
  }, 1000);

  document.addEventListener("contextmenu", (e) => e.preventDefault());

  // Toggle visualizzazione area admin
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

// --- Codice utente ---
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
  // document.getElementById("hh2").style.display = "none";
  DEVICES.forEach(updateButtonState);
  updateStatusBar();
}

// --- Start ---
document.addEventListener("DOMContentLoaded", init);
