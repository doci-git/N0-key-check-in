// app.js - Sistema di Check-in Porte con JWT
// Sicurezza migliorata con session locking

// =============================================
// CONFIGURAZIONE E INIZIALIZZazione
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
const JWT_SECRET = "musart_jwt_secret_2024_enhanced_security_v2";
const CODE_VERSION_KEY = "code_version";
const SESSION_LOCK_KEY = "session_lock";

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
let CHECKIN_START_TIME = localStorage.getItem("checkin_start_time") || "14:00";
let CHECKIN_END_TIME = localStorage.getItem("checkin_end_time") || "22:00";
let CHECKIN_TIME_ENABLED =
  localStorage.getItem("checkin_time_enabled") !== "false";

// Variabili di stato
let isTokenSession = false;
let currentTokenId = null;
let currentJWT = null;
let sessionStartTime = null;
let currentDevice = null;
let timeCheckInterval;
let codeCheckInterval;
let isSessionLocked = false;

// Inizializza Firebase
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// =============================================
// FUNZIONI JWT E CRITTOGRAFIA
// =============================================

class JWTHelper {
  static base64UrlEncode(str) {
    return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  }

  static base64UrlDecode(str) {
    str = str.replace(/-/g, "+").replace(/_/g, "/");
    while (str.length % 4) str += "=";
    return atob(str);
  }

  static async generateHash(str) {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  static async createJWT(payload, expirationMinutes = 60) {
    const header = {
      alg: "HS256",
      typ: "JWT",
    };

    const expiration = Date.now() + expirationMinutes * 60 * 1000;
    const sessionLock = await this.generateHash(
      Date.now() + Math.random().toString()
    );

    const enhancedPayload = {
      ...payload,
      iss: "musart-checkin-system",
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(expiration / 1000),
      jti: await this.generateHash(Date.now() + Math.random().toString()),
      slk: sessionLock, // Session Lock Key
    };

    const encodedHeader = this.base64UrlEncode(JSON.stringify(header));
    const encodedPayload = this.base64UrlEncode(
      JSON.stringify(enhancedPayload)
    );

    const signatureInput = `${encodedHeader}.${encodedPayload}`;
    const signature = await this.generateHash(signatureInput + JWT_SECRET);
    const encodedSignature = this.base64UrlEncode(signature);

    // Salva il session lock separatamente
    localStorage.setItem(SESSION_LOCK_KEY, sessionLock);

    return `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
  }

  static async verifyJWT(token) {
    try {
      const parts = token.split(".");
      if (parts.length !== 3)
        return { valid: false, reason: "Formato token non valido" };

      const [encodedHeader, encodedPayload, encodedSignature] = parts;

      const signatureInput = `${encodedHeader}.${encodedPayload}`;
      const expectedSignature = await this.generateHash(
        signatureInput + JWT_SECRET
      );
      const decodedSignature = this.base64UrlDecode(encodedSignature);

      if (decodedSignature !== expectedSignature) {
        return { valid: false, reason: "Firma JWT non valida" };
      }

      const payload = JSON.parse(this.base64UrlDecode(encodedPayload));

      if (payload.exp * 1000 < Date.now()) {
        return { valid: false, reason: "Token scaduto" };
      }

      // Verifica session lock
      const storedSessionLock = localStorage.getItem(SESSION_LOCK_KEY);
      if (!storedSessionLock || payload.slk !== storedSessionLock) {
        return { valid: false, reason: "Sessione bloccata" };
      }

      return { valid: true, payload };
    } catch (error) {
      return { valid: false, reason: "Errore nella verifica del token" };
    }
  }
}

// =============================================
// GESTIONE SICUREZZA E STORAGE
// =============================================

class SecureStorage {
  static async setEncrypted(key, value, minutes = 1440) {
    try {
      const encryptedValue = await JWTHelper.createJWT(
        { data: value },
        minutes
      );
      localStorage.setItem(key, encryptedValue);

      const expirationDate = new Date();
      expirationDate.setTime(expirationDate.getTime() + minutes * 60 * 1000);
      const expires = "expires=" + expirationDate.toUTCString();

      document.cookie = `${key}=${encryptedValue}; ${expires}; path=/; Secure; SameSite=Strict`;
      return true;
    } catch (error) {
      console.error("Errore nella cifratura dei dati:", error);
      return false;
    }
  }

  static async getDecrypted(key) {
    try {
      // Prova localStorage prima
      const localValue = localStorage.getItem(key);
      if (localValue) {
        const verification = await JWTHelper.verifyJWT(localValue);
        if (verification.valid) {
          return verification.payload.data;
        }
      }

      // Fallback ai cookie
      const cookies = document.cookie.split(";");
      for (let cookie of cookies) {
        const [name, value] = cookie.trim().split("=");
        if (name === key && value) {
          const verification = await JWTHelper.verifyJWT(value);
          if (verification.valid) {
            return verification.payload.data;
          }
        }
      }
    } catch (error) {
      console.error("Errore nella decifratura dei dati:", error);
    }
    return null;
  }

  static clear(key) {
    try {
      localStorage.removeItem(key);
      document.cookie = `${key}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
    } catch (error) {
      console.error("Errore nella pulizia dei dati:", error);
    }
  }

  static clearAllSessionData() {
    try {
      // Rimuove tutti i dati di sessione
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (
          key.startsWith("clicks_") ||
          key === "user_session" ||
          key === SESSION_LOCK_KEY
        ) {
          keysToRemove.push(key);
        }
      }

      keysToRemove.forEach((key) => this.clear(key));

      // Pulisci i cookie di sessione
      const cookies = document.cookie.split(";");
      for (let cookie of cookies) {
        const [name] = cookie.trim().split("=");
        if (name === "user_session") {
          document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
        }
      }
    } catch (error) {
      console.error("Errore nella pulizia della sessione:", error);
    }
  }
}

// =============================================
// GESTIONE SESSIONE UTENTE CON LOCK
// =============================================

class SessionManager {
  static async startSession(userType = "standard", customData = {}) {
    // Prima pulisci qualsiasi sessione precedente
    this.clearSession();

    const sessionData = {
      userType,
      startTime: Date.now(),
      deviceFingerprint: await this.generateDeviceFingerprint(),
      sessionId: await this.generateSessionId(),
      ...customData,
    };

    const sessionJWT = await JWTHelper.createJWT(
      sessionData,
      TIME_LIMIT_MINUTES
    );
    await SecureStorage.setEncrypted(
      "user_session",
      sessionJWT,
      TIME_LIMIT_MINUTES
    );

    sessionStartTime = Date.now();
    isSessionLocked = false;

    // Salva info aggiuntive per il controllo
    localStorage.setItem("session_start_time", sessionStartTime.toString());
    localStorage.setItem(
      "session_device_fingerprint",
      sessionData.deviceFingerprint
    );

    return sessionJWT;
  }

  static async validateSession() {
    try {
      // Controlla se la sessione è bloccata
      if (isSessionLocked) {
        return { valid: false, reason: "Sessione bloccata" };
      }

      const sessionJWT = await SecureStorage.getDecrypted("user_session");
      if (!sessionJWT)
        return { valid: false, reason: "Nessuna sessione attiva" };

      const verification = await JWTHelper.verifyJWT(sessionJWT);
      if (!verification.valid) {
        this.clearSession();
        return verification;
      }

      // Verifica fingerprint del dispositivo
      const currentFingerprint = await this.generateDeviceFingerprint();
      if (verification.payload.deviceFingerprint !== currentFingerprint) {
        this.lockSession();
        return { valid: false, reason: "Dispositivo non autorizzato" };
      }

      // Verifica integrità temporale
      const storedStartTime = localStorage.getItem("session_start_time");
      if (
        !storedStartTime ||
        parseInt(storedStartTime) !== verification.payload.startTime
      ) {
        this.lockSession();
        return { valid: false, reason: "Sessione compromessa" };
      }

      return verification;
    } catch (error) {
      this.lockSession();
      return { valid: false, reason: "Errore nella validazione" };
    }
  }

  static lockSession() {
    isSessionLocked = true;
    localStorage.setItem("session_locked", "true");
    this.clearSession();
  }

  static isSessionLocked() {
    return localStorage.getItem("session_locked") === "true" || isSessionLocked;
  }

  static async generateDeviceFingerprint() {
    const components = [
      navigator.userAgent,
      navigator.language,
      navigator.hardwareConcurrency,
      screen.width + "x" + screen.height,
      new Date().getTimezoneOffset(),
    ].join("|");

    return await JWTHelper.generateHash(components);
  }

  static async generateSessionId() {
    return await JWTHelper.generateHash(
      Date.now() + Math.random().toString() + navigator.userAgent
    );
  }

  static clearSession() {
    SecureStorage.clearAllSessionData();
    sessionStartTime = null;
    currentJWT = null;
    isTokenSession = false;
    currentTokenId = null;
    isSessionLocked = false;

    // Mantieni solo le impostazioni di sistema
    const systemKeys = [
      "secret_code",
      "max_clicks",
      "time_limit_minutes",
      "code_version",
      "checkin_start_time",
      "checkin_end_time",
      "checkin_time_enabled",
    ];

    // Pulisci i flag di sessione
    localStorage.removeItem("session_locked");
    localStorage.removeItem("session_start_time");
    localStorage.removeItem("session_device_fingerprint");
  }

  static async getSessionInfo() {
    const validation = await this.validateSession();
    if (validation.valid) {
      return validation.payload;
    }
    return null;
  }

  static async forceLogout() {
    this.lockSession();
    showSessionExpired();
  }
}

// =============================================
// GESTIONE TOKEN SICURI (JWT BASED)
// =============================================

class SecureTokenManager {
  static async handleSecureToken() {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get("token");

    if (!token) {
      isTokenSession = false;
      currentTokenId = null;
      return false;
    }

    try {
      // Verifica prima come JWT
      const jwtVerification = await JWTHelper.verifyJWT(token);
      if (jwtVerification.valid) {
        return await this.handleJWTSession(jwtVerification.payload, token);
      }

      // Fallback al sistema legacy Firebase
      return await this.handleLegacyToken(token);
    } catch (error) {
      this.showTokenError("Errore nella verifica del token");
      this.cleanUrl();
      return false;
    }
  }

  static async handleJWTSession(payload, token) {
    if (payload.type !== "secure_link") {
      this.showTokenError("Tipo di token non supportato");
      return false;
    }

    if (payload.maxUsage && payload.usedCount >= payload.maxUsage) {
      this.showTokenError("Utilizzi esauriti");
      return false;
    }

    // Verifica se c'è già una sessione attiva
    const existingSession = await SessionManager.validateSession();
    if (existingSession.valid) {
      this.showTokenError("Sessione già attiva. Effettua prima il logout.");
      return false;
    }

    isTokenSession = true;
    currentJWT = token;
    currentTokenId = payload.jti;

    // Crea sessione utente
    await SessionManager.startSession("secure_link", {
      tokenData: payload,
      customCode: payload.customCode,
    });

    this.showTokenNotification(
      payload.maxUsage - (payload.usedCount || 0),
      !!payload.customCode
    );
    this.cleanUrl();

    return true;
  }

  static async handleLegacyToken(token) {
    const snapshot = await database.ref("secure_links/" + token).once("value");
    if (!snapshot.exists()) {
      this.showTokenError("Token non valido");
      this.cleanUrl();
      return false;
    }

    const linkData = snapshot.val();
    const isValid = this.validateLegacyToken(linkData);

    if (!isValid.valid) {
      this.showTokenError(isValid.reason);
      this.cleanUrl();
      return false;
    }

    // Converti a JWT per sicurezza
    const jwtPayload = {
      type: "secure_link",
      jti: token,
      maxUsage: linkData.maxUsage,
      usedCount: linkData.usedCount,
      customCode: linkData.customCode,
      expiration: linkData.expiration,
    };

    const jwtToken = await JWTHelper.createJWT(
      jwtPayload,
      Math.floor((linkData.expiration - Date.now()) / (1000 * 60))
    );

    return await this.handleJWTSession(jwtPayload, jwtToken);
  }

  static validateLegacyToken(linkData) {
    if (!linkData) return { valid: false, reason: "Token non valido" };
    if (linkData.status !== "active")
      return { valid: false, reason: "Token revocato" };
    if (linkData.expiration < Date.now())
      return { valid: false, reason: "Token scaduto" };
    if (linkData.usedCount >= linkData.maxUsage)
      return { valid: false, reason: "Utilizzi esauriti" };

    const remainingUses = linkData.maxUsage - linkData.usedCount;
    return { valid: true, remainingUses };
  }

  static showTokenNotification(remainingUses, hasCustomCode) {
    const notification = document.createElement("div");
    notification.style.cssText = `
      position: fixed; top: 20px; right: 20px; background: var(--success);
      color: white; padding: 15px 20px; border-radius: 8px; z-index: 10000;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3); max-width: 350px;
    `;

    notification.innerHTML = `
      <i class="fas fa-shield-alt"></i>
      <div style="flex: 1;">
        <strong>Accesso sicuro JWT attivo</strong>
        <div style="font-size: 12px; opacity: 0.9;">Utilizzi rimanenti: ${remainingUses}</div>
        <div style="font-size: 12px; opacity: 0.9;">
          ${hasCustomCode ? "Codice dedicato" : "Codice principale"}
        </div>
      </div>
      <button onclick="this.parentElement.remove()" style="background: none; border: none; color: white; cursor: pointer;">
        <i class="fas fa-times"></i>
      </button>
    `;

    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 5000);
  }

  static showTokenError(reason) {
    const notification = document.createElement("div");
    notification.style.cssText = `
      position: fixed; top: 20px; right: 20px; background: var(--error);
      color: white; padding: 15px 20px; border-radius: 8px; z-index: 10000;
    `;

    notification.innerHTML = `
      <i class="fas fa-exclamation-triangle"></i>
      <span>Token error: ${reason}</span>
      <button onclick="this.parentElement.remove()" style="background: none; border: none; color: white; cursor: pointer;">
        <i class="fas fa-times"></i>
      </button>
    `;

    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 5000);
  }

  static cleanUrl() {
    if (window.history.replaceState) {
      const cleanUrl = window.location.origin + window.location.pathname;
      window.history.replaceState({}, document.title, cleanUrl);
    }
  }
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
      updateSettingsFromFirebase(snapshot.val());
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

// =============================================
// GESTIONE TEMPO E SESSIONE
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

function showSessionExpired() {
  // Blocca la sessione prima di mostrare il messaggio
  SessionManager.lockSession();

  clearInterval(timeCheckInterval);
  clearInterval(codeCheckInterval);

  // Mostra overlay di sessione scaduta
  const expiredOverlay = document.getElementById("expiredOverlay");
  const controlPanel = document.getElementById("controlPanel");
  const sessionExpired = document.getElementById("sessionExpired");
  const authSection = document.getElementById("authSection");

  if (expiredOverlay) expiredOverlay.classList.remove("hidden");
  if (controlPanel) controlPanel.classList.add("hidden");
  if (sessionExpired) sessionExpired.classList.remove("hidden");
  if (authSection) authSection.style.display = "none";

  // Disabilita tutti i pulsanti
  DEVICES.forEach((device) => {
    const btn = document.getElementById(device.button_id);
    if (btn) {
      btn.disabled = true;
      btn.classList.add("btn-error");
    }
  });

  // Aggiorna stato sicurezza
  const securityStatus = document.getElementById("securityStatus");
  if (securityStatus) {
    securityStatus.textContent = "Scaduta";
    securityStatus.style.color = "var(--error)";
  }
}

// =============================================
// GESTIONE INTERFACCIA E STATO
// =============================================

function updateStatusBar() {
  const mainDoorCounter = document.getElementById("mainDoorCounter");
  const aptDoorCounter = document.getElementById("aptDoorCounter");
  const timeRemaining = document.getElementById("timeRemaining");

  if (mainDoorCounter) {
    getClicksLeft(DEVICES[0].storage_key).then((clicks) => {
      mainDoorCounter.textContent = `${clicks} click left`;
    });
  }

  if (aptDoorCounter) {
    getClicksLeft(DEVICES[1].storage_key).then((clicks) => {
      aptDoorCounter.textContent = `${clicks} click left`;
    });
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

  const now = Date.now();
  const minutesPassed = (now - sessionStartTime) / (1000 * 60);
  const minutesLeft = Math.max(
    0,
    Math.floor(TIME_LIMIT_MINUTES - minutesPassed)
  );
  const secondsLeft = Math.max(0, Math.floor(60 - (minutesPassed % 1) * 60));

  if (timeRemaining) {
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
}

async function getClicksLeft(key) {
  const stored = await SecureStorage.getDecrypted(key);
  return stored === null ? MAX_CLICKS : parseInt(stored, 10);
}

async function setClicksLeft(key, count) {
  await SecureStorage.setEncrypted(key, count.toString(), TIME_LIMIT_MINUTES);
  updateStatusBar();
}

function updateButtonState(device) {
  const btn = document.getElementById(device.button_id);
  if (!btn) return;

  getClicksLeft(device.storage_key).then((clicksLeft) => {
    btn.disabled =
      clicksLeft <= 0 || !isCheckinTime() || SessionManager.isSessionLocked();

    if (SessionManager.isSessionLocked()) {
      btn.classList.add("btn-error");
      btn.classList.remove("btn-success");
    } else if (clicksLeft <= 0) {
      btn.classList.add("btn-error");
      btn.classList.remove("btn-success");
    } else if (!isCheckinTime()) {
      btn.classList.remove("btn-error", "btn-success");
    } else {
      btn.classList.add("btn-success");
      btn.classList.remove("btn-error");
    }
  });
}

// =============================================
// COMUNICAZIONE CON DISPOSITIVI SHELLY
// =============================================

async function activateDevice(device) {
  // Verifica preliminare della sessione
  if (SessionManager.isSessionLocked()) {
    showSessionExpired();
    return;
  }

  if (!sessionStartTime) {
    sessionStartTime = Date.now();
    await SessionManager.startSession(
      isTokenSession ? "secure_link" : "standard"
    );
  }

  const sessionValid = await SessionManager.validateSession();
  if (!sessionValid.valid) {
    showSessionExpired();
    return;
  }

  if (!isCheckinTime()) {
    showEarlyCheckinPopup();
    return;
  }

  let clicksLeft = await getClicksLeft(device.storage_key);
  if (clicksLeft <= 0) {
    showDevicePopup(device, clicksLeft);
    updateButtonState(device);
    return;
  }

  clicksLeft--;
  await setClicksLeft(device.storage_key, clicksLeft);
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
      logDeviceAction(device.button_id, "success");
    } else {
      await setClicksLeft(device.storage_key, clicksLeft + 1);
      updateButtonState(device);
      logDeviceAction(device.button_id, "error", response.statusText);
    }
  } catch (error) {
    console.error("Attivazione dispositivo fallita:", error);
    await setClicksLeft(device.storage_key, clicksLeft + 1);
    updateButtonState(device);
    logDeviceAction(device.button_id, "error", error.message);
  }
}

function logDeviceAction(doorName, status, error = null) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    door: doorName,
    status: status,
    error: error,
    sessionType: isTokenSession ? "secure_link" : "standard",
    sessionLocked: SessionManager.isSessionLocked(),
  };

  try {
    const actionLogs =
      JSON.parse(localStorage.getItem("deviceActionLogs")) || [];
    actionLogs.unshift(logEntry);
    if (actionLogs.length > 50) actionLogs.splice(50);
    localStorage.setItem("deviceActionLogs", JSON.stringify(actionLogs));
  } catch (error) {
    console.error("Errore nel salvataggio log:", error);
  }
}

// =============================================
// GESTIONE POPUP E INTERAZIONI
// =============================================

function showConfirmationPopup(device) {
  if (SessionManager.isSessionLocked()) {
    showSessionExpired();
    return;
  }

  if (!isCheckinTime()) {
    showEarlyCheckinPopup();
    return;
  }

  currentDevice = device;
  const doorName = device.button_id
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (str) => str.toUpperCase());

  const confirmationMessage = document.getElementById("confirmationMessage");
  const confirmationPopup = document.getElementById("confirmationPopup");

  if (confirmationMessage) {
    confirmationMessage.textContent = `Are you sure you want to unlock the ${doorName}?`;
  }
  if (confirmationPopup) {
    confirmationPopup.style.display = "flex";
  }
}

function closeConfirmationPopup() {
  const confirmationPopup = document.getElementById("confirmationPopup");
  if (confirmationPopup) {
    confirmationPopup.style.display = "none";
  }
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

function showEarlyCheckinPopup() {
  const earlyCheckinPopup = document.getElementById("earlyCheckinPopup");
  if (earlyCheckinPopup) {
    earlyCheckinPopup.style.display = "flex";
  }
}

function closeEarlyCheckinPopup() {
  const earlyCheckinPopup = document.getElementById("earlyCheckinPopup");
  if (earlyCheckinPopup) {
    earlyCheckinPopup.style.display = "none";
  }
}

// =============================================
// AUTENTICAZIONE UTENTE
// =============================================

async function handleCodeSubmit() {
  if (SessionManager.isSessionLocked()) {
    showError("Sessione bloccata. Contatta l'assistenza.");
    return;
  }

  const authCodeInput = document.getElementById("authCode");
  if (!authCodeInput) return;

  const insertedCode = authCodeInput.value.trim();
  let expectedCode = CORRECT_CODE;

  if (isTokenSession) {
    const sessionInfo = await SessionManager.getSessionInfo();
    if (sessionInfo && sessionInfo.customCode) {
      expectedCode = sessionInfo.customCode;
    }
  }

  if (insertedCode !== expectedCode) {
    showError("Codice errato! Riprova.");

    // Log tentativo fallito
    logAuthAttempt(insertedCode, false);
    return;
  }

  // Log accesso riuscito
  logAuthAttempt(insertedCode, true);

  await SessionManager.startSession(
    isTokenSession ? "secure_link" : "standard"
  );
  await showControlPanel();
}

function logAuthAttempt(code, success) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    code: success ? "***" : code, // Nascondi il codice solo se successo
    success: success,
    isTokenSession: isTokenSession,
    userAgent: navigator.userAgent,
  };

  try {
    const authLogs = JSON.parse(localStorage.getItem("authAttemptLogs")) || [];
    authLogs.unshift(logEntry);
    if (authLogs.length > 20) authLogs.splice(20);
    localStorage.setItem("authAttemptLogs", JSON.stringify(authLogs));
  } catch (error) {
    console.error("Errore nel salvataggio log autenticazione:", error);
  }
}

async function showControlPanel() {
  const controlPanel = document.getElementById("controlPanel");
  const authCode = document.getElementById("authCode");
  const authForm = document.getElementById("auth-form");
  const btnCheckCode = document.getElementById("btnCheckCode");
  const important = document.getElementById("important");
  const checkinTimeInfo = document.getElementById("checkinTimeInfo");

  if (controlPanel) controlPanel.style.display = "block";
  if (authCode) authCode.style.display = "none";
  if (authForm) authForm.style.display = "none";
  if (btnCheckCode) btnCheckCode.style.display = "none";
  if (important) important.style.display = "none";
  if (checkinTimeInfo) checkinTimeInfo.style.display = "block";

  DEVICES.forEach(updateButtonState);
  updateStatusBar();
  startSessionMonitoring();
}

function showAuthForm() {
  const controlPanel = document.getElementById("controlPanel");
  const authCode = document.getElementById("authCode");
  const authForm = document.getElementById("auth-form");
  const btnCheckCode = document.getElementById("btnCheckCode");
  const important = document.getElementById("important");
  const sessionExpired = document.getElementById("sessionExpired");
  const expiredOverlay = document.getElementById("expiredOverlay");

  if (controlPanel) controlPanel.style.display = "none";
  if (authCode) authCode.style.display = "block";
  if (authForm) authForm.style.display = "block";
  if (btnCheckCode) btnCheckCode.style.display = "block";
  if (important) important.style.display = "block";
  if (sessionExpired) sessionExpired.classList.add("hidden");
  if (expiredOverlay) expiredOverlay.classList.add("hidden");

  // Pulisci il campo codice
  if (authCode) authCode.value = "";
}

function showError(message) {
  const errorDiv = document.createElement("div");
  errorDiv.style.cssText = `
    position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
    background: var(--error); color: white; padding: 10px 20px;
    border-radius: 5px; z-index: 10000; box-shadow: 0 2px 10px rgba(0,0,0,0.2);
  `;
  errorDiv.textContent = message;
  document.body.appendChild(errorDiv);
  setTimeout(() => {
    if (errorDiv.parentElement) {
      errorDiv.remove();
    }
  }, 3000);
}

// =============================================
// INIZIALIZZAZIONE DELL'APPLICAZIONE
// =============================================

async function init() {
  console.log("Inizializzazione app con JWT e session locking...");

  // Verifica se la sessione è bloccata
  if (SessionManager.isSessionLocked()) {
    console.log("Sessione bloccata - mostrando schermata di errore");
    showSessionExpired();
    return;
  }

  // Carica impostazioni da Firebase
  const firebaseSettings = await loadSettingsFromFirebase();
  if (firebaseSettings) {
    applyFirebaseSettings(firebaseSettings);
  }

  // Verifica sessione esistente
  const sessionValidation = await SessionManager.validateSession();

  if (sessionValidation.valid) {
    console.log("Sessione valida trovata - mostrando pannello di controllo");
    await showControlPanel();
  } else {
    console.log("Nessuna sessione valida - gestione token o login");
    // Gestione token sicuro
    const tokenHandled = await SecureTokenManager.handleSecureToken();
    if (!tokenHandled) {
      showAuthForm();
    }
  }

  setupEventListeners();
  setupSettingsListener();
  startSecurityIntervals();

  // Prevenzione ispezione
  document.addEventListener("contextmenu", (e) => e.preventDefault());
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === "I") e.preventDefault();
  });

  // Gestione refresh e chiusura pagina
  setupPageProtection();
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

  const authCode = document.getElementById("authCode");
  if (authCode) {
    authCode.addEventListener("keypress", (e) => {
      if (e.key === "Enter") handleCodeSubmit();
    });
  }

  DEVICES.forEach((device) => {
    const btn = document.getElementById(device.button_id);
    if (btn) {
      btn.addEventListener("click", () => showConfirmationPopup(device));
    }
  });

  const confirmYes = document.getElementById("confirmYes");
  if (confirmYes) {
    confirmYes.addEventListener("click", () => {
      if (currentDevice) {
        activateDevice(currentDevice);
        closeConfirmationPopup();
      }
    });
  }

  const confirmNo = document.getElementById("confirmNo");
  if (confirmNo) {
    confirmNo.addEventListener("click", closeConfirmationPopup);
  }
}

function startSessionMonitoring() {
  // Intervallo di verifica sessione ogni secondo
  timeCheckInterval = setInterval(async () => {
    const validation = await SessionManager.validateSession();
    if (!validation.valid) {
      console.log("Sessione non valida - scaduta o bloccata");
      showSessionExpired();
    } else {
      updateStatusBar();
    }
  }, 1000);
}

function startSecurityIntervals() {
  // Pulizia periodica ogni 5 minuti
  setInterval(async () => {
    const sessionValid = await SessionManager.validateSession();
    if (!sessionValid.valid) {
      SessionManager.clearSession();
    }
  }, 300000);
}

function setupPageProtection() {
  // Blocca il refresh accidentale
  window.addEventListener("beforeunload", (e) => {
    if (SessionManager.isSessionLocked()) {
      // Se la sessione è bloccata, permettere il refresh
      return;
    }

    const sessionValid = SessionManager.validateSession();
    if (sessionValid) {
      // Mostra avviso solo se c'è una sessione attiva
      e.preventDefault();
      e.returnValue =
        "Sei sicuro di voler ricaricare la pagina? La sessione potrebbe essere persa.";
      return e.returnValue;
    }
  });

  // Gestione visibilità pagina
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      // Pagina nascosta - aumenta la sicurezza
      console.log("Pagina nascosta - rafforzamento sicurezza");
    } else {
      // Pagina visibile - verifica sessione
      SessionManager.validateSession().then((validation) => {
        if (!validation.valid) {
          showSessionExpired();
        }
      });
    }
  });
}

// =============================================
// FUNZIONI GLOBALI PER IL LOGOUT
// =============================================

function forceLogout() {
  SessionManager.forceLogout();
}

function resetSession() {
  if (
    confirm(
      "Sei sicuro di voler resettare completamente la sessione? Dovrai reinserire il codice."
    )
  ) {
    SessionManager.clearSession();
    showAuthForm();
  }
}

// Esponi le funzioni globali
window.forceLogout = forceLogout;
window.resetSession = resetSession;

// Avvia l'applicazione
document.addEventListener("DOMContentLoaded", init);
