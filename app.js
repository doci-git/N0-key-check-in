// app.js - Sistema di Check-in Porte (versione completa, ibrida Token Firebase + Hash/LocalStorage)
// - Mantiene tutte le funzioni originali
// - Fix: inizializzazione sessione dopo submit codice (niente blocco)
// - Coerenza: usa isTokenSession ed allinea window.isTokenSession per compatibilità

// =============================================
// CONFIGURAZIONE E INIZIALIZZAZIONE
// =============================================

// Configurazione Firebase
const firebaseConfig = {
  apiKey: "AIzaSyCuy3Sak96soCla7b5Yb5wmkdVfMqAXmok",
  authDomain: "check-in-4e0e9.firebaseapp.com",
  databaseURL:
    "https://check-in-4e0e9-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "check-in-4e0e9",
  storageBucket: "check-in-4e0e9.firebasestorage.app",
  messagingSenderId: "723880990177",
  appId: "1:723880990177:web:f002733b2cc2e50d172ea0",
  measurementId: "G-H97GB9L4F5",
};

// Costanti applicative
const BASE_URL_SET =
  "https://shelly-73-eu.shelly.cloud/v2/devices/api/set/switch";
const SECRET_KEY = "musart_secret_123_fixed_key";
const CODE_VERSION_KEY = "code_version";

// Configurazione dispositivi Shelly
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

// Variabili globali
let MAX_CLICKS = parseInt(localStorage.getItem("max_clicks")) || 3;
let TIME_LIMIT_MINUTES =
  parseInt(localStorage.getItem("time_limit_minutes")) || 50000;
let CORRECT_CODE = localStorage.getItem("secret_code") || "2245";
let currentCodeVersion = parseInt(localStorage.getItem(CODE_VERSION_KEY)) || 1;

// Variabili per l'orario di check-in
let CHECKIN_START_TIME = localStorage.getItem("checkin_start_time") || "12:00";
let CHECKIN_END_TIME = localStorage.getItem("checkin_end_time") || "23:00";
let CHECKIN_TIME_ENABLED =
  localStorage.getItem("checkin_time_enabled") !== "false";

// Variabili di stato
let isTokenSession = false; // <— USARE SEMPRE QUESTA
let currentTokenId = null;
let currentTokenCustomCode = null;
let sessionStartTime = null;
let currentDevice = null;
let timeCheckInterval;
let codeCheckInterval;
let CODE_CHECK_INTERVAL;
let LINK_CHECK_INTERVAL;

// Inizializza Firebase
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

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
// GESTIONE IMPOSTAZIONI FIREBASE
// =============================================

async function loadSettingsFromFirebase() {
  try {
    const snapshot = await database.ref("settings").once("value");
    return snapshot.exists() ? snapshot.val() : null;
  } catch (error) {
    console.error(
      "Errore nel caricamento delle impostazioni da Firebase:",
      error
    );
    return null;
  }
}

function setupSettingsListener() {
  database.ref("settings").on("value", (snapshot) => {
    if (snapshot.exists()) {
      const settings = snapshot.val();
      updateSettingsFromFirebase(settings);
    }
  });
}

function updateSettingsFromFirebase(settings) {
  if (settings.secret_code) {
    CORRECT_CODE = settings.secret_code;
    localStorage.setItem("secret_code", settings.secret_code);
  }

  if (settings.max_clicks) {
    MAX_CLICKS = parseInt(settings.max_clicks);
    localStorage.setItem("max_clicks", settings.max_clicks);
  }

  if (settings.time_limit_minutes) {
    TIME_LIMIT_MINUTES = parseInt(settings.time_limit_minutes);
    localStorage.setItem("time_limit_minutes", settings.time_limit_minutes);
  }

  if (settings.code_version) {
    const savedVersion = parseInt(settings.code_version);
    if (savedVersion > currentCodeVersion) {
      checkCodeVersion();
    }
  }

  updateStatusBar();
  DEVICES.forEach(updateButtonState);
}

function monitorFirebaseConnection() {
  const connectedRef = database.ref(".info/connected");
  connectedRef.on("value", (snap) => {
    if (snap.val() === true) {
      console.log("Connesso a Firebase");
      document.body.classList.remove("firebase-offline");
    } else {
      console.log("Non connesso a Firebase");
      document.body.classList.add("firebase-offline");
      showNotification(
        "Connessione a Firebase persa. Le modifiche potrebbero non essere sincronizzate.",
        "warning"
      );
    }
  });
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
  // FIX: controlla la variabile locale, non window.*
  if (isTokenSession) return false; // le sessioni con token non usano hash/LS
  if (!sessionStartTime) return false;

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
  clearInterval(codeCheckInterval);
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
  // Mostra overlay solo per sessioni manuali/scadenze locali.
  // Le scadenze token vengono gestite con messaggistica dedicata.
  if (isTokenSession) return;

  clearInterval(timeCheckInterval);
  clearInterval(codeCheckInterval);

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

  sessionStartTime = null;
}

function isSessionStuck() {
  try {
    const authVerified = localStorage.getItem("auth_verified");
    const authTimestamp = localStorage.getItem("auth_timestamp");
    const usageStartTime = localStorage.getItem("usage_start_time");

    if (authVerified === "true" && authTimestamp) {
      const authTime = parseInt(authTimestamp, 10);
      const now = Date.now();
      const timeElapsed = now - authTime;
      if (timeElapsed > 24 * 60 * 60 * 1000) return true;
    }

    if (usageStartTime) {
      const startTime = parseInt(usageStartTime, 10);
      const now = Date.now();
      const minutesPassed = (now - startTime) / (1000 * 60);
      if (minutesPassed > TIME_LIMIT_MINUTES + 60) return true;
    }

    return false;
  } catch (error) {
    console.error("Errore nel controllo sessione bloccata:", error);
    return false;
  }
}

// =============================================
// GESTIONE ORARIO DI CHECK-IN
// =============================================

function isCheckinTime() {
  if (!CHECKIN_TIME_ENABLED) return true;

  const now = new Date();
  const currentHours = now.getHours();
  const currentMinutes = now.getMinutes();
  const currentTimeInMinutes = currentHours * 60 + currentMinutes;

  const [startHours, startMinutes] = CHECKIN_START_TIME.split(":").map(Number);
  const [endHours, endMinutes] = CHECKIN_END_TIME.split(":").map(Number);

  const startTimeInMinutes = startHours * 60 + startMinutes;
  const endTimeInMinutes = endHours * 60 + endMinutes;

  return (
    currentTimeInMinutes >= startTimeInMinutes &&
    currentTimeInMinutes <= endTimeInMinutes
  );
}

function formatTime(timeString) {
  const [hours, minutes] = timeString.split(":");
  return `${hours}:${minutes}`;
}

function updateCheckinTimeDisplay() {
  const startEl = document.getElementById("checkinStartDisplay");
  const endEl = document.getElementById("checkinEndDisplay");
  const startPopup = document.getElementById("checkinStartPopup");
  const endPopup = document.getElementById("checkinEndPopup");
  const currentStart = document.getElementById("currentCheckinStartTime");
  const currentEnd = document.getElementById("currentCheckinEndTime");

  if (startEl) startEl.textContent = formatTime(CHECKIN_START_TIME);
  if (endEl) endEl.textContent = formatTime(CHECKIN_END_TIME);
  if (startPopup) startPopup.textContent = formatTime(CHECKIN_START_TIME);
  if (endPopup) endPopup.textContent = formatTime(CHECKIN_END_TIME);
  if (currentStart) currentStart.textContent = formatTime(CHECKIN_START_TIME);
  if (currentEnd) currentEnd.textContent = formatTime(CHECKIN_END_TIME);

  const statusElement = document.getElementById("currentTimeStatus");
  if (statusElement) {
    if (!CHECKIN_TIME_ENABLED) {
      statusElement.innerHTML =
        '<i class="fas fa-power-off" style="color:orange;"></i> Time control disabled — check-in allowed at any time';
    } else if (isCheckinTime()) {
      statusElement.innerHTML =
        '<i class="fas fa-check-circle" style="color:green;"></i> Check-in now available';
    } else {
      const now = new Date();
      const currentHours = now.getHours();
      const currentMinutes = now.getMinutes();
      const currentTimeInMinutes = currentHours * 60 + currentMinutes;

      const [startHours, startMinutes] =
        CHECKIN_START_TIME.split(":").map(Number);
      const [endHours, endMinutes] = CHECKIN_END_TIME.split(":").map(Number);

      const startTimeInMinutes = startHours * 60 + startMinutes;
      const endTimeInMinutes = endHours * 60 + endMinutes;

      if (currentTimeInMinutes < startTimeInMinutes) {
        const timeDiff = startTimeInMinutes - currentTimeInMinutes;
        const hoursLeft = Math.floor(timeDiff / 60);
        const minutesLeft = timeDiff % 60;
        statusElement.innerHTML = `<i class="fas fa-clock" style="color:orange;"></i> Check-in will be available in ${hoursLeft}h ${minutesLeft}m`;
      } else {
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(startHours, startMinutes, 0, 0);

        const timeDiff = tomorrow - now;
        const hoursLeft = Math.floor(timeDiff / (1000 * 60 * 60));
        const minutesLeft = Math.floor(
          (timeDiff % (1000 * 60 * 60)) / (1000 * 60)
        );
        statusElement.innerHTML = `<i class="fas fa-clock" style="color:orange;"></i> Check-in will be available tomorrow in ${hoursLeft}h ${minutesLeft}m`;
      }
    }
  }
}

function showEarlyCheckinPopup() {
  document.getElementById("earlyCheckinPopup").style.display = "flex";
}

function closeEarlyCheckinPopup() {
  document.getElementById("earlyCheckinPopup").style.display = "none";
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

  if (!sessionStartTime || !timeRemaining) {
    if (timeRemaining) {
      const minutes = Math.floor(TIME_LIMIT_MINUTES);
      const seconds = Math.floor((TIME_LIMIT_MINUTES % 1) * 60);
      timeRemaining.textContent = `${minutes
        .toString()
        .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
      timeRemaining.style.color = "var(--primary)";
    }
    return;
  }

  const startTime = getStorage("usage_start_time");
  if (!startTime) return;

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

function updateDoorVisibility() {
  DEVICES.forEach((device) => {
    const container = document.getElementById(`${device.button_id}Container`);
    if (container) {
      container.style.display = device.visible ? "block" : "none";
    }
  });
}

// =============================================
// GESTIONE CAMBIAMENTO CODICE
// =============================================

function setupCodeChangeListener() {
  CODE_CHECK_INTERVAL = setInterval(() => {
    checkCodeVersion();
  }, 2000);

  LINK_CHECK_INTERVAL = setInterval(() => {
    checkExpiredLinks();
  }, 60000);

  window.addEventListener("storage", function (e) {
    if (e.key === "code_version" || e.key === "last_code_update") {
      checkCodeVersion();
    }
  });
}

function checkCodeVersion() {
  if (isTokenSession && currentTokenCustomCode) return;

  database
    .ref("settings/code_version")
    .once("value")
    .then((snapshot) => {
      if (snapshot.exists()) {
        const firebaseVersion = parseInt(snapshot.val());
        const localVersion =
          parseInt(localStorage.getItem("code_version")) || 1;
        const savedVersion = Math.max(firebaseVersion, localVersion);

        if (savedVersion > currentCodeVersion) {
          handleCodeChange(savedVersion);
        }
      }
    })
    .catch((error) => {
      console.error("Errore nel controllo della versione del codice:", error);
      const savedVersion = parseInt(localStorage.getItem("code_version")) || 1;
      if (savedVersion > currentCodeVersion) {
        handleCodeChange(savedVersion);
      }
    });
}

function handleCodeChange(newVersion) {
  currentCodeVersion = newVersion;

  database
    .ref("settings/secret_code")
    .once("value")
    .then((codeSnapshot) => {
      if (codeSnapshot.exists()) {
        CORRECT_CODE = codeSnapshot.val();
        localStorage.setItem("secret_code", CORRECT_CODE);
        resetSessionForNewCode();
      }
    });
}

function resetSessionForNewCode() {
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

  showNotification(
    "Il codice di accesso è stato aggiornato. Inserisci il nuovo codice."
  );
}

function checkExpiredLinks() {
  const secureLinks = JSON.parse(localStorage.getItem("secure_links") || "{}");
  let updated = false;

  Object.keys(secureLinks).forEach((linkId) => {
    const link = secureLinks[linkId];
    if (link.expiration < Date.now() && link.status === "active") {
      secureLinks[linkId].status = "expired";
      updated = true;
    }
  });

  if (updated) {
    localStorage.setItem("secure_links", JSON.stringify(secureLinks));
  }
}

function showNotification(message, type = "info") {
  const existingNotification = document.getElementById(
    "codeChangeNotification"
  );
  if (existingNotification) existingNotification.remove();

  const notification = document.createElement("div");
  notification.id = "codeChangeNotification";
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${type === "warning" ? "#FFA500" : "#FF5A5F"};
    color: white;
    padding: 15px 20px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    z-index: 10000;
    display: flex;
    align-items: center;
    gap: 10px;
  `;

  notification.innerHTML = `
    <i class="fas fa-info-circle"></i>
    <span>${message}</span>
    <button onclick="this.parentElement.remove()" style="background:none; border:none; color:white; margin-left:10px; cursor:pointer;">
      <i class="fas fa-times"></i>
    </button>
  `;

  document.body.appendChild(notification);

  setTimeout(() => {
    if (notification.parentElement) notification.remove();
  }, 5000);
}

// =============================================
// GESTIONE POPUP E INTERAZIONI
// =============================================

function showConfirmationPopup(device) {
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
  if (!popup) return;

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
  if (!sessionStartTime) {
    // Se l'utente clicca senza login, inizializza una sessione manuale
    sessionStartTime = Date.now();
    await setUsageStartTime();
  }

  if (await checkTimeLimit()) return;
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

async function updateGlobalCodeVersion() {
  const savedVersion = parseInt(localStorage.getItem(CODE_VERSION_KEY)) || 1;
  if (savedVersion < currentCodeVersion) {
    localStorage.setItem(CODE_VERSION_KEY, currentCodeVersion.toString());
    resetSessionForNewCode();
    return true;
  }
  return false;
}

// =============================================
// GESTIONE TOKEN SICURI (Firebase secure_links/*)
// =============================================

async function handleSecureToken() {
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get("token");

  if (!token) {
    isTokenSession = false;
    window.isTokenSession = false;
    currentTokenCustomCode = null;
    return false;
  }

  try {
    const snapshot = await database.ref("secure_links/" + token).once("value");
    if (!snapshot.exists()) {
      showTokenError("Token non valido");
      cleanUrl();
      return false;
    }

    const linkData = snapshot.val();
    const isValid = validateSecureToken(linkData);

    if (!isValid.valid) {
      showTokenError(isValid.reason);
      cleanUrl();
      return false;
    }

    isTokenSession = true;
    window.isTokenSession = true; // per compatibilità con vecchi riferimenti
    currentTokenId = token;
    currentTokenCustomCode = linkData.customCode || null;

    showTokenNotification(isValid.remainingUses, !!currentTokenCustomCode);
    await incrementTokenUsage(token, linkData);
    cleanUrl();
    startTokenExpirationCheck(linkData.expiration);

    return true;
  } catch (error) {
    console.error("Errore nella verifica del token:", error);
    showTokenError("Errore di verifica");
    cleanUrl();
    return false;
  }
}

function validateSecureToken(linkData) {
  try {
    if (!linkData) return { valid: false, reason: "Token non valido" };
    if (linkData.status !== "active")
      return { valid: false, reason: "Token revocato" };
    if (linkData.expiration < Date.now())
      return { valid: false, reason: "Token scaduto" };
    if (linkData.usedCount >= linkData.maxUsage)
      return { valid: false, reason: "Utilizzi esauriti" };

    const remainingUses = linkData.maxUsage - linkData.usedCount;
    return { valid: true, remainingUses: remainingUses };
  } catch (error) {
    return { valid: false, reason: "Errore di verifica" };
  }
}

async function incrementTokenUsage(token, linkData) {
  const newUsedCount = linkData.usedCount + 1;
  const newStatus = newUsedCount >= linkData.maxUsage ? "used" : "active";

  try {
    await database.ref("secure_links/" + token).update({
      usedCount: newUsedCount,
      status: newStatus,
    });
  } catch (error) {
    console.error("Errore nell'aggiornamento del token:", error);
  }
}

function showTokenNotification(remainingUses, hasCustomCode) {
  const notification = document.createElement("div");
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: var(--success);
    color: white;
    padding: 15px 20px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    z-index: 10000;
    display: flex;
    align-items: center;
    gap: 10px;
    max-width: 350px;
  `;

  const customCodeInfo = hasCustomCode
    ? '<div style="font-size: 12px; opacity: 0.9;">Questo link usa un codice dedicato</div>'
    : '<div style="font-size: 12px; opacity: 0.9;">Questo link usa il codice principale</div>';

  notification.innerHTML = `
    <i class="fas fa-check-circle"></i>
    <div>
      <div>Link sicuro riconosciuto</div>
      <div style="font-size: 12px; opacity: 0.9;">Utilizzi rimanenti: ${remainingUses}</div>
      ${customCodeInfo}
      <div style="font-size: 12px; opacity: 0.9; margin-top: 5px;">
        <i class="fas fa-info-circle"></i> Inserisci il codice qui sotto
      </div>
    </div>
    <button onclick="this.parentElement.remove()" style="
      background: none;
      border: none;
      color: white;
      margin-left: 10px;
      cursor: pointer;
    ">
      <i class="fas fa-times"></i>
    </button>
  `;

  document.body.appendChild(notification);
  setTimeout(() => {
    if (notification.parentElement) notification.remove();
  }, 5000);
}

function showTokenError(reason) {
  const notification = document.createElement("div");
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: var(--error);
    color: white;
    padding: 15px 20px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    z-index: 10000;
    display: flex;
    align-items: center;
    gap: 10px;
    max-width: 300px;
  `;

  notification.innerHTML = `
    <i class="fas fa-exclamation-triangle"></i>
    <div>
      <div>Link non valido</div>
      <div style="font-size: 12px; opacity: 0.9;">Motivo: ${reason}</div>
    </div>
    <button onclick="this.parentElement.remove()" style="
      background: none;
      border: none;
      color: white;
      margin-left: 10px;
      cursor: pointer;
    ">
      <i class="fas fa-times"></i>
    </button>
  `;

  document.body.appendChild(notification);
  setTimeout(() => {
    if (notification.parentElement) notification.remove();
  }, 5000);
}

function cleanUrl() {
  if (window.history.replaceState) {
    const cleanUrl = window.location.origin + window.location.pathname;
    window.history.replaceState({}, document.title, cleanUrl);
  }
}

function startTokenExpirationCheck(expirationTime) {
  const checkTokenExpiration = setInterval(() => {
    // if (Date.now() > expirationTime) {
    //   clearInterval(checkTokenExpiration);
    //   // per token scaduto, mostriamo messaggi dedicati (overlay manuale non usato)
    //   showNotification("Questo link di accesso è scaduto.", "warning");
    // }
    if (Date.now() > expirationTime) {
      clearInterval(checkTokenExpiration);
      // Blocco duro anche per i token:
      isTokenSession = false;
      window.isTokenSession = false;
      showSessionExpired(); // overlay + pulsanti off
    }

  }, 1000);
}

// =============================================
// AUTENTICAZIONE UTENTE
// =============================================

async function performManualLogin() {
  // FIX: inizializza sessione PRIMA di eseguire i check, e salva hash
  isTokenSession = false;
  window.isTokenSession = false; // compatibilità con eventuali riferimenti legacy
  sessionStartTime = Date.now();
  await setUsageStartTime();

  if (await checkTimeLimit()) return;

  document.getElementById("controlPanel").style.display = "block";
  document.getElementById("authCode").style.display = "none";
  document.getElementById("auth-form").style.display = "none";
  document.getElementById("btnCheckCode").style.display = "none";
  document.getElementById("important").style.display = "none";

  document.getElementById("checkinTimeInfo").style.display = "block";
  updateCheckinTimeDisplay();

  DEVICES.forEach(updateButtonState);
  updateStatusBar();
}

async function handleCodeSubmit() {
  const insertedCode = document.getElementById("authCode").value.trim();
  let expectedCode;

  if (isTokenSession && currentTokenCustomCode) {
    expectedCode = currentTokenCustomCode;
    console.log("Verifica con codice personalizzato del link:", expectedCode);
  } else {
    expectedCode = CORRECT_CODE;
    console.log("Verifica con codice principale:", expectedCode);
  }

  if (insertedCode !== expectedCode) {
    alert("Codice errato! Riprova.");
    return;
  }

  await performManualLogin();
}

// =============================================
// INIZIALIZZAZIONE DELL'APPLICAZIONE
// =============================================

async function init() {
  console.log("Inizializzazione app...");

  // Carica impostazioni da Firebase
  const firebaseSettings = await loadSettingsFromFirebase();
  if (firebaseSettings) {
    applyFirebaseSettings(firebaseSettings);
  }

  // Gestione sessione bloccata (solo warning console)
  if (isSessionStuck()) {
    console.warn("Rilevata possibile sessione bloccata");
  }

  // Gestione versione codice
  const savedCodeVersion =
    parseInt(localStorage.getItem(CODE_VERSION_KEY)) || 1;
  if (savedCodeVersion < currentCodeVersion) {
    resetSessionForNewCode();
  }

  // Setup event listeners
  setupEventListeners();

  // Verifica stato sessione manuale preesistente
  const expired = await checkTimeLimit();
  if (!expired) {
    const startTime = getStorage("usage_start_time");
    if (startTime) {
      sessionStartTime = parseInt(startTime, 10);
      showControlPanel();
    } else {
      showAuthForm();
    }
  } else {
    showAuthForm();
  }

  updateDoorVisibility();

  // Configurazioni Firebase
  setupSettingsListener();
  monitorFirebaseConnection();

  // Gestione token sicuri
  await handleSecureToken();
  setupTokenUI();

  // Avvia intervalli
  setupIntervals();

  // Prevenzione click destro
  document.addEventListener("contextmenu", (e) => e.preventDefault());

  updateCheckinTimeDisplay();
}

function applyFirebaseSettings(settings) {
  CORRECT_CODE = settings.secret_code || "2245";
  MAX_CLICKS = parseInt(settings.max_clicks) || 3;
  TIME_LIMIT_MINUTES = parseInt(settings.time_limit_minutes) || 50000;

  localStorage.setItem("secret_code", CORRECT_CODE);
  localStorage.setItem("max_clicks", MAX_CLICKS.toString());
  localStorage.setItem("time_limit_minutes", TIME_LIMIT_MINUTES.toString());

  if (settings.code_version) {
    currentCodeVersion = parseInt(settings.code_version);
    localStorage.setItem("code_version", currentCodeVersion.toString());
  }
}

function setupEventListeners() {
  const btnCheck = document.getElementById("btnCheckCode");
  if (btnCheck) btnCheck.addEventListener("click", handleCodeSubmit);

  DEVICES.forEach((device) => {
    const btn = document.getElementById(device.button_id);
    if (btn) {
      btn.addEventListener("click", () => showConfirmationPopup(device));
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
}

function showControlPanel() {
  document.getElementById("controlPanel").style.display = "block";
  document.getElementById("authCode").style.display = "none";
  document.getElementById("auth-form").style.display = "none";
  document.getElementById("btnCheckCode").style.display = "none";
  document.getElementById("important").style.display = "none";
  document.getElementById("checkinTimeInfo").style.display = "block";
  updateCheckinTimeDisplay();
  DEVICES.forEach(updateButtonState);
  updateStatusBar();
}

function showAuthForm() {
  document.getElementById("controlPanel").style.display = "none";
  document.getElementById("authCode").style.display = "block";
  document.getElementById("auth-form").style.display = "block";
  document.getElementById("btnCheckCode").style.display = "block";
  document.getElementById("important").style.display = "block";
}

function setupTokenUI() {
  if (!isTokenSession) return;

  const adminLink = document.querySelector('a[href="admin.html"]');
  if (adminLink) adminLink.style.display = "none";

  const expiredMessage = document.querySelector("#sessionExpired p");
  if (expiredMessage) {
    expiredMessage.textContent =
      "Il link di accesso è scaduto. Per accedere di nuovo, richiedi un nuovo link.";
  }

  const assistanceBtn = document.querySelector("#sessionExpired .btn-whatsapp");
  if (assistanceBtn) {
    assistanceBtn.href =
      "https://api.whatsapp.com/send?phone=+393898883634&text=Hi, I need a new access link";
    assistanceBtn.innerHTML =
      '<i class="fab fa-whatsapp"></i> Richiedi nuovo link';
  }

  const authCodeInput = document.getElementById("authCode");
  if (authCodeInput) {
    if (currentTokenCustomCode) {
      authCodeInput.placeholder = "Inserisci il codice dedicato del link";
    } else {
      authCodeInput.placeholder = "Inserisci il codice principale";
    }
  }
}

function setupIntervals() {
  setupCodeChangeListener();

  timeCheckInterval = setInterval(async () => {
    const expired = await checkTimeLimit();
    if (!expired) {
      await updateGlobalCodeVersion();
      updateCheckinTimeDisplay();
    }
  }, 1000);

  setInterval(updateCheckinTimeDisplay, 60000);
}

// =============================================
// AVVIO DELL'APPLICAZIONE
// =============================================

document.addEventListener("DOMContentLoaded", init);

// Pulisci gli intervalli quando la pagina viene chiusa
window.addEventListener("beforeunload", function () {
  if (timeCheckInterval) clearInterval(timeCheckInterval);
  if (codeCheckInterval) clearInterval(codeCheckInterval);
});
