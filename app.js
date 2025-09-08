// --- Configurazione ---
const DEVICES = [
  {
    id: "e4b063f0c38c",
    auth_key:
      "MWI2MDc4dWlk4908A71DA809FCEC05C5D1F360943FBFC6A7934EC0FD9E3CFEAF03F8F5A6A4A0C60665B97A1AA2E2",
    storage_key: "clicks_MainDoor",
    button_id: "MainDoor",
  },
  {
    id: "34945478d595",
    auth_key:
      "MWI2MDc4dWlk4908A71DA809FCEC05C5D1F360943FBFC6A7934EC0FD9E3CFEAF03F8F5A6A4A0C60665B97A1AA2E2",
    storage_key: "clicks_AptDoor",
    button_id: "AptDoor",
  },
];

const MAX_CLICKS = 3;
const BASE_URL_SET =
  "https://shelly-73-eu.shelly.cloud/v2/devices/api/set/switch";
const TIME_LIMIT_MINUTES = 1500;
const SECRET_KEY = "musart_secret_123_fixed_key";
const ADMIN_PASSWORD = "1122";
let timeCheckInterval;

// Gestione del codice con timestamp
let CODE_DATA = JSON.parse(
  localStorage.getItem("secret_code_data") || '{"code":"2245","timestamp":0}'
);
let CORRECT_CODE = CODE_DATA.code;
let CODE_TIMESTAMP = CODE_DATA.timestamp;

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
}

// --- Gestione click ---
function getClicksLeft(key) {
  const stored = getStorage(key);
  return stored === null ? MAX_CLICKS : parseInt(stored, 10);
}

function setClicksLeft(key, count) {
  setStorage(key, count.toString(), TIME_LIMIT_MINUTES);
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
  if (!popup) return;
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

// --- Attivazione device ---
async function activateDevice(device) {
  if (await checkTimeLimit()) return;

  // Controlla se il codice è stato cambiato
  checkForCodeUpdates();

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

  // Aggiorna con timestamp corrente
  const newTimestamp = Date.now();
  CODE_DATA = {
    code: newCode,
    timestamp: newTimestamp,
  };

  localStorage.setItem("secret_code_data", JSON.stringify(CODE_DATA));
  CORRECT_CODE = newCode;
  CODE_TIMESTAMP = newTimestamp;

  document.getElementById("currentCode").textContent = CORRECT_CODE;
  alert(
    "Codice aggiornato con successo!\n\nTutti i dispositivi dovranno utilizzare il nuovo codice per accedere."
  );
}

// --- Controllo aggiornamenti codice ---
function checkForCodeUpdates() {
  const storedCodeData = JSON.parse(
    localStorage.getItem("secret_code_data") || '{"code":"2245","timestamp":0}'
  );

  if (storedCodeData.timestamp > CODE_TIMESTAMP) {
    CODE_DATA = storedCodeData;
    CORRECT_CODE = storedCodeData.code;
    CODE_TIMESTAMP = storedCodeData.timestamp;
    return true;
  }
  return false;
}

// --- Inizializzazione ---
function init() {
  // codice utente
  const btnCheck = document.getElementById("btnCheckCode");
  if (btnCheck) btnCheck.addEventListener("click", handleCodeSubmit);

  // dispositivi
  DEVICES.forEach((device) => {
    const btn = document.getElementById(device.button_id);
    if (btn) btn.addEventListener("click", () => activateDevice(device));
  });

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

  // tempo
  checkTimeLimit().then((expired) => {
    if (expired) return;
    const startTime = getStorage("usage_start_time");
    if (startTime) {
      document.getElementById("controlPanel").style.display = "block";
      document.getElementById("authCode").style.display = "none";
      document.getElementById("auth-form").style.display = "none";
      document.getElementById("btnCheckCode").style.display = "none";
      document.getElementById("important").style.display = "none";
      document.getElementById("hh2").style.display = "none";
      DEVICES.forEach(updateButtonState);
    }
  });

  timeCheckInterval = setInterval(() => checkTimeLimit(), 1000);

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
  // Controlla se c'è un nuovo codice (confronta i timestamp)
  if (checkForCodeUpdates()) {
    alert("Il codice di accesso è stato cambiato. Inserisci il nuovo codice.");
    return;
  }

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
  document.getElementById("hh2").style.display = "none";
  DEVICES.forEach(updateButtonState);
}

// --- Start ---
document.addEventListener("DOMContentLoaded", init);
