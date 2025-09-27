// admin.js - Sistema di Amministrazione Check-in
// Riorganizzato per migliore manutenibilità e leggibilità

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
const ADMIN_PASSWORD = "1122";
const SHELLY_API_URL =
  "https://shelly-73-eu.shelly.cloud/v2/devices/api/set/switch";

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
// GESTIONE AUTENTICAZIONE
// =============================================

document.addEventListener("DOMContentLoaded", function () {
  // Verifica se l'utente è già autenticato
  const isAuthenticated = localStorage.getItem("adminAuthenticated") === "true";

  if (isAuthenticated) {
    showAdminInterface();
  } else {
    showLoginModal();
  }

  // Focus sul campo password
  document.getElementById("adminPassword").focus();
});

function showAdminInterface() {
  document.getElementById("loginModal").classList.add("hidden");
  document.getElementById("adminContainer").style.display = "block";
  loadSettings();
  initDoorControls();
}

function showLoginModal() {
  document.getElementById("loginModal").classList.remove("hidden");
  document.getElementById("adminContainer").style.display = "none";
}

// Gestione del login
document.getElementById("btnLogin").addEventListener("click", handleLogin);

document
  .getElementById("adminPassword")
  .addEventListener("keypress", function (e) {
    if (e.key === "Enter") {
      handleLogin();
    }
  });

function handleLogin() {
  const password = document.getElementById("adminPassword").value.trim();
  const loginError = document.getElementById("loginError");
  const loginModal = document.getElementById("loginModal");

  if (password === ADMIN_PASSWORD) {
    localStorage.setItem("adminAuthenticated", "true");
    showAdminInterface();
  } else {
    loginError.style.display = "block";
    document.getElementById("adminPassword").value = "";
    document.getElementById("adminPassword").focus();

    // Effetto shake al modale
    loginModal.classList.add("shake");
    setTimeout(() => {
      loginModal.classList.remove("shake");
    }, 500);
  }
}

// =============================================
// GESTIONE IMPOSTAZIONI (FIREBASE + LOCALSTORAGE)
// =============================================

// Funzioni per il salvataggio e caricamento delle impostazioni
async function saveSettingToFirebase(key, value) {
  try {
    await database.ref("settings/" + key).set(value);
    console.log(`Impostazione ${key} salvata su Firebase:`, value);
    return true;
  } catch (error) {
    console.error(`Errore nel salvataggio di ${key} su Firebase:`, error);
    return false;
  }
}

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
  loadExtraDoorsVisibility();
  updateActiveLinksList();
  updateLinkStatistics();
}

function applySettingsFromFirebase(settings) {
  const secretCode = settings.secret_code || "2245";
  const maxClicks = settings.max_clicks || "3";
  const timeLimit = settings.time_limit_minutes || "50000";

  // Aggiorna UI
  document.getElementById("currentCode").value = secretCode;
  document.getElementById("currentMaxClicks").value = maxClicks;
  document.getElementById("currentTimeLimit").value = timeLimit;
  document.getElementById("newMaxClicks").value = maxClicks;
  document.getElementById("newTimeLimit").value = timeLimit;

  // Aggiorna localStorage
  localStorage.setItem("secret_code", secretCode);
  localStorage.setItem("max_clicks", maxClicks);
  localStorage.setItem("time_limit_minutes", timeLimit);
}

function applySettingsFromLocalStorage() {
  const secretCode = localStorage.getItem("secret_code") || "2245";
  const maxClicks = localStorage.getItem("max_clicks") || "3";
  const timeLimit = localStorage.getItem("time_limit_minutes") || "50000";

  // Aggiorna UI
  document.getElementById("currentCode").value = secretCode;
  document.getElementById("currentMaxClicks").value = maxClicks;
  document.getElementById("currentTimeLimit").value = timeLimit;
  document.getElementById("newMaxClicks").value = maxClicks;
  document.getElementById("newTimeLimit").value = timeLimit;

  // Salva su Firebase per futuri utilizzi
  saveSettingToFirebase("secret_code", secretCode);
  saveSettingToFirebase("max_clicks", maxClicks);
  saveSettingToFirebase("time_limit_minutes", timeLimit);
}

function loadCheckinTimeSettings() {
  const checkinStartTime =
    localStorage.getItem("checkin_start_time") || "14:00";
  const checkinEndTime = localStorage.getItem("checkin_end_time") || "22:00";

  document.getElementById("checkinStartTime").value = checkinStartTime;
  document.getElementById("checkinEndTime").value = checkinEndTime;
  document.getElementById(
    "currentCheckinTimeRange"
  ).value = `${checkinStartTime} - ${checkinEndTime}`;

  updateCheckinTimeStatus();
}

function updateCheckinTimeStatus() {
  const checkinTimeStatusEl = document.getElementById("checkinTimeStatus");
  const toggleButton = document.getElementById("btnToggleCheckinTime");
  const isEnabled = localStorage.getItem("checkin_time_enabled") !== "false";

  if (isEnabled) {
    checkinTimeStatusEl.innerHTML =
      '<span class="status-indicator status-on"></span> Attivo';
    toggleButton.classList.add("btn-success");
    toggleButton.innerHTML =
      '<i class="fas fa-toggle-on"></i> Disattiva Controllo Orario';
  } else {
    checkinTimeStatusEl.innerHTML =
      '<span class="status-indicator status-off"></span> Disattivato';
    toggleButton.classList.add("btn-error");
    toggleButton.innerHTML =
      '<i class="fas fa-toggle-off"></i> Attiva Controllo Orario';
  }
}

function loadExtraDoorsVisibility() {
  try {
    const devices = JSON.parse(localStorage.getItem("devices")) || [];
    if (devices.length >= 4) {
      document.getElementById("extraDoor1Visible").checked =
        devices[2].visible || false;
      document.getElementById("extraDoor2Visible").checked =
        devices[3].visible || false;
    }
  } catch (e) {
    console.error("Errore nel caricamento delle porte extra:", e);
  }
}

// =============================================
// GESTIONE CODICE SEGRETO
// =============================================

document
  .getElementById("btnCodeUpdate")
  .addEventListener("click", updateSecretCode);

async function updateSecretCode() {
  const newCode = document.getElementById("newCode").value.trim();

  if (!newCode) {
    alert("Inserisci un codice valido");
    return;
  }

  const success = await saveSettingToFirebase("secret_code", newCode);

  if (success) {
    localStorage.setItem("secret_code", newCode);

    // Aggiorna versione codice
    const currentVersion = parseInt(localStorage.getItem("code_version")) || 1;
    const newVersion = currentVersion + 1;
    localStorage.setItem("code_version", newVersion.toString());
    await saveSettingToFirebase("code_version", newVersion);

    // Aggiorna timestamp
    const timestamp = Date.now().toString();
    localStorage.setItem("last_code_update", timestamp);
    await saveSettingToFirebase("last_code_update", timestamp);

    document.getElementById("currentCode").value = newCode;
    document.getElementById("newCode").value = "";

    alert(
      "Codice aggiornato con successo! Tutti gli utenti dovranno inserire il nuovo codice."
    );
  } else {
    alert("Errore nel salvataggio del nuovo codice. Riprovare.");
  }
}

// =============================================
// GESTIONE IMPOSTAZIONI DI SISTEMA
// =============================================

document
  .getElementById("btnSettingsUpdate")
  .addEventListener("click", updateSystemSettings);

async function updateSystemSettings() {
  const newMaxClicks = document.getElementById("newMaxClicks").value.trim();
  const newTimeLimit = document.getElementById("newTimeLimit").value.trim();

  if (!newMaxClicks || isNaN(newMaxClicks) || parseInt(newMaxClicks) <= 0) {
    alert("Inserisci un numero valido per i click massimi");
    return;
  }

  if (!newTimeLimit || isNaN(newTimeLimit) || parseInt(newTimeLimit) <= 0) {
    alert("Inserisci un numero valido per il time limit");
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

    document.getElementById("currentMaxClicks").value = newMaxClicks;
    document.getElementById("currentTimeLimit").value = newTimeLimit;

    alert("Impostazioni aggiornate con successo!");
  } else {
    alert("Errore nel salvataggio delle impostazioni. Riprovare.");
  }
}

// =============================================
// GESTIONE ORARIO CHECK-IN
// =============================================

document
  .getElementById("btnUpdateCheckinTime")
  .addEventListener("click", updateCheckinTime);
document
  .getElementById("btnToggleCheckinTime")
  .addEventListener("click", toggleCheckinTime);

async function updateCheckinTime() {
  const newCheckinStartTime = document.getElementById("checkinStartTime").value;
  const newCheckinEndTime = document.getElementById("checkinEndTime").value;

  if (!newCheckinStartTime || !newCheckinEndTime) {
    alert("Inserisci orari validi");
    return;
  }

  // Validazione intervallo orario
  if (!isValidTimeRange(newCheckinStartTime, newCheckinEndTime)) {
    document.getElementById("timeRangeError").style.display = "block";
    return;
  }

  document.getElementById("timeRangeError").style.display = "none";

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

    document.getElementById(
      "currentCheckinTimeRange"
    ).value = `${newCheckinStartTime} - ${newCheckinEndTime}`;
    alert("Orario di check-in aggiornato con successo!");
  } else {
    alert("Errore nel salvataggio dell'orario di check-in. Riprovare.");
  }
}

function isValidTimeRange(startTime, endTime) {
  const [startHours, startMinutes] = startTime.split(":").map(Number);
  const [endHours, endMinutes] = endTime.split(":").map(Number);

  const startTimeInMinutes = startHours * 60 + startMinutes;
  const endTimeInMinutes = endHours * 60 + endMinutes;

  return endTimeInMinutes > startTimeInMinutes;
}

async function toggleCheckinTime() {
  const currentStatus = localStorage.getItem("checkin_time_enabled");
  const newStatus = currentStatus === null ? false : currentStatus !== "true";

  const success = await saveSettingToFirebase(
    "checkin_time_enabled",
    newStatus.toString()
  );

  if (success) {
    localStorage.setItem("checkin_time_enabled", newStatus.toString());
    updateCheckinTimeStatus();
    alert(
      `Controllo orario ${newStatus ? "attivato" : "disattivato"} con successo!`
    );
  } else {
    alert("Errore nel salvataggio delle impostazioni. Riprovare.");
  }
}

// =============================================
// GESTIONE PORTE EXTRA
// =============================================

document
  .getElementById("btnExtraDoorsVisibility")
  .addEventListener("click", updateExtraDoorsVisibilitySettings);

function updateExtraDoorsVisibilitySettings() {
  try {
    let devices = JSON.parse(localStorage.getItem("devices")) || [];

    if (devices.length === 0) {
      devices = [
        { button_id: "MainDoor", visible: true },
        { button_id: "AptDoor", visible: true },
        {
          button_id: "ExtraDoor1",
          visible: document.getElementById("extraDoor1Visible").checked,
        },
        {
          button_id: "ExtraDoor2",
          visible: document.getElementById("extraDoor2Visible").checked,
        },
      ];
    } else {
      if (devices.length > 2)
        devices[2].visible =
          document.getElementById("extraDoor1Visible").checked;
      if (devices.length > 3)
        devices[3].visible =
          document.getElementById("extraDoor2Visible").checked;
    }

    localStorage.setItem("devices", JSON.stringify(devices));
    updateExtraDoorsVisibility();
    alert("Visibilità porte extra aggiornata con successo!");
  } catch (e) {
    console.error("Errore nel salvataggio delle porte extra:", e);
    alert("Si è verificato un errore durante il salvataggio.");
  }
}

// =============================================
// GESTIONE LINK SICURI
// =============================================

document
  .getElementById("btnGenerateSecureLink")
  .addEventListener("click", generateSecureLink);
document
  .getElementById("btnCopySecureLink")
  .addEventListener("click", copyGeneratedLink);

function generateSecureLink() {
  const expirationHours = parseInt(
    document.getElementById("linkExpiration").value
  );
  const maxUsage = parseInt(document.getElementById("linkUsage").value);
  const customCode = document.getElementById("linkCustomCode").value.trim();

  const linkId = generateUniqueId();
  const expirationTime = Date.now() + expirationHours * 60 * 60 * 1000;
  const baseUrl = window.location.origin + window.location.pathname;
  const indexUrl = baseUrl.replace("admin.html", "index.html");
  const secureLink = `${indexUrl}?token=${linkId}`;

  document.getElementById("generatedSecureLink").value = secureLink;
  saveSecureLink(linkId, expirationTime, maxUsage, expirationHours, customCode);
}

function generateUniqueId() {
  return "link_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
}

function saveSecureLink(
  linkId,
  expirationTime,
  maxUsage,
  expirationHours,
  customCode = null
) {
  const linkData = {
    id: linkId,
    created: Date.now(),
    expiration: expirationTime,
    maxUsage: maxUsage,
    usedCount: 0,
    expirationHours: expirationHours,
    status: "active",
    customCode: customCode || null,
  };

  database
    .ref("secure_links/" + linkId)
    .set(linkData)
    .then(() => {
      console.log("Link salvato su Firebase con successo");
      updateActiveLinksList();
      updateLinkStatistics();
      document.getElementById("linkCustomCode").value = "";
    })
    .catch((error) => {
      console.error("Errore nel salvataggio del link:", error);
      // Fallback al localStorage
      const secureLinks = JSON.parse(
        localStorage.getItem("secure_links") || "{}"
      );
      secureLinks[linkId] = linkData;
      localStorage.setItem("secure_links", JSON.stringify(secureLinks));
      updateActiveLinksList();
      updateLinkStatistics();
    });
}

function copyGeneratedLink() {
  const linkInput = document.getElementById("generatedSecureLink");

  if (!linkInput.value) {
    alert("Genera prima un link");
    return;
  }

  linkInput.select();
  document.execCommand("copy");

  // Feedback visivo
  const btn = document.getElementById("btnCopySecureLink");
  const originalText = btn.innerHTML;
  btn.innerHTML = '<i class="fas fa-check"></i> Copiato!';
  btn.style.background = "var(--success)";

  setTimeout(() => {
    btn.innerHTML = originalText;
    btn.style.background = "";
  }, 2000);
}

function updateActiveLinksList() {
  const container = document.getElementById("activeLinksList");
  container.innerHTML =
    '<p style="color: #666; text-align: center;">Caricamento...</p>';

  database
    .ref("secure_links")
    .orderByChild("created")
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
        localStorage.getItem("secure_links") || "{}"
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
  const usageText = `${link.usedCount}/${link.maxUsage} utilizzi`;

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
      }?token=${link.id}" 
         target="_blank" style="color: var(--primary);">
         ${link.id}
      </a>
    </div>
    <div style="display: flex; gap: 5px;">
      <button onclick="copySecureLink('${link.id}')" style="
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
      <button onclick="revokeSecureLink('${link.id}')" style="
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

  if (link.customCode) {
    linkContent += `<div style="font-size: 11px; color: var(--primary); margin-top: 5px;">
      <i class="fas fa-key"></i> Codice dedicato: ${link.customCode}
    </div>`;
  }

  linkElement.innerHTML = linkContent;
  return linkElement;
}

function copySecureLink(linkId) {
  const baseUrl = window.location.origin + window.location.pathname;
  const indexUrl = baseUrl.replace("admin.html", "index.html");
  const secureLink = `${indexUrl}?token=${linkId}`;

  const tempInput = document.createElement("input");
  tempInput.value = secureLink;
  document.body.appendChild(tempInput);
  tempInput.select();
  document.execCommand("copy");
  document.body.removeChild(tempInput);

  alert("Link copiato negli appunti!");
}

function revokeSecureLink(linkId) {
  database
    .ref("secure_links/" + linkId)
    .update({
      status: "revoked",
      expiration: Date.now(),
    })
    .then(() => {
      updateActiveLinksList();
      updateLinkStatistics();
      alert("Link revocato con successo!");
    })
    .catch((error) => {
      console.error("Errore nella revoca del link su Firebase:", error);
      // Fallback al localStorage
      const secureLinks = JSON.parse(
        localStorage.getItem("secure_links") || "{}"
      );
      if (secureLinks[linkId]) {
        secureLinks[linkId].status = "revoked";
        secureLinks[linkId].expiration = Date.now();
        localStorage.setItem("secure_links", JSON.stringify(secureLinks));
        updateActiveLinksList();
        updateLinkStatistics();
        alert("Link revocato con successo!");
      }
    });
}

function updateLinkStatistics() {
  database
    .ref("secure_links")
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
      // Fallback al localStorage
      const secureLinks = JSON.parse(
        localStorage.getItem("secure_links") || "{}"
      );
      updateStatisticsUI(Object.values(secureLinks));
    });
}

function updateStatisticsUI(links) {
  document.getElementById("totalLinks").textContent = links.length;
  document.getElementById("activeLinks").textContent = links.filter(
    (l) => l.status === "active" && l.expiration > Date.now()
  ).length;
  document.getElementById("usedLinks").textContent = links.filter(
    (l) => l.status === "used"
  ).length;
  document.getElementById("expiredLinks").textContent = links.filter(
    (l) => l.status === "expired" || l.status === "revoked"
  ).length;
}

// =============================================
// GESTIONE CONTROLLO PORTE (SHELLY)
// =============================================

function initDoorControls() {
  updateExtraDoorsVisibility();

  ADMIN_DEVICES.forEach((device) => {
    const button = document.getElementById(device.button_id);
    if (button) {
      button.addEventListener("click", () => openDoor(device));
    }
  });

  document
    .getElementById("btnOpenAllDoors")
    .addEventListener("click", openAllDoors);
  document
    .getElementById("btnCheckAllDoors")
    .addEventListener("click", checkAllDoorsStatus);

  checkAllDoorsStatus();
}

function updateExtraDoorsVisibility() {
  try {
    const devices = JSON.parse(localStorage.getItem("devices")) || [];
    ADMIN_DEVICES.forEach((device, index) => {
      if (device.container_id) {
        const container = document.getElementById(device.container_id);
        if (container) {
          container.style.display =
            devices.length > index && devices[index] && devices[index].visible
              ? "block"
              : "none";
        }
      }
    });
  } catch (error) {
    console.error("Errore nell'aggiornamento visibilità porte:", error);
  }
}

async function openDoor(device) {
  const button = document.getElementById(device.button_id);
  const resultDiv = document.getElementById(device.result_id);

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
      const responseText = await response.text();
      let data = { ok: true }; // Default a successo

      if (responseText.trim() !== "") {
        try {
          data = JSON.parse(responseText);
        } catch (parseError) {
          console.warn(
            `${device.name}: Risposta non JSON valida:`,
            responseText
          );
        }
      }

      if (data && data.ok) {
        handleDoorSuccess(device, resultDiv, "Porta aperta con successo");
      } else {
        handleDoorSuccess(
          device,
          resultDiv,
          "Porta aperta (risposta non standard)",
          responseText
        );
      }
    } else {
      throw new Error(`Errore HTTP: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    handleDoorError(device, resultDiv, error);
  } finally {
    resetDoorButton(button, device);
  }
}

function handleDoorSuccess(device, resultDiv, message, responseText = "") {
  updateDoorStatus(device, "success", message);
  resultDiv.innerHTML = `
    <div class="success-message">
      <i class="fas fa-check-circle"></i>
      ${device.name} aperta con successo alle ${new Date().toLocaleTimeString()}
      ${
        responseText
          ? `<br><small>Risposta API: ${responseText.substring(0, 100)}</small>`
          : ""
      }
    </div>
  `;
  logDoorAction(device.name, "success", responseText || message);
}

function handleDoorError(device, resultDiv, error) {
  console.error(`Errore apertura ${device.name}:`, error);
  updateDoorStatus(device, "error", "Errore nell'apertura");
  resultDiv.innerHTML = `
    <div class="error-message">
      <i class="fas fa-exclamation-circle"></i>
      Errore nell'apertura di ${device.name}: ${error.message}
    </div>
  `;
  logDoorAction(device.name, "error", error.message);
}

function resetDoorButton(button, device) {
  setTimeout(() => {
    button.disabled = false;
    button.innerHTML =
      '<i class="fas fa-key"></i> Apri ' + device.name.split(" ")[0];

    setTimeout(() => {
      document.getElementById(device.result_id).innerHTML = "";
    }, 5000);
  }, 3000);
}

async function openAllDoors() {
  const results = [];

  for (const device of ADMIN_DEVICES) {
    if (device.container_id) {
      const container = document.getElementById(device.container_id);
      if (container && container.style.display === "none") continue;
    }

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

async function checkAllDoorsStatus() {
  ADMIN_DEVICES.forEach((device) => {
    if (device.container_id) {
      const container = document.getElementById(device.container_id);
      if (container && container.style.display === "none") return;
    }
    checkDoorStatus(device);
  });
}

async function checkDoorStatus(device) {
  try {
    updateDoorStatus(device, "success", "Porta disponibile");
  } catch (error) {
    updateDoorStatus(device, "error", "Stato non disponibile");
  }
}

function updateDoorStatus(device, status, message) {
  const statusIndicator = document.getElementById(device.status_id);
  const statusText = document.getElementById(device.status_text_id);

  statusIndicator.className = "status-indicator";
  statusText.textContent = `Stato: ${message}`;

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

function showBulkOperationResult(title, results) {
  const successCount = results.filter((r) => r.status === "success").length;
  const errorCount = results.filter((r) => r.status === "error").length;

  alert(
    `${title}\n\nSuccessi: ${successCount}\nErrori: ${errorCount}\n\nControlla i log per i dettagli.`
  );
}

function logDoorAction(doorName, status, error = null) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    door: doorName,
    status: status,
    error: error,
    admin: true,
  };

  try {
    const doorLogs = JSON.parse(localStorage.getItem("doorActionLogs")) || [];
    doorLogs.unshift(logEntry);
    if (doorLogs.length > 100) doorLogs.splice(100);
    localStorage.setItem("doorActionLogs", JSON.stringify(doorLogs));
  } catch (error) {
    console.error("Errore nel salvataggio log:", error);
  }
}

// =============================================
// GESTIONE SESSIONE LOCALE
// =============================================

document
  .getElementById("btnResetLocalSession")
  .addEventListener("click", function () {
    if (
      confirm(
        "Sei sicuro di voler ripristinare la sessione locale? Questo cancellerà tutti i dati di sessione sul dispositivo corrente."
      )
    ) {
      resetLocalSession();
    }
  });

function resetLocalSession() {
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
      "secure_links",
      "adminAuthenticated",
    ];

    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!importantKeys.some((importantKey) => key.startsWith(importantKey))) {
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
      if (name && !name.startsWith("adminAuthenticated")) {
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
      }
    }
  } catch (error) {
    console.error("Errore nella pulizia dei cookie:", error);
  }
}

function showResetResult() {
  const resultDiv = document.getElementById("localResetResult");
  resultDiv.innerHTML = `
    <div class="success-message">
      <i class="fas fa-check-circle"></i>
      Sessione locale ripristinata con successo!
    </div>
    <div class="reset-info">
      <p><strong>Azioni eseguite:</strong></p>
      <ul>
        <li>Puliti dati di sessione</li>
        <li>Puliti cookie di sessione</li>
        <li>Mantenute impostazioni di sistema</li>
      </ul>
      <p>Ora puoi tornare alla schermata principale e inserire nuovamente il codice.</p>
    </div>
  `;

  setTimeout(() => (resultDiv.innerHTML = ""), 5000);
}

function showResetError(error) {
  const resultDiv = document.getElementById("localResetResult");
  resultDiv.innerHTML = `
    <div class="error-message">
      <i class="fas fa-exclamation-circle"></i>
      Errore nel ripristino: ${error.message}
    </div>
  `;
}

// =============================================
// INIZIALIZZAZIONE FINALE
// =============================================

document.addEventListener("DOMContentLoaded", function () {
  updateActiveLinksList();
  updateLinkStatistics();
  setInterval(updateActiveLinksList, 60000);
  setInterval(updateLinkStatistics, 5000);
});
