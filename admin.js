// admin.js - Sistema di Amministrazione con JWT
// Sicurezza migliorata e gestione token avanzata

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

const ADMIN_PASSWORD = "1122";
const SHELLY_API_URL =
  "https://shelly-73-eu.shelly.cloud/v2/devices/api/set/switch";
const JWT_SECRET = "musart_jwt_secret_2024_enhanced_security_v2";

// Configurazione dispositivi Shelly
const ADMIN_DEVICES = [
  {
    id: "e4b063f0c38c",
    auth_key:
      "MWI2MDc4dWlk4908A71DA809FCEC05C5D1F360943FBFC6A7934EC0FD9E3CFEAF03F8F5A6A4A0C60665B97A1AA2E2",
    button_id: "btnOpenMainDoor",
    status_id: "mainDoorStatus",
    status_text_id: "mainDoorStatusText",
    result_id: "mainDoorResult",
    name: "Porta Principale",
  },
  {
    id: "34945478d595",
    auth_key:
      "MWI2MDc4dWlk4908A71DA809FCEC05C5D1F360943FBFC6A7934EC0FD9E3CFEAF03F8F5A6A4A0C60665B97A1AA2E2",
    button_id: "btnOpenAptDoor",
    status_id: "aptDoorStatus",
    status_text_id: "aptDoorStatusText",
    result_id: "aptDoorResult",
    name: "Porta Appartamento",
  },
  {
    id: "3494547ab161",
    auth_key:
      "MWI2MDc4dWlk4908A71DA809FCEC05C5D1F360943FBFC6A7934EC0FD9E3CFEAF03F8F5A6A4A0C60665B97A1AA2E2",
    button_id: "btnOpenExtraDoor1",
    status_id: "extraDoor1Status",
    status_text_id: "extraDoor1StatusText",
    result_id: "extraDoor1Result",
    name: "Porta Extra 1",
    container_id: "extraDoor1Admin",
  },
  {
    id: "placeholder_id_2",
    auth_key: "placeholder_auth_key_2",
    button_id: "btnOpenExtraDoor2",
    status_id: "extraDoor2Status",
    status_text_id: "extraDoor2StatusText",
    result_id: "extraDoor2Result",
    name: "Porta Extra 2",
    container_id: "extraDoor2Admin",
  },
];

// Inizializza Firebase
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// =============================================
// GESTIONE JWT PER ADMIN
// =============================================

class AdminJWTHelper {
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

  static async createAdminJWT(payload, expirationHours = 24) {
    const header = { alg: "HS256", typ: "JWT" };
    const expiration = Date.now() + expirationHours * 60 * 60 * 1000;

    const enhancedPayload = {
      ...payload,
      iss: "musart-admin-system",
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(expiration / 1000),
      jti: await this.generateHash(Date.now() + Math.random().toString()),
      admin: true,
    };

    const encodedHeader = this.base64UrlEncode(JSON.stringify(header));
    const encodedPayload = this.base64UrlEncode(
      JSON.stringify(enhancedPayload)
    );

    const signatureInput = `${encodedHeader}.${encodedPayload}`;
    const signature = await this.generateHash(signatureInput + JWT_SECRET);
    const encodedSignature = this.base64UrlEncode(signature);

    return `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
  }

  static async verifyAdminJWT(token) {
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

      if (!payload.admin) {
        return { valid: false, reason: "Privilegi insufficienti" };
      }

      return { valid: true, payload };
    } catch (error) {
      return { valid: false, reason: "Errore nella verifica del token" };
    }
  }
}

class AdminSessionManager {
  static async startAdminSession() {
    const sessionData = {
      loginTime: Date.now(),
      userAgent: navigator.userAgent,
      ip: await this.getClientIP(),
    };

    const adminJWT = await AdminJWTHelper.createAdminJWT(sessionData, 12);
    localStorage.setItem("admin_jwt", adminJWT);

    // Cookie di sicurezza
    const expiration = new Date();
    expiration.setHours(expiration.getHours() + 12);
    document.cookie = `admin_session=${adminJWT}; expires=${expiration.toUTCString()}; path=/; Secure; SameSite=Strict`;

    return adminJWT;
  }

  static async validateAdminSession() {
    try {
      let jwtToken = localStorage.getItem("admin_jwt");
      if (!jwtToken) {
        // Check cookie fallback
        const cookies = document.cookie.split(";");
        for (let cookie of cookies) {
          const [name, value] = cookie.trim().split("=");
          if (name === "admin_session" && value) {
            jwtToken = value;
            break;
          }
        }
      }

      if (!jwtToken)
        return { valid: false, reason: "Nessuna sessione admin attiva" };

      return await AdminJWTHelper.verifyAdminJWT(jwtToken);
    } catch (error) {
      this.clearAdminSession();
      return { valid: false, reason: "Errore di validazione" };
    }
  }

  static clearAdminSession() {
    localStorage.removeItem("admin_jwt");
    localStorage.removeItem("adminAuthenticated");
    document.cookie =
      "admin_session=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
  }

  static async getClientIP() {
    try {
      const response = await fetch("https://api.ipify.org?format=json");
      const data = await response.json();
      return data.ip;
    } catch (error) {
      return "unknown";
    }
  }
}

// =============================================
// GESTIONE LOGIN E AUTENTICAZIONE
// =============================================

document.addEventListener("DOMContentLoaded", async function () {
  console.log("Inizializzazione admin con JWT...");

  const sessionValidation = await AdminSessionManager.validateAdminSession();

  if (sessionValidation.valid) {
    showAdminInterface();
  } else {
    showLoginModal();
  }

  document.getElementById("adminPassword")?.focus();
});

function showAdminInterface() {
  const loginModal = document.getElementById("loginModal");
  const adminContainer = document.getElementById("adminContainer");

  if (loginModal) loginModal.classList.add("hidden");
  if (adminContainer) adminContainer.style.display = "block";

  loadSettings();
  initDoorControls();
}

function showLoginModal() {
  const loginModal = document.getElementById("loginModal");
  const adminContainer = document.getElementById("adminContainer");

  if (loginModal) loginModal.classList.remove("hidden");
  if (adminContainer) adminContainer.style.display = "none";
}

async function handleAdminLogin() {
  const passwordInput = document.getElementById("adminPassword");
  const loginError = document.getElementById("loginError");

  if (!passwordInput) return;

  const password = passwordInput.value.trim();

  if (password === ADMIN_PASSWORD) {
    await AdminSessionManager.startAdminSession();
    localStorage.setItem("adminAuthenticated", "true");
    showAdminInterface();
  } else {
    if (loginError) loginError.style.display = "block";
    passwordInput.value = "";
    passwordInput.focus();

    // Effetto sicurezza
    const loginModal = document.getElementById("loginModal");
    if (loginModal) {
      loginModal.classList.add("shake");
      setTimeout(() => {
        loginModal.classList.remove("shake");
      }, 500);
    }
  }
}

// =============================================
// GESTIONE IMPOSTAZIONI
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

async function loadSettings() {
  const firebaseSettings = await loadSettingsFromFirebase();

  if (firebaseSettings) {
    applySettingsFromFirebase(firebaseSettings);
  } else {
    applySettingsFromLocalStorage();
  }

  loadCheckinTimeSettings();
  updateActiveLinksList();
  updateLinkStatistics();
}

function applySettingsFromFirebase(settings) {
  const secretCode = settings.secret_code || "2245";
  const maxClicks = settings.max_clicks || "3";
  const timeLimit = settings.time_limit_minutes || "50000";

  setElementValue("currentCode", secretCode);
  setElementValue("currentMaxClicks", maxClicks);
  setElementValue("currentTimeLimit", timeLimit);
  setElementValue("newMaxClicks", maxClicks);
  setElementValue("newTimeLimit", timeLimit);

  localStorage.setItem("secret_code", secretCode);
  localStorage.setItem("max_clicks", maxClicks);
  localStorage.setItem("time_limit_minutes", timeLimit);
}

function applySettingsFromLocalStorage() {
  const secretCode = localStorage.getItem("secret_code") || "2245";
  const maxClicks = localStorage.getItem("max_clicks") || "3";
  const timeLimit = localStorage.getItem("time_limit_minutes") || "50000";

  setElementValue("currentCode", secretCode);
  setElementValue("currentMaxClicks", maxClicks);
  setElementValue("currentTimeLimit", timeLimit);
  setElementValue("newMaxClicks", maxClicks);
  setElementValue("newTimeLimit", timeLimit);

  saveSettingToFirebase("secret_code", secretCode);
  saveSettingToFirebase("max_clicks", maxClicks);
  saveSettingToFirebase("time_limit_minutes", timeLimit);
}

function setElementValue(elementId, value) {
  const element = document.getElementById(elementId);
  if (element) element.value = value;
}

// =============================================
// GESTIONE CODICE SEGRETO
// =============================================

async function updateSecretCode() {
  const newCodeInput = document.getElementById("newCode");
  if (!newCodeInput) return;

  const newCode = newCodeInput.value.trim();

  if (!newCode) {
    showAlert("Inserisci un codice valido", "error");
    return;
  }

  // Verifica sessione admin
  const sessionValid = await AdminSessionManager.validateAdminSession();
  if (!sessionValid.valid) {
    showAlert("Sessione scaduta. Rieffettua il login.", "error");
    return;
  }

  const success = await saveSettingToFirebase("secret_code", newCode);

  if (success) {
    // Incrementa versione codice
    const currentVersion = parseInt(localStorage.getItem("code_version")) || 1;
    const newVersion = currentVersion + 1;

    await saveSettingToFirebase("code_version", newVersion);
    await saveSettingToFirebase("last_code_update", Date.now().toString());

    setElementValue("currentCode", newCode);
    newCodeInput.value = "";

    showAlert(
      "Codice aggiornato con successo! Tutti gli utenti dovranno reinserire il codice.",
      "success"
    );
  } else {
    showAlert("Errore nel salvataggio del nuovo codice. Riprovare.", "error");
  }
}

// =============================================
// GESTIONE SISTEMA IMPOSTAZIONI
// =============================================

async function updateSystemSettings() {
  const newMaxClicksInput = document.getElementById("newMaxClicks");
  const newTimeLimitInput = document.getElementById("newTimeLimit");

  if (!newMaxClicksInput || !newTimeLimitInput) return;

  const newMaxClicks = newMaxClicksInput.value.trim();
  const newTimeLimit = newTimeLimitInput.value.trim();

  if (!newMaxClicks || isNaN(newMaxClicks) || parseInt(newMaxClicks) <= 0) {
    showAlert("Inserisci un numero valido per i click massimi", "error");
    return;
  }

  if (!newTimeLimit || isNaN(newTimeLimit) || parseInt(newTimeLimit) <= 0) {
    showAlert("Inserisci un numero valido per il time limit", "error");
    return;
  }

  const sessionValid = await AdminSessionManager.validateAdminSession();
  if (!sessionValid.valid) {
    showAlert("Sessione scaduta. Rieffettua il login.", "error");
    return;
  }

  const maxClicksSuccess = await saveSettingToFirebase(
    "max_clicks",
    newMaxClicks
  );
  const timeLimitSuccess = await saveSettingToFirebase(
    "time_limit_minutes",
    newTimeLimit
  );

  if (maxClicksSuccess && timeLimitSuccess) {
    localStorage.setItem("max_clicks", newMaxClicks);
    localStorage.setItem("time_limit_minutes", newTimeLimit);

    setElementValue("currentMaxClicks", newMaxClicks);
    setElementValue("currentTimeLimit", newTimeLimit);

    showAlert("Impostazioni aggiornate con successo!", "success");
  } else {
    showAlert("Errore nel salvataggio delle impostazioni. Riprovare.", "error");
  }
}

// =============================================
// GESTIONE TOKEN SICURI (JWT GENERATION)
// =============================================

async function generateSecureLink() {
  const expirationInput = document.getElementById("linkExpiration");
  const usageInput = document.getElementById("linkUsage");
  const customCodeInput = document.getElementById("linkCustomCode");

  if (!expirationInput || !usageInput) return;

  const expirationHours = parseInt(expirationInput.value);
  const maxUsage = parseInt(usageInput.value);
  const customCode = customCodeInput ? customCodeInput.value.trim() : "";

  // Verifica sessione admin
  const sessionValid = await AdminSessionManager.validateAdminSession();
  if (!sessionValid.valid) {
    showAlert("Sessione scaduta. Rieffettua il login.", "error");
    return;
  }

  // Crea payload JWT
  const payload = {
    type: "secure_link",
    maxUsage: maxUsage,
    usedCount: 0,
    customCode: customCode || null,
    generatedBy: "admin",
    generationTime: Date.now(),
  };

  const jwtToken = await AdminJWTHelper.createAdminJWT(
    payload,
    expirationHours
  );
  const baseUrl = window.location.origin + window.location.pathname;
  const indexUrl = baseUrl.replace("admin.html", "index.html");
  const secureLink = `${indexUrl}?token=${jwtToken}`;

  // Salva nel database per tracciamento
  await saveLinkToDatabase(jwtToken, payload, expirationHours);

  const generatedLinkInput = document.getElementById("generatedSecureLink");
  if (generatedLinkInput) {
    generatedLinkInput.value = secureLink;
  }

  if (customCodeInput) {
    customCodeInput.value = "";
  }

  updateActiveLinksList();
}

async function saveLinkToDatabase(jwtToken, payload, expirationHours) {
  const linkData = {
    jwt: jwtToken,
    payload: payload,
    expiration: Date.now() + expirationHours * 60 * 60 * 1000,
    status: "active",
    created: Date.now(),
  };

  try {
    await database.ref("secure_links_jwt/" + payload.jti).set(linkData);
  } catch (error) {
    console.error("Errore nel salvataggio del link JWT:", error);
    // Fallback al localStorage
    const secureLinks = JSON.parse(
      localStorage.getItem("secure_links_jwt") || "{}"
    );
    secureLinks[payload.jti] = linkData;
    localStorage.setItem("secure_links_jwt", JSON.stringify(secureLinks));
  }
}

function copyGeneratedLink() {
  const linkInput = document.getElementById("generatedSecureLink");

  if (!linkInput || !linkInput.value) {
    showAlert("Genera prima un link", "error");
    return;
  }

  linkInput.select();
  document.execCommand("copy");

  // Feedback visivo
  const btn = document.getElementById("btnCopySecureLink");
  if (btn) {
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-check"></i> Copiato!';
    btn.style.background = "var(--success)";

    setTimeout(() => {
      btn.innerHTML = originalText;
      btn.style.background = "";
    }, 2000);
  }

  showAlert("Link copiato negli appunti!", "success");
}

// =============================================
// GESTIONE LINK ATTIVI
// =============================================

function updateActiveLinksList() {
  const container = document.getElementById("activeLinksList");
  if (!container) return;

  container.innerHTML =
    '<p style="color: #666; text-align: center;">Caricamento...</p>';

  database
    .ref("secure_links_jwt")
    .once("value")
    .then((snapshot) => {
      const activeLinks = [];
      snapshot.forEach((childSnapshot) => {
        const link = childSnapshot.val();
        if (link.status === "active" && link.expiration > Date.now()) {
          activeLinks.push(link);
        }
      });

      renderActiveLinks(container, activeLinks);
    })
    .catch((error) => {
      console.error("Errore nel recupero dei link:", error);
      // Fallback al localStorage
      const secureLinks = JSON.parse(
        localStorage.getItem("secure_links_jwt") || "{}"
      );
      const activeLinks = Object.values(secureLinks).filter(
        (link) => link.status === "active" && link.expiration > Date.now()
      );
      renderActiveLinks(container, activeLinks);
    });
}

function renderActiveLinks(container, activeLinks) {
  if (activeLinks.length === 0) {
    container.innerHTML =
      '<p style="color: #666; text-align: center;">Nessun link attivo</p>';
    return;
  }

  container.innerHTML = "";
  activeLinks
    .sort((a, b) => b.created - a.created)
    .forEach((link) => {
      const linkElement = createLinkElement(link);
      container.appendChild(linkElement);
    });
}

function createLinkElement(link) {
  const linkElement = document.createElement("div");
  linkElement.style.cssText = `
    padding: 10px;
    margin: 8px 0;
    background: #f8f9fa;
    border-radius: 6px;
    border-left: 4px solid var(--success);
  `;

  const expiresIn = Math.max(
    0,
    Math.floor((link.expiration - Date.now()) / (1000 * 60 * 60))
  );
  const usageText = `${link.payload.usedCount}/${link.payload.maxUsage} utilizzi`;

  let linkContent = `
    <div style="font-size: 11px; color: #666;">
      Creato: ${new Date(link.created).toLocaleString("it-IT")}
    </div>
    <div style="font-weight: bold; margin: 3px 0; color: var(--dark);">
      Scade in: ${expiresIn}h • ${usageText}
    </div>
    <div style="font-size: 12px; overflow: hidden; text-overflow: ellipsis; margin-bottom: 5px;">
      <a href="${
        window.location.origin +
        window.location.pathname.replace("admin.html", "index.html")
      }?token=${link.jwt}" 
         target="_blank" style="color: var(--primary);">
         Token: ${link.payload.jti.substring(0, 16)}...
      </a>
    </div>
    <div style="display: flex; gap: 5px;">
      <button onclick="copySecureLink('${link.jwt}')" style="
          background: var(--primary);
          color: white;
          border: none;
          padding: 4px 8px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 11px;
      ">
          <i class="fas fa-copy"></i> Copia
      </button>
      <button onclick="revokeSecureLink('${link.payload.jti}')" style="
          background: var(--error);
          color: white;
          border: none;
          padding: 4px 8px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 11px;
      ">
          <i class="fas fa-ban"></i> Revoca
      </button>
    </div>
  `;

  if (link.payload.customCode) {
    linkContent += `<div style="font-size: 11px; color: var(--primary); margin-top: 5px;">
      <i class="fas fa-key"></i> Codice dedicato: ${link.payload.customCode}
    </div>`;
  }

  linkElement.innerHTML = linkContent;
  return linkElement;
}

function copySecureLink(jwtToken) {
  const baseUrl = window.location.origin + window.location.pathname;
  const indexUrl = baseUrl.replace("admin.html", "index.html");
  const secureLink = `${indexUrl}?token=${jwtToken}`;

  const tempInput = document.createElement("input");
  tempInput.value = secureLink;
  document.body.appendChild(tempInput);
  tempInput.select();
  document.execCommand("copy");
  document.body.removeChild(tempInput);

  showAlert("Link copiato negli appunti!", "success");
}

async function revokeSecureLink(linkId) {
  try {
    await database.ref("secure_links_jwt/" + linkId).update({
      status: "revoked",
      expiration: Date.now(),
    });
    updateActiveLinksList();
    updateLinkStatistics();
    showAlert("Link revocato con successo!", "success");
  } catch (error) {
    console.error("Errore nella revoca del link:", error);
    // Fallback al localStorage
    const secureLinks = JSON.parse(
      localStorage.getItem("secure_links_jwt") || "{}"
    );
    if (secureLinks[linkId]) {
      secureLinks[linkId].status = "revoked";
      secureLinks[linkId].expiration = Date.now();
      localStorage.setItem("secure_links_jwt", JSON.stringify(secureLinks));
      updateActiveLinksList();
      updateLinkStatistics();
      showAlert("Link revocato con successo!", "success");
    }
  }
}

// =============================================
// GESTIONE PORTE
// =============================================

function initDoorControls() {
  ADMIN_DEVICES.forEach((device) => {
    const button = document.getElementById(device.button_id);
    if (button) {
      button.addEventListener("click", () => openDoor(device));
    }
  });

  const openAllBtn = document.getElementById("btnOpenAllDoors");
  if (openAllBtn) {
    openAllBtn.addEventListener("click", openAllDoors);
  }

  checkAllDoorsStatus();
}

async function openDoor(device) {
  const button = document.getElementById(device.button_id);
  const resultDiv = document.getElementById(device.result_id);

  if (!button) return;

  button.disabled = true;
  button.innerHTML =
    '<i class="fas fa-spinner fa-spin"></i> Apertura in corso...';
  updateDoorStatus(device, "working", "Apertura in corso...");

  try {
    const response = await fetch(SHELLY_API_URL, {
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
      handleDoorSuccess(device, resultDiv, "Porta aperta con successo");
    } else {
      throw new Error(`Errore HTTP: ${response.status}`);
    }
  } catch (error) {
    handleDoorError(device, resultDiv, error);
  } finally {
    resetDoorButton(button, device);
  }
}

function handleDoorSuccess(device, resultDiv, message) {
  updateDoorStatus(device, "success", message);
  if (resultDiv) {
    resultDiv.innerHTML = `
      <div class="success-message">
        <i class="fas fa-check-circle"></i>
        ${
          device.name
        } aperta con successo alle ${new Date().toLocaleTimeString()}
      </div>
    `;
  }
  logAdminAction(`Apertura ${device.name}`, "success");
}

function handleDoorError(device, resultDiv, error) {
  console.error(`Errore apertura ${device.name}:`, error);
  updateDoorStatus(device, "error", "Errore nell'apertura");
  if (resultDiv) {
    resultDiv.innerHTML = `
      <div class="error-message">
        <i class="fas fa-exclamation-circle"></i>
        Errore nell'apertura di ${device.name}: ${error.message}
      </div>
    `;
  }
  logAdminAction(`Apertura ${device.name}`, "error", error.message);
}

function resetDoorButton(button, device) {
  setTimeout(() => {
    button.disabled = false;
    button.innerHTML =
      '<i class="fas fa-key"></i> Apri ' + device.name.split(" ")[0];

    const resultDiv = document.getElementById(device.result_id);
    if (resultDiv) {
      setTimeout(() => {
        resultDiv.innerHTML = "";
      }, 5000);
    }
  }, 3000);
}

async function openAllDoors() {
  const results = [];

  for (const device of ADMIN_DEVICES) {
    try {
      await openDoor(device);
      results.push({ device: device.name, status: "success" });
    } catch (error) {
      results.push({
        device: device.name,
        status: "error",
        error: error.message,
      });
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  showBulkOperationResult("Apertura multipla completata", results);
}

function checkAllDoorsStatus() {
  ADMIN_DEVICES.forEach((device) => {
    checkDoorStatus(device);
  });
}

function checkDoorStatus(device) {
  updateDoorStatus(device, "success", "Porta disponibile");
}

function updateDoorStatus(device, status, message) {
  const statusIndicator = document.getElementById(device.status_id);
  const statusText = document.getElementById(device.status_text_id);

  if (statusIndicator) {
    statusIndicator.className = "status-indicator";
    switch (status) {
      case "success":
        statusIndicator.classList.add("status-on");
        break;
      case "error":
        statusIndicator.classList.add("status-off");
        break;
      case "working":
        statusIndicator.classList.add("status-working");
        break;
      default:
        statusIndicator.classList.add("status-unknown");
    }
  }

  if (statusText) {
    statusText.textContent = `Stato: ${message}`;
  }
}

function showBulkOperationResult(title, results) {
  const successCount = results.filter((r) => r.status === "success").length;
  const errorCount = results.filter((r) => r.status === "error").length;

  showAlert(
    `${title}\n\nSuccessi: ${successCount}\nErrori: ${errorCount}\n\nControlla i log per i dettagli.`,
    errorCount > 0 ? "warning" : "success"
  );
}

// =============================================
// GESTIONE ORARIO CHECK-IN
// =============================================

function loadCheckinTimeSettings() {
  const checkinStartTime =
    localStorage.getItem("checkin_start_time") || "14:00";
  const checkinEndTime = localStorage.getItem("checkin_end_time") || "22:00";

  setElementValue("checkinStartTime", checkinStartTime);
  setElementValue("checkinEndTime", checkinEndTime);
}

async function updateCheckinTime() {
  const startTimeInput = document.getElementById("checkinStartTime");
  const endTimeInput = document.getElementById("checkinEndTime");

  if (!startTimeInput || !endTimeInput) return;

  const newCheckinStartTime = startTimeInput.value;
  const newCheckinEndTime = endTimeInput.value;

  if (!newCheckinStartTime || !newCheckinEndTime) {
    showAlert("Inserisci orari validi", "error");
    return;
  }

  const sessionValid = await AdminSessionManager.validateAdminSession();
  if (!sessionValid.valid) {
    showAlert("Sessione scaduta. Rieffettua il login.", "error");
    return;
  }

  const startTimeSuccess = await saveSettingToFirebase(
    "checkin_start_time",
    newCheckinStartTime
  );
  const endTimeSuccess = await saveSettingToFirebase(
    "checkin_end_time",
    newCheckinEndTime
  );

  if (startTimeSuccess && endTimeSuccess) {
    localStorage.setItem("checkin_start_time", newCheckinStartTime);
    localStorage.setItem("checkin_end_time", newCheckinEndTime);
    showAlert("Orario di check-in aggiornato con successo!", "success");
  } else {
    showAlert(
      "Errore nel salvataggio dell'orario di check-in. Riprovare.",
      "error"
    );
  }
}

// =============================================
// FUNZIONI DI UTILITY
// =============================================

async function saveSettingToFirebase(key, value) {
  try {
    await database.ref("settings/" + key).set(value);
    return true;
  } catch (error) {
    console.error("Errore nel salvataggio su Firebase:", error);
    return false;
  }
}

function showAlert(message, type = "info") {
  const alertDiv = document.createElement("div");
  alertDiv.style.cssText = `
    position: fixed; top: 20px; right: 20px; z-index: 10000;
    padding: 15px 20px; border-radius: 5px; color: white;
    background: ${
      type === "success"
        ? "var(--success)"
        : type === "error"
        ? "var(--error)"
        : "var(--warning)"
    };
    box-shadow: 0 4px 12px rgba(0,0,0,0.3); max-width: 400px;
    white-space: pre-line;
  `;

  alertDiv.innerHTML = `
    <i class="fas fa-${
      type === "success"
        ? "check"
        : type === "error"
        ? "exclamation-triangle"
        : "info"
    }"></i>
    <span style="margin-left: 10px;">${message}</span>
    <button onclick="this.parentElement.remove()" style="background: none; border: none; color: white; margin-left: 15px; cursor: pointer;">
      <i class="fas fa-times"></i>
    </button>
  `;

  document.body.appendChild(alertDiv);
  setTimeout(() => {
    if (alertDiv.parentElement) {
      alertDiv.remove();
    }
  }, 5000);
}

function logAdminAction(action, status, error = null) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    action: action,
    status: status,
    error: error,
    admin: true,
  };

  try {
    const adminLogs = JSON.parse(localStorage.getItem("adminActionLogs")) || [];
    adminLogs.unshift(logEntry);
    if (adminLogs.length > 100) adminLogs.splice(100);
    localStorage.setItem("adminActionLogs", JSON.stringify(adminLogs));
  } catch (error) {
    console.error("Errore nel salvataggio log admin:", error);
  }
}

function updateLinkStatistics() {
  database
    .ref("secure_links_jwt")
    .once("value")
    .then((snapshot) => {
      const links = [];
      snapshot.forEach((childSnapshot) => {
        links.push(childSnapshot.val());
      });
      updateStatisticsUI(links);
    })
    .catch((error) => {
      console.error("Errore nel recupero delle statistiche:", error);
      const secureLinks = JSON.parse(
        localStorage.getItem("secure_links_jwt") || "{}"
      );
      updateStatisticsUI(Object.values(secureLinks));
    });
}

function updateStatisticsUI(links) {
  setElementText("totalLinks", links.length);
  setElementText(
    "activeLinks",
    links.filter((l) => l.status === "active" && l.expiration > Date.now())
      .length
  );
}

function setElementText(elementId, text) {
  const element = document.getElementById(elementId);
  if (element) element.textContent = text;
}

// =============================================
// GESTIONE SESSIONE LOCALE
// =============================================

function resetLocalSession() {
  if (
    !confirm(
      "Sei sicuro di voler ripristinare la sessione locale? Questo cancellerà tutti i dati di sessione sul dispositivo corrente."
    )
  ) {
    return;
  }

  try {
    // Salva impostazioni importanti prima del reset
    const importantKeys = [
      "secret_code",
      "max_clicks",
      "time_limit_minutes",
      "code_version",
      "checkin_start_time",
      "checkin_end_time",
      "checkin_time_enabled",
      "devices",
      "secure_links_jwt",
      "admin_jwt",
      "adminAuthenticated",
    ];

    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!importantKeys.includes(key) && !key.startsWith("admin_")) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach((key) => localStorage.removeItem(key));
    clearSessionCookies();

    showResetResult();
  } catch (error) {
    console.error("Errore nel ripristino della sessione locale:", error);
    showResetError(error);
  }
}

function clearSessionCookies() {
  try {
    const cookies = document.cookie.split(";");
    for (let cookie of cookies) {
      const [name] = cookie.trim().split("=");
      if (name && !name.startsWith("admin")) {
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
      }
    }
  } catch (error) {
    console.error("Errore nella pulizia dei cookie:", error);
  }
}

function showResetResult() {
  const resultDiv = document.getElementById("localResetResult");
  if (resultDiv) {
    resultDiv.innerHTML = `
      <div class="success-message">
        <i class="fas fa-check-circle"></i>
        Sessione locale ripristinata con successo!
      </div>
    `;
    setTimeout(() => {
      resultDiv.innerHTML = "";
    }, 5000);
  }
}

function showResetError(error) {
  const resultDiv = document.getElementById("localResetResult");
  if (resultDiv) {
    resultDiv.innerHTML = `
      <div class="error-message">
        <i class="fas fa-exclamation-circle"></i>
        Errore nel ripristino: ${error.message}
      </div>
    `;
  }
}

// =============================================
// EVENT LISTENERS
// =============================================

function setupAdminEventListeners() {
  // Login
  const loginBtn = document.getElementById("btnLogin");
  if (loginBtn) {
    loginBtn.addEventListener("click", handleAdminLogin);
  }

  const adminPassword = document.getElementById("adminPassword");
  if (adminPassword) {
    adminPassword.addEventListener("keypress", (e) => {
      if (e.key === "Enter") handleAdminLogin();
    });
  }

  // Token sicuri
  const generateLinkBtn = document.getElementById("btnGenerateSecureLink");
  if (generateLinkBtn) {
    generateLinkBtn.addEventListener("click", generateSecureLink);
  }

  const copyLinkBtn = document.getElementById("btnCopySecureLink");
  if (copyLinkBtn) {
    copyLinkBtn.addEventListener("click", copyGeneratedLink);
  }

  // Impostazioni
  const codeUpdateBtn = document.getElementById("btnCodeUpdate");
  if (codeUpdateBtn) {
    codeUpdateBtn.addEventListener("click", updateSecretCode);
  }

  const settingsUpdateBtn = document.getElementById("btnSettingsUpdate");
  if (settingsUpdateBtn) {
    settingsUpdateBtn.addEventListener("click", updateSystemSettings);
  }

  const checkinTimeBtn = document.getElementById("btnUpdateCheckinTime");
  if (checkinTimeBtn) {
    checkinTimeBtn.addEventListener("click", updateCheckinTime);
  }

  // Logout
  const logoutBtn = document.getElementById("btnLogout");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      AdminSessionManager.clearAdminSession();
      showLoginModal();
    });
  }

  // Reset sessione
  const resetSessionBtn = document.getElementById("btnResetLocalSession");
  if (resetSessionBtn) {
    resetSessionBtn.addEventListener("click", resetLocalSession);
  }
}

// =============================================
// INIZIALIZZAZIONE
// =============================================

document.addEventListener("DOMContentLoaded", function () {
  setupAdminEventListeners();
  updateActiveLinksList();
  setInterval(updateActiveLinksList, 30000);
});
