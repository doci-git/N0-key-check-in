// --- Configurazione dispositivi ---
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

let timeCheckInterval;

// --- Firebase config (SOSTITUISCI) ---
const firebaseConfig = {
  apiKey: "API_KEY",
  authDomain: "https://check-in-4e0e9-default-rtdb.europe-west1.firebasedatabase.app/",
  databaseURL:"",
  projectId: "PROJECT_ID",
  storageBucket: "PROJECT_ID.appspot.com",
  messagingSenderId: "SENDER_ID",
  appId: "APP_ID",
};
// UID admin (SOSTITUISCI con quello reale preso dalla console)
const ADMIN_UID = "MlOBkoG2f4fv47ZHflH8lT8Lyxp2";

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.database();
const codeRef = db.ref("secret_code");

// --- Variabili codice ---
let CODE_DATA = { code: "2245", timestamp: 0 };
let CORRECT_CODE = CODE_DATA.code;
let CODE_TIMESTAMP = CODE_DATA.timestamp;

// --- Utility storage ---
function setStorage(key, value, minutes) {
  try {
    localStorage.setItem(key, value);
    const d = new Date();
    d.setTime(d.getTime() + minutes * 60 * 1000);
    document.cookie = `${key}=${value}; expires=${d.toUTCString()}; path=/; SameSite=Strict`;
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

// --- Sicurezza/Hash sessione ---
async function generateHash(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// --- Gestione sessione tempo ---
async function setUsageStartTime() {
  const now = Date.now().toString();
  // Hasheremo con il codice attuale per legare sessione ↔ codice corrente
  const hash = await generateHash(now + CORRECT_CODE);
  setStorage("usage_start_time", now, TIME_LIMIT_MINUTES);
  setStorage("usage_hash", hash, TIME_LIMIT_MINUTES);
}

async function checkTimeLimit() {
  const startTime = getStorage("usage_start_time");
  const storedHash = getStorage("usage_hash");
  if (!startTime || !storedHash) return false;

  const calcHash = await generateHash(startTime + CORRECT_CODE);
  if (calcHash !== storedHash) {
    // Se il codice è cambiato, invalido la sessione in modo "soft"
    lockToLogin(
      "La sessione è stata invalidata. Re-inserisci il nuovo codice."
    );
    return true;
  }

  const minutesPassed = (Date.now() - parseInt(startTime, 10)) / (1000 * 60);
  if (minutesPassed >= TIME_LIMIT_MINUTES) {
    showSessionExpired();
    return true;
  }
  return false;
}

function showSessionExpired() {
  clearInterval(timeCheckInterval);
  const overlay = document.getElementById("expiredOverlay");
  const cp = document.getElementById("controlPanel");
  if (overlay) overlay.classList.remove("hidden");
  if (cp) cp.classList.add("hidden");
  DEVICES.forEach((d) => {
    const btn = document.getElementById(d.button_id);
    if (btn) {
      btn.disabled = true;
      btn.classList.add("btn-error");
    }
  });
}

// --- Blocco immediato alla login (usato quando cambia il codice) ---
function lockToLogin(msg) {
  clearStorage("usage_start_time");
  clearStorage("usage_hash");

  const panel = document.getElementById("controlPanel");
  const authForm = document.getElementById("auth-form");
  const codeInput = document.getElementById("authCode");
  const btn = document.getElementById("btnCheckCode");
  if (panel) panel.style.display = "none";
  if (authForm) authForm.style.display = "block";
  if (codeInput) codeInput.value = "";
  if (btn) btn.style.display = "inline-block";

  if (msg) alert(msg);
}

// --- Click & bottoni ---
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
  btn.classList.toggle("btn-error", clicksLeft <= 0);
  btn.classList.toggle("btn-success", clicksLeft > 0);
}
function showDevicePopup(device, clicksLeft) {
  const popup = document.getElementById(`popup-${device.button_id}`);
  if (!popup) return;
  const text = document.getElementById(`popup-text-${device.button_id}`);
  if (text) {
    text.innerHTML =
      clicksLeft > 0
        ? `<i class="fas fa-check-circle" style="font-size:2rem;"></i>
         <div><strong>${clicksLeft}</strong> Click Left</div><div>Door Unlocked!</div>`
        : `<i class="fas fa-exclamation-triangle" style="font-size:2rem;"></i>
         <div><strong>No more clicks!</strong></div>`;
  }
  popup.style.display = "flex";
  if (clicksLeft > 0) setTimeout(() => closePopup(device.button_id), 3000);
}
function closePopup(buttonId) {
  const popup = document.getElementById(`popup-${buttonId}`);
  if (popup) popup.style.display = "none";
}

// --- Attivazione dispositivi (Shelly) ---
async function activateDevice(device) {
  if (await checkTimeLimit()) return;

  let clicksLeft = getClicksLeft(device.storage_key);
  if (clicksLeft <= 0) {
    showDevicePopup(device, clicksLeft);
    updateButtonState(device);
    return;
  }

  setClicksLeft(device.storage_key, --clicksLeft);
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
  } catch (e) {
    console.error("Device activation failed:", e);
    setClicksLeft(device.storage_key, clicksLeft + 1);
    updateButtonState(device);
  }
}

// --- Admin (Auth + Update codice) ---
function showAdminPanel() {
  const login = document.getElementById("adminLogin");
  const panel = document.getElementById("adminPanel");
  if (login) login.style.display = "none";
  if (panel) panel.style.display = "block";
  const cc = document.getElementById("currentCode");
  if (cc) cc.textContent = CORRECT_CODE;
}

async function handleAdminLogin() {
  const email = document.getElementById("adminEmail").value.trim();
  const pass = document.getElementById("adminPass").value;
  try {
    const cred = await auth.signInWithEmailAndPassword(email, pass);
    if (!cred.user || cred.user.uid !== ADMIN_UID) {
      alert("Non sei autorizzato come admin.");
      await auth.signOut();
      return;
    }
    showAdminPanel();
  } catch (e) {
    alert("Login admin fallito: " + (e?.message || e));
  }
}

async function handleCodeUpdateFirebase() {
  if (!auth.currentUser || auth.currentUser.uid !== ADMIN_UID) {
    alert("Devi essere admin per aggiornare il codice.");
    return;
  }
  const newCode = document.getElementById("newCode").value.trim();
  if (!newCode) {
    alert("Inserisci un codice valido");
    return;
  }

  const timestamp = Date.now();
  await codeRef.set({ code: newCode, timestamp });
  const cc = document.getElementById("currentCode");
  if (cc) cc.textContent = newCode;
  alert(
    "Codice aggiornato. Tutti i dispositivi vengono disconnessi e dovranno inserire il nuovo codice."
  );
}

// --- Realtime: ascolto del codice (blocca subito vecchio codice) ---
codeRef.on("value", (snap) => {
  const data = snap.val();
  if (!data) return;
  if (data.timestamp > CODE_TIMESTAMP || data.code !== CORRECT_CODE) {
    CODE_DATA = data;
    CORRECT_CODE = data.code;
    CODE_TIMESTAMP = data.timestamp;

    // Invalida qualunque sessione corrente legata al vecchio codice
    lockToLogin(
      "Il codice è stato aggiornato. Usa il nuovo codice per continuare."
    );
  }
});

// --- Login utenti (codice pin) ---
async function handleCodeSubmit() {
  const inserted = document.getElementById("authCode").value.trim();
  if (inserted !== CORRECT_CODE) {
    alert("Codice errato! (Il vecchio codice non è più valido)");
    return;
  }
  await setUsageStartTime();
  if (await checkTimeLimit()) return;

  const panel = document.getElementById("controlPanel");
  if (panel) panel.style.display = "block";
  document.getElementById("auth-form").style.display = "none";
  const btn = document.getElementById("btnCheckCode");
  if (btn) btn.style.display = "none";
  DEVICES.forEach(updateButtonState);
}

// --- Inizializzazione ---
function init() {
  // Autenticazione: utenti anonimi per lettura DB
  auth.onAuthStateChanged((user) => {
    if (!user) auth.signInAnonymously().catch(console.error);
  });

  const btnCheck = document.getElementById("btnCheckCode");
  if (btnCheck) btnCheck.addEventListener("click", handleCodeSubmit);

  DEVICES.forEach((d) => {
    const btn = document.getElementById(d.button_id);
    if (btn) btn.addEventListener("click", () => activateDevice(d));
  });

  document.querySelectorAll(".popup .btn").forEach((b) => {
    b.addEventListener("click", function () {
      const popup = this.closest(".popup");
      if (popup) {
        const id = popup.id.replace("popup-", "");
        closePopup(id);
      }
    });
  });

  const btnAdminLogin = document.getElementById("btnAdminLogin");
  if (btnAdminLogin) btnAdminLogin.addEventListener("click", handleAdminLogin);

  const btnCodeUpdate = document.getElementById("btnCodeUpdate");
  if (btnCodeUpdate)
    btnCodeUpdate.addEventListener("click", handleCodeUpdateFirebase);

  // timer sessione
  checkTimeLimit();
  timeCheckInterval = setInterval(() => checkTimeLimit(), 1000);

  // toggle area admin
  const toggleBtn = document.getElementById("toggleAdmin");
  if (toggleBtn) {
    toggleBtn.addEventListener("click", () => {
      const area = document.getElementById("adminArea");
      area.style.display = area.style.display === "block" ? "none" : "block";
    });
  }

  // evita tasto destro (opzionale)
  document.addEventListener("contextmenu", (e) => e.preventDefault());
}

// --- Start ---
document.addEventListener("DOMContentLoaded", init);
