// admin.js - Sistema di Amministrazione Check-in (COMPLETO)
// Parità funzionale con l'originale + sessione admin con hash + hash token nei link

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
const ADMIN_PASSWORD = "1122"; // come nel tuo originale; opzionale: spostare su settings/admin_password
const SHELLY_API_URL =
  "https://shelly-73-eu.shelly.cloud/v2/devices/api/set/switch";

// Segreto per hash di sessione admin e hash dei token link (lato admin)
// (non usato lato ospite)
const ADMIN_SECRET = "admin_local_secret_strong_!@#2025";

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
// UTILS
// =============================================
function qs(id) {
  return document.getElementById(id);
}

async function sha256(str) {
  const enc = new TextEncoder().encode(str);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// =============================================
// AUTENTICAZIONE ADMIN (ibrida: flag + hash sessione)
// =============================================
function isAdminSessionValid() {
  // Compatibilità con tuo originale:
  const flag = localStorage.getItem("adminAuthenticated") === "true";
  // Nuovo: hash di sessione
  const ts = sessionStorage.getItem("admin_session_ts");
  const h = sessionStorage.getItem("admin_session_hash");
  return flag && !!ts && !!h;
}

async function establishAdminSession() {
  const ts = Date.now().toString();
  const hash = await sha256(ts + ADMIN_SECRET);
  sessionStorage.setItem("admin_session_ts", ts);
  sessionStorage.setItem("admin_session_hash", hash);
  localStorage.setItem("adminAuthenticated", "true"); // mantengo per compatibilità UI
}

function clearAdminSession() {
  sessionStorage.removeItem("admin_session_ts");
  sessionStorage.removeItem("admin_session_hash");
  localStorage.removeItem("adminAuthenticated");
}

// =============================================
// GESTIONE AUTENTICAZIONE (UI + flusso)
// =============================================
document.addEventListener("DOMContentLoaded", function () {
  const isAuthenticated = isAdminSessionValid();
  if (isAuthenticated) {
    showAdminInterface();
  } else {
    showLoginModal();
  }
  const pw = document.getElementById("adminPassword");
  if (pw) pw.focus();

  // Avvii periodici che nel tuo file erano a fondo pagina
  updateActiveLinksList();
  updateLinkStatistics();
  setInterval(updateActiveLinksList, 60000);
  setInterval(updateLinkStatistics, 5000);
});

function showAdminInterface() {
  qs("loginModal").classList.add("hidden");
  qs("adminContainer").style.display = "block";
  loadSettings();
  initDoorControls();
}

function showLoginModal() {
  qs("loginModal").classList.remove("hidden");
  qs("adminContainer").style.display = "none";
}

document.getElementById("btnLogin").addEventListener("click", handleLogin);
document.getElementById("adminPassword").addEventListener("keypress", (e) => {
  if (e.key === "Enter") handleLogin();
});

async function handleLogin() {
  const password = qs("adminPassword").value.trim();
  const loginError = qs("loginError");
  const loginModal = qs("loginModal");

  if (password === ADMIN_PASSWORD) {
    await establishAdminSession();
    showAdminInterface();
  } else {
    loginError.style.display = "block";
    qs("adminPassword").value = "";
    qs("adminPassword").focus();
    loginModal.classList.add("shake");
    setTimeout(() => loginModal.classList.remove("shake"), 500);
  }
}

// opzionale: se in UI esiste un bottone logout
if (qs("btnLogout")) {
  qs("btnLogout").addEventListener("click", () => {
    clearAdminSession();
    showLoginModal();
  });
}

// =============================================
// GESTIONE IMPOSTAZIONI (FIREBASE + LOCALSTORAGE)
// =============================================
async function saveSettingToFirebase(key, value) {
  try {
    await database.ref("settings/" + key).set(value);
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
    console.error("Errore nel caricamento impostazioni da Firebase:", error);
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

  qs("currentCode").value = secretCode;
  qs("currentMaxClicks").value = maxClicks;
  qs("currentTimeLimit").value = timeLimit;
  qs("newMaxClicks").value = maxClicks;
  qs("newTimeLimit").value = timeLimit;

  localStorage.setItem("secret_code", secretCode);
  localStorage.setItem("max_clicks", maxClicks);
  localStorage.setItem("time_limit_minutes", timeLimit);
}

function applySettingsFromLocalStorage() {
  const secretCode = localStorage.getItem("secret_code") || "2245";
  const maxClicks = localStorage.getItem("max_clicks") || "3";
  const timeLimit = localStorage.getItem("time_limit_minutes") || "50000";

  qs("currentCode").value = secretCode;
  qs("currentMaxClicks").value = maxClicks;
  qs("currentTimeLimit").value = timeLimit;
  qs("newMaxClicks").value = maxClicks;
  qs("newTimeLimit").value = timeLimit;

  saveSettingToFirebase("secret_code", secretCode);
  saveSettingToFirebase("max_clicks", maxClicks);
  saveSettingToFirebase("time_limit_minutes", timeLimit);
}

// =============================================
// GESTIONE CODICE SEGRETO
// =============================================
document
  .getElementById("btnCodeUpdate")
  .addEventListener("click", updateSecretCode);

async function updateSecretCode() {
  const newCode = qs("newCode").value.trim();
  if (!newCode) return alert("Inserisci un codice valido");

  const ok = await saveSettingToFirebase("secret_code", newCode);
  if (!ok) return alert("Errore nel salvataggio del nuovo codice.");

  localStorage.setItem("secret_code", newCode);

  // bump versione codice (come nel tuo originale)
  const currentVersion = parseInt(localStorage.getItem("code_version")) || 1;
  const newVersion = currentVersion + 1;
  localStorage.setItem("code_version", newVersion.toString());
  await saveSettingToFirebase("code_version", newVersion);

  const timestamp = Date.now().toString();
  localStorage.setItem("last_code_update", timestamp);
  await saveSettingToFirebase("last_code_update", timestamp);

  qs("currentCode").value = newCode;
  qs("newCode").value = "";
  alert("Codice aggiornato! Gli utenti dovranno usare il nuovo codice.");
}

// =============================================
// GESTIONE IMPOSTAZIONI DI SISTEMA
// =============================================
document
  .getElementById("btnSettingsUpdate")
  .addEventListener("click", updateSystemSettings);

async function updateSystemSettings() {
  const newMaxClicks = qs("newMaxClicks").value.trim();
  const newTimeLimit = qs("newTimeLimit").value.trim();

  if (!newMaxClicks || isNaN(newMaxClicks) || parseInt(newMaxClicks) <= 0) {
    return alert("Inserisci un numero valido per i click massimi");
  }
  if (!newTimeLimit || isNaN(newTimeLimit) || parseInt(newTimeLimit) <= 0) {
    return alert("Inserisci un numero valido per il time limit");
  }

  const ok1 = await saveSettingToFirebase("max_clicks", newMaxClicks);
  const ok2 = await saveSettingToFirebase("time_limit_minutes", newTimeLimit);

  if (ok1 && ok2) {
    localStorage.setItem("max_clicks", newMaxClicks);
    localStorage.setItem("time_limit_minutes", newTimeLimit);
    qs("currentMaxClicks").value = newMaxClicks;
    qs("currentTimeLimit").value = newTimeLimit;
    alert("Impostazioni aggiornate!");
  } else {
    alert("Errore nel salvataggio impostazioni.");
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

// function loadCheckinTimeSettings() {
//   const s = localStorage.getItem("checkin_start_time") || "12:00";
//   const e = localStorage.getItem("checkin_end_time") || "23:00";
//   qs("checkinStartTime").value = s;
//   qs("checkinEndTime").value = e;
//   qs("currentCheckinTimeRange").value = `${s} - ${e}`;
//   updateCheckinTimeStatus();
// }

function loadCheckinTimeSettings() {
  // Listener realtime su /settings
  database.ref("settings").on("value", (snap) => {
    const s = snap.val() || {};
    const start = s.checkin_start_time || "14:00";
    const end = s.checkin_end_time || "22:00";
    const enabled = String(s.checkin_time_enabled) !== "false";

    // Aggiorna UI admin
    document.getElementById("checkinStartTime").value = start;
    document.getElementById("checkinEndTime").value = end;
    document.getElementById(
      "currentCheckinTimeRange"
    ).value = `${start} - ${end}`;

    // Aggiorna stato/label pulsante
    const checkinTimeStatusEl = document.getElementById("checkinTimeStatus");
    const toggleButton = document.getElementById("btnToggleCheckinTime");

    if (enabled) {
      checkinTimeStatusEl.innerHTML =
        '<span class="status-indicator status-on"></span> Attivo';
      toggleButton.classList.remove("btn-error");
      toggleButton.classList.add("btn-success");
      toggleButton.innerHTML =
        '<i class="fas fa-toggle-on"></i> Disattiva Controllo Orario';
    } else {
      checkinTimeStatusEl.innerHTML =
        '<span class="status-indicator status-off"></span> Disattivato';
      toggleButton.classList.remove("btn-success");
      toggleButton.classList.add("btn-error");
      toggleButton.innerHTML =
        '<i class="fas fa-toggle-off"></i> Attiva Controllo Orario';
    }
  });
}


// function updateCheckinTimeStatus() {
//   const el = qs("checkinTimeStatus");
//   const toggle = qs("btnToggleCheckinTime");
//   const isEnabled = localStorage.getItem("checkin_time_enabled") !== "false";

//   if (isEnabled) {
//     el.innerHTML = '<span class="status-indicator status-on"></span> Attivo';
//     toggle.classList.add("btn-success");
//     toggle.innerHTML =
//       '<i class="fas fa-toggle-on"></i> Disattiva Controllo Orario';
//   } else {
//     el.innerHTML =
//       '<span class="status-indicator status-off"></span> Disattivato';
//     toggle.classList.add("btn-error");
//     toggle.innerHTML =
//       '<i class="fas fa-toggle-off"></i> Attiva Controllo Orario';
//   }
// }

async function updateCheckinTime() {
  const newStart = document.getElementById("checkinStartTime").value;
  const newEnd = document.getElementById("checkinEndTime").value;

  if (!newStart || !newEnd) {
    alert("Inserisci orari validi");
    return;
  }
  if (!isValidTimeRange(newStart, newEnd)) {
    document.getElementById("timeRangeError").style.display = "block";
    return;
  }
  document.getElementById("timeRangeError").style.display = "none";

  const s1 = await saveSettingToFirebase("checkin_start_time", newStart);
  const s2 = await saveSettingToFirebase("checkin_end_time", newEnd);
  if (s1 && s2) {
    alert("Orario di check-in aggiornato con successo!");
  } else {
    alert("Errore nel salvataggio dell'orario di check-in. Riprovare.");
  }
}


// async function updateCheckinTime() {
//   const s = qs("checkinStartTime").value;
//   const e = qs("checkinEndTime").value;
//   if (!s || !e) return alert("Inserisci orari validi");

//   if (!isValidTimeRange(s, e)) {
//     qs("timeRangeError").style.display = "block";
//     return;
//   }
//   qs("timeRangeError").style.display = "none";

//   const ok1 = await saveSettingToFirebase("checkin_start_time", s);
//   const ok2 = await saveSettingToFirebase("checkin_end_time", e);

//   if (ok1 && ok2) {
//     localStorage.setItem("checkin_start_time", s);
//     localStorage.setItem("checkin_end_time", e);
//     qs("currentCheckinTimeRange").value = `${s} - ${e}`;
//     alert("Orario di check-in aggiornato!");
//   } else {
//     alert("Errore nel salvataggio dell'orario di check-in.");
//   }
// }

function isValidTimeRange(startTime, endTime) {
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  return eh * 60 + em > sh * 60 + sm;
}

// async function toggleCheckinTime() {
//   const cur = localStorage.getItem("checkin_time_enabled");
//   const newVal = cur === null ? false : cur !== "true";

//   const ok = await saveSettingToFirebase(
//     "checkin_time_enabled",
//     newVal.toString()
//   );
//   if (ok) {
//     localStorage.setItem("checkin_time_enabled", newVal.toString());
//     updateCheckinTimeStatus();
//     alert(`Controllo orario ${newVal ? "attivato" : "disattivato"}!`);
//   } else {
//     alert("Errore nel salvataggio impostazione.");
//   }
// }


async function toggleCheckinTime() {
  const snap = await database
    .ref("settings/checkin_time_enabled")
    .once("value");
  const current = String(snap.val()) !== "false";
  const newStatus = !current;

  const ok = await saveSettingToFirebase(
    "checkin_time_enabled",
    newStatus.toString()
  );
  if (ok) {
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

function loadExtraDoorsVisibility() {
  try {
    const devices = JSON.parse(localStorage.getItem("devices")) || [];
    if (devices.length >= 4) {
      qs("extraDoor1Visible").checked = devices[2].visible || false;
      qs("extraDoor2Visible").checked = devices[3].visible || false;
    }
  } catch (e) {
    console.error("Errore nel caricamento delle porte extra:", e);
  }
}

function updateExtraDoorsVisibilitySettings() {
  try {
    let devices = JSON.parse(localStorage.getItem("devices")) || [];

    if (devices.length === 0) {
      devices = [
        { button_id: "MainDoor", visible: true },
        { button_id: "AptDoor", visible: true },
        { button_id: "ExtraDoor1", visible: qs("extraDoor1Visible").checked },
        { button_id: "ExtraDoor2", visible: qs("extraDoor2Visible").checked },
      ];
    } else {
      if (devices.length > 2)
        devices[2].visible = qs("extraDoor1Visible").checked;
      if (devices.length > 3)
        devices[3].visible = qs("extraDoor2Visible").checked;
    }

    localStorage.setItem("devices", JSON.stringify(devices));
    updateExtraDoorsVisibility();
    alert("Visibilità porte extra aggiornata!");
  } catch (e) {
    console.error("Errore nel salvataggio delle porte extra:", e);
    alert("Si è verificato un errore durante il salvataggio.");
  }
}

// =============================================
// GESTIONE LINK SICURI (Firebase + fallback LS) + HASH TOKEN
// =============================================
document
  .getElementById("btnGenerateSecureLink")
  .addEventListener("click", generateSecureLink);
document
  .getElementById("btnCopySecureLink")
  .addEventListener("click", copyGeneratedLink);

function generateUniqueId() {
  return "link_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
}

async function generateSecureLink() {
  const expirationHours = parseInt(qs("linkExpiration").value);
  const maxUsage = parseInt(qs("linkUsage").value);
  const customCode = qs("linkCustomCode").value.trim();

  const linkId = generateUniqueId();
  const expirationTime = Date.now() + expirationHours * 60 * 60 * 1000;
  const baseUrl = window.location.origin + window.location.pathname;
  const indexUrl = baseUrl.replace("admin.html", "index.html");
  const secureLink = `${indexUrl}?token=${linkId}`;
  qs("generatedSecureLink").value = secureLink;

  // NUOVO: hash del token per integrità lato client
  const tokenHash = await sha256(linkId + ADMIN_SECRET);

  saveSecureLink(
    linkId,
    expirationTime,
    maxUsage,
    expirationHours,
    customCode,
    tokenHash
  );
}

function saveSecureLink(
  linkId,
  expirationTime,
  maxUsage,
  expirationHours,
  customCode = null,
  tokenHash = null
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
    hash: tokenHash, // <— nuovo campo
  };

  database
    .ref("secure_links/" + linkId)
    .set(linkData)
    .then(() => {
      updateActiveLinksList();
      updateLinkStatistics();
      qs("linkCustomCode").value = "";
    })
    .catch((error) => {
      console.error("Errore salvataggio link su Firebase:", error);
      // Fallback localStorage
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
  const input = qs("generatedSecureLink");
  if (!input.value) return alert("Genera prima un link");
  input.select();
  document.execCommand("copy");

  const btn = qs("btnCopySecureLink");
  const original = btn.innerHTML;
  btn.innerHTML = '<i class="fas fa-check"></i> Copiato!';
  btn.style.background = "var(--success)";
  setTimeout(() => {
    btn.innerHTML = original;
    btn.style.background = "";
  }, 2000);
}

function updateActiveLinksList() {
  const container = qs("activeLinksList");
  container.innerHTML =
    '<p style="color:#666;text-align:center;">Caricamento...</p>';

  database
    .ref("secure_links")
    .orderByChild("created")
    .once("value")
    .then((snapshot) => {
      const active = [];
      snapshot.forEach((child) => {
        const link = child.val();
        if (link.status === "active" && link.expiration > Date.now())
          active.push(link);
      });
      renderActiveLinks(container, active);
    })
    .catch((error) => {
      console.error("Errore nel recupero dei link:", error);
      const secureLinks = JSON.parse(
        localStorage.getItem("secure_links") || "{}"
      );
      const active = Object.values(secureLinks).filter(
        (l) => l.status === "active" && l.expiration > Date.now()
      );
      renderActiveLinks(container, active);
    });
}

function renderActiveLinks(container, activeLinks) {
  if (activeLinks.length === 0) {
    container.innerHTML =
      '<p style="color:#666;text-align:center;">Nessun link attivo</p>';
    return;
  }
  container.innerHTML = "";
  activeLinks
    .sort((a, b) => b.created - a.created)
    .forEach((l) => {
      container.appendChild(createLinkElement(l));
    });
}

function createLinkElement(link) {
  const el = document.createElement("div");
  el.style.cssText = `
    padding: 10px; margin: 8px 0; background: #f8f9fa;
    border-radius: 6px; border-left: 4px solid var(--success);
  `;

  const expiresIn = Math.max(
    0,
    Math.floor((link.expiration - Date.now()) / (1000 * 60 * 60))
  );
  const usageText = `${link.usedCount}/${link.maxUsage} utilizzi`;

  let html = `
    <div style="font-size:11px;color:#666">
      Creato: ${new Date(link.created).toLocaleString("it-IT")}
    </div>
    <div style="font-weight:bold;margin:3px 0;color:var(--dark)">
      Scade in: ${expiresIn}h • ${usageText}
    </div>
    <div style="font-size:12px;overflow:hidden;text-overflow:ellipsis;margin-bottom:5px;">
      <a href="${
        window.location.origin +
        window.location.pathname.replace("admin.html", "index.html")
      }?token=${link.id}"
         target="_blank" style="color:var(--primary)">${link.id}</a>
    </div>
    <div style="display:flex;gap:5px;">
      <button onclick="copySecureLink('${
        link.id
      }')" style="background:var(--primary);color:#fff;border:none;padding:4px 8px;border-radius:4px;cursor:pointer;font-size:11px">
        <i class="fas fa-copy"></i> Copia
      </button>
      <button onclick="revokeSecureLink('${
        link.id
      }')" style="background:var(--error);color:#fff;border:none;padding:4px 8px;border-radius:4px;cursor:pointer;font-size:11px">
        <i class="fas fa-ban"></i> Revoca
      </button>
    </div>
  `;
  if (link.customCode) {
    html += `<div style="font-size:11px;color:var(--primary);margin-top:5px">
      <i class="fas fa-key"></i> Codice dedicato: ${link.customCode}
    </div>`;
  }
  if (link.hash) {
    html += `<div style="font-size:10px;color:#888;margin-top:4px">
      <i class="fas fa-fingerprint"></i> Hash: ${link.hash.substring(0, 16)}…
    </div>`;
  }

  el.innerHTML = html;
  return el;
}

function copySecureLink(id) {
  const baseUrl = window.location.origin + window.location.pathname;
  const indexUrl = baseUrl.replace("admin.html", "index.html");
  const link = `${indexUrl}?token=${id}`;
  const input = document.createElement("input");
  input.value = link;
  document.body.appendChild(input);
  input.select();
  document.execCommand("copy");
  document.body.removeChild(input);
  alert("Link copiato negli appunti!");
}

function revokeSecureLink(id) {
  database
    .ref("secure_links/" + id)
    .update({ status: "revoked", expiration: Date.now() })
    .then(() => {
      updateActiveLinksList();
      updateLinkStatistics();
      alert("Link revocato!");
    })
    .catch((error) => {
      console.error("Errore revoca su Firebase:", error);
      const secureLinks = JSON.parse(
        localStorage.getItem("secure_links") || "{}"
      );
      if (secureLinks[id]) {
        secureLinks[id].status = "revoked";
        secureLinks[id].expiration = Date.now();
        localStorage.setItem("secure_links", JSON.stringify(secureLinks));
        updateActiveLinksList();
        updateLinkStatistics();
        alert("Link revocato (locale)!");
      }
    });
}

function updateLinkStatistics() {
  database
    .ref("secure_links")
    .once("value")
    .then((snapshot) => {
      const links = [];
      snapshot.forEach((c) => links.push(c.val()));
      updateStatisticsUI(links);
    })
    .catch((error) => {
      console.error("Errore statistiche:", error);
      const secureLinks = JSON.parse(
        localStorage.getItem("secure_links") || "{}"
      );
      updateStatisticsUI(Object.values(secureLinks));
    });
}

function updateStatisticsUI(links) {
  qs("totalLinks").textContent = links.length;
  qs("activeLinks").textContent = links.filter(
    (l) => l.status === "active" && l.expiration > Date.now()
  ).length;
  qs("usedLinks").textContent = links.filter((l) => l.status === "used").length;
  qs("expiredLinks").textContent = links.filter(
    (l) => l.status === "expired" || l.status === "revoked"
  ).length;
}

// =============================================
// CONTROLLO PORTE (SHELLY)
// =============================================
function initDoorControls() {
  updateExtraDoorsVisibility();

  ADMIN_DEVICES.forEach((device) => {
    const button = qs(device.button_id);
    if (button) button.addEventListener("click", () => openDoor(device));
  });

  if (qs("btnOpenAllDoors"))
    qs("btnOpenAllDoors").addEventListener("click", openAllDoors);
  if (qs("btnCheckAllDoors"))
    qs("btnCheckAllDoors").addEventListener("click", checkAllDoorsStatus);

  checkAllDoorsStatus();
}

function updateExtraDoorsVisibility() {
  try {
    const devices = JSON.parse(localStorage.getItem("devices")) || [];
    ADMIN_DEVICES.forEach((device, index) => {
      if (device.container_id) {
        const container = qs(device.container_id);
        if (container) {
          container.style.display =
            devices.length > index && devices[index] && devices[index].visible
              ? "block"
              : "none";
        }
      }
    });
  } catch (e) {
    console.error("Errore visibilità porte extra:", e);
  }
}

async function openDoor(device) {
  const button = qs(device.button_id);
  const resultDiv = qs(device.result_id);

  button.disabled = true;
  button.innerHTML =
    '<i class="fas fa-spinner fa-spin"></i> Apertura in corso...';
  updateDoorStatus(device, "working", "Apertura in corso...");

  try {
    const resp = await fetch(SHELLY_API_URL, {
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

    if (resp.ok) {
      const text = await resp.text();
      let data = { ok: true };
      if (text.trim() !== "") {
        try {
          data = JSON.parse(text);
        } catch {
          /* risposta non JSON */
        }
      }
      if (data && data.ok) {
        handleDoorSuccess(device, resultDiv, "Porta aperta con successo");
      } else {
        handleDoorSuccess(
          device,
          resultDiv,
          "Porta aperta (risposta non standard)",
          text
        );
      }
    } else {
      throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
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
      ${device.name} aperta alle ${new Date().toLocaleTimeString()}
      ${
        responseText
          ? `<br><small>API: ${responseText.substring(0, 100)}</small>`
          : ""
      }
    </div>
  `;
  logDoorAction(device.name, "success", responseText || message);
}

function handleDoorError(device, resultDiv, error) {
  updateDoorStatus(device, "error", "Errore nell'apertura");
  resultDiv.innerHTML = `
    <div class="error-message">
      <i class="fas fa-exclamation-circle"></i>
      Errore apertura ${device.name}: ${error.message}
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
      qs(device.result_id).innerHTML = "";
    }, 5000);
  }, 3000);
}

async function openAllDoors() {
  const results = [];
  for (const device of ADMIN_DEVICES) {
    if (device.container_id) {
      const c = qs(device.container_id);
      if (c && c.style.display === "none") continue;
    }
    try {
      await openDoor(device);
      results.push({ device: device.name, status: "success" });
    } catch (e) {
      results.push({ device: device.name, status: "error", error: e.message });
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  showBulkOperationResult("Apertura multipla completata", results);
}

async function checkAllDoorsStatus() {
  ADMIN_DEVICES.forEach((device) => {
    if (device.container_id) {
      const c = qs(device.container_id);
      if (c && c.style.display === "none") return;
    }
    checkDoorStatus(device);
  });
}

function checkDoorStatus(device) {
  // qui potresti interrogare lo stato reale; attualmente mock come nel tuo file
  updateDoorStatus(device, "success", "Porta disponibile");
}

function updateDoorStatus(device, status, message) {
  const indicator = qs(device.status_id);
  const text = qs(device.status_text_id);
  indicator.className = "status-indicator";
  text.textContent = `Stato: ${message}`;
  switch (status) {
    case "success":
      indicator.classList.add("status-on");
      break;
    case "error":
      indicator.classList.add("status-off");
      break;
    case "working":
      indicator.classList.add("status-working");
      break;
    default:
      indicator.classList.add("status-unknown");
  }
}

function showBulkOperationResult(title, results) {
  const ok = results.filter((r) => r.status === "success").length;
  const ko = results.filter((r) => r.status === "error").length;
  alert(
    `${title}\n\nSuccessi: ${ok}\nErrori: ${ko}\n\nControlla i log per i dettagli.`
  );
}

function logDoorAction(doorName, status, error = null) {
  const entry = {
    timestamp: new Date().toISOString(),
    door: doorName,
    status,
    error,
    admin: true,
  };
  try {
    const logs = JSON.parse(localStorage.getItem("doorActionLogs")) || [];
    logs.unshift(entry);
    if (logs.length > 100) logs.splice(100);
    localStorage.setItem("doorActionLogs", JSON.stringify(logs));
  } catch (e) {
    console.error("Errore salvataggio log:", e);
  }
}

// =============================================
// GESTIONE SESSIONE LOCALE (reset pulito)
// =============================================
document
  .getElementById("btnResetLocalSession")
  .addEventListener("click", () => {
    if (confirm("Ripristinare la sessione locale?")) resetLocalSession();
  });

function resetLocalSession() {
  try {
    const important = [
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
    const toRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!important.some((p) => k.startsWith(p))) toRemove.push(k);
    }
    toRemove.forEach((k) => localStorage.removeItem(k));
    clearSessionCookies();
    sessionStorage.removeItem("admin_session_ts");
    sessionStorage.removeItem("admin_session_hash");
    showResetResult();
  } catch (e) {
    console.error("Errore ripristino:", e);
    showResetError(e);
  }
}

function clearSessionCookies() {
  try {
    const cookies = document.cookie.split(";");
    for (let c of cookies) {
      const [name] = c.trim().split("=");
      if (name && !name.startsWith("adminAuthenticated")) {
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
      }
    }
  } catch (e) {
    console.error("Errore pulizia cookie:", e);
  }
}

function showResetResult() {
  const el = qs("localResetResult");
  el.innerHTML = `
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
  setTimeout(() => (el.innerHTML = ""), 5000);
}

function showResetError(error) {
  const el = qs("localResetResult");
  el.innerHTML = `
    <div class="error-message">
      <i class="fas fa-exclamation-circle"></i>
      Errore nel ripristino: ${error.message}
    </div>
  `;
}
