
(() => {
  "use strict";

  // =============================================
  // CONFIGURAZIONE E INIZIALIZZAZIONE
  // =============================================
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

  // Valori di fallback (possono essere sovrascritti da settings Firebase)
  let ADMIN_PASSWORD = "1122"; // TODO: spostare su settings/admin_password
  const SHELLY_API_URL =
    "https://shelly-73-eu.shelly.cloud/v2/devices/api/set/switch";

  // Segreto per hash: può essere sovrascritto da settings/admin_secret
  let ADMIN_SECRET = "admin_local_secret_strong_!@#2025";

  // Configurazione dispositivi Shelly
  const ADMIN_DEVICES = Object.freeze([
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
  ]);

  // Inizializza Firebase (se non già inizializzato altrove)
  if (!firebase.apps || firebase.apps.length === 0) {
    firebase.initializeApp(firebaseConfig);
  }
  const database = firebase.database();

  // =============================================
  // UTILS
  // =============================================
  function qs(id) {
    return document.getElementById(id);
  }
  function on(id, evt, handler) {
    const el = qs(id);
    if (el) el.addEventListener(evt, handler);
  }
  function fmtDateTime(ms) {
    try {
      return new Date(ms).toLocaleString("it-IT");
    } catch {
      return "" + ms;
    }
  }
  async function sha256(str) {
    const enc = new TextEncoder().encode(str);
    const buf = await crypto.subtle.digest("SHA-256", enc);
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  function alertOnce(msg) {
    // wrapper semplice per eventuale futura sostituzione con toast
    window.alert(msg);
  }

  // Fetch con timeout (AbortController)
  async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(id);
    }
  }

  // =============================================
  // AUTENTICAZIONE ADMIN (ibrida: flag + hash sessione)
  // =============================================
  function isAdminSessionValid() {
    const flag = localStorage.getItem("adminAuthenticated") === "true";
    // const ts = sessionStorage.getItem("admin_session_ts");
    // const h = sessionStorage.getItem("admin_session_hash");
     const ts = localStorage.getItem("admin_session_ts");
     const h = localStorage.getItem("admin_session_hash");
    return flag && !!ts && !!h;
  }

  async function establishAdminSession() {
    const ts = Date.now().toString();
    const hash = await sha256(ts + ADMIN_SECRET);
      localStorage.setItem("admin_session_ts", ts);
      localStorage.setItem("admin_session_hash", hash);
      localStorage.setItem("adminAuthenticated", "true");
  }

  function clearAdminSession() {
    // sessionStorage.removeItem("admin_session_ts");
    // sessionStorage.removeItem("admin_session_hash");
    // localStorage.removeItem("adminAuthenticated");
     localStorage.removeItem("admin_persist_ts");
     localStorage.removeItem("admin_persist_hash");
     localStorage.removeItem("admin_persist_exp");
     localStorage.removeItem("adminAuthenticated");
  }

  // =============================================
  // GESTIONE UI LOGIN/ADMIN
  // =============================================
  function showAdminInterface() {
    const loginModal = qs("loginModal");
    const adminContainer = qs("adminContainer");
    if (loginModal) loginModal.classList.add("hidden");
    if (adminContainer) adminContainer.style.display = "block";
    loadSettings();
    initDoorControls();
  }

  function showLoginModal() {
    const loginModal = qs("loginModal");
    const adminContainer = qs("adminContainer");
    if (loginModal) loginModal.classList.remove("hidden");
    if (adminContainer) adminContainer.style.display = "none";
  }

  async function handleLogin() {
    const pwEl = qs("adminPassword");
    const password = (pwEl?.value || "").trim();
    const loginError = qs("loginError");
    const loginModal = qs("loginModal");

    // Consenti override da Firebase settings (admin_password)
    try {
      const snap = await database.ref("settings/admin_password").once("value");
      const remotePw = snap?.val();
      if (typeof remotePw === "string" && remotePw.length > 0) {
        ADMIN_PASSWORD = remotePw;
      }
    } catch {
      /* ignora se non raggiungibile */
    }

    if (password === ADMIN_PASSWORD) {
      await establishAdminSession();
      showAdminInterface();
    } else {
      if (loginError) loginError.style.display = "block";
      if (pwEl) {
        pwEl.value = "";
        pwEl.focus();
      }
      if (loginModal) {
        loginModal.classList.add("shake");
        setTimeout(() => loginModal.classList.remove("shake"), 500);
      }
    }
  }

  // =============================================
  // IMPOSTAZIONI (Firebase + LocalStorage)
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

    // Override segreti se presenti
    if (firebaseSettings) {
      if (typeof firebaseSettings.admin_secret === "string") {
        ADMIN_SECRET = firebaseSettings.admin_secret;
      }
      if (typeof firebaseSettings.admin_password === "string") {
        ADMIN_PASSWORD = firebaseSettings.admin_password;
      }
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

    const currentCode = qs("currentCode");
    const currentMaxClicks = qs("currentMaxClicks");
    const currentTimeLimit = qs("currentTimeLimit");
    const newMaxClicks = qs("newMaxClicks");
    const newTimeLimit = qs("newTimeLimit");

    if (currentCode) currentCode.value = secretCode;
    if (currentMaxClicks) currentMaxClicks.value = maxClicks;
    if (currentTimeLimit) currentTimeLimit.value = timeLimit;
    if (newMaxClicks) newMaxClicks.value = maxClicks;
    if (newTimeLimit) newTimeLimit.value = timeLimit;

    localStorage.setItem("secret_code", secretCode);
    localStorage.setItem("max_clicks", String(maxClicks));
    localStorage.setItem("time_limit_minutes", String(timeLimit));
  }

  function applySettingsFromLocalStorage() {
    const secretCode = localStorage.getItem("secret_code") || "2245";
    const maxClicks = localStorage.getItem("max_clicks") || "3";
    const timeLimit = localStorage.getItem("time_limit_minutes") || "50000";

    const currentCode = qs("currentCode");
    const currentMaxClicks = qs("currentMaxClicks");
    const currentTimeLimit = qs("currentTimeLimit");
    const newMaxClicks = qs("newMaxClicks");
    const newTimeLimit = qs("newTimeLimit");

    if (currentCode) currentCode.value = secretCode;
    if (currentMaxClicks) currentMaxClicks.value = maxClicks;
    if (currentTimeLimit) currentTimeLimit.value = timeLimit;
    if (newMaxClicks) newMaxClicks.value = maxClicks;
    if (newTimeLimit) newTimeLimit.value = timeLimit;

    saveSettingToFirebase("secret_code", secretCode);
    saveSettingToFirebase("max_clicks", maxClicks);
    saveSettingToFirebase("time_limit_minutes", timeLimit);
  }

  async function updateSecretCode() {
    const newCodeEl = qs("newCode");
    const newCode = (newCodeEl?.value || "").trim();
    if (!newCode) return alertOnce("Inserisci un codice valido");

    const ok = await saveSettingToFirebase("secret_code", newCode);
    if (!ok) return alertOnce("Errore nel salvataggio del nuovo codice.");

    localStorage.setItem("secret_code", newCode);

    const currentVersion = parseInt(
      localStorage.getItem("code_version") || "1",
      10
    );
    const newVersion = currentVersion + 1;
    localStorage.setItem("code_version", String(newVersion));
    await saveSettingToFirebase("code_version", newVersion);

    const timestamp = Date.now().toString();
    localStorage.setItem("last_code_update", timestamp);
    await saveSettingToFirebase("last_code_update", timestamp);

    const currentCode = qs("currentCode");
    if (currentCode) currentCode.value = newCode;
    if (newCodeEl) newCodeEl.value = "";
    alertOnce("Codice aggiornato! Gli utenti dovranno usare il nuovo codice.");
  }

  async function updateSystemSettings() {
    const newMaxClicks = (qs("newMaxClicks")?.value || "").trim();
    const newTimeLimit = (qs("newTimeLimit")?.value || "").trim();

    const clicksNum = parseInt(newMaxClicks, 10);
    const timeNum = parseInt(newTimeLimit, 10);

    if (!Number.isFinite(clicksNum) || clicksNum <= 0) {
      return alertOnce("Inserisci un numero valido per i click massimi");
    }
    if (!Number.isFinite(timeNum) || timeNum <= 0) {
      return alertOnce("Inserisci un numero valido per il time limit");
    }

    const ok1 = await saveSettingToFirebase("max_clicks", clicksNum);
    const ok2 = await saveSettingToFirebase("time_limit_minutes", timeNum);

    if (ok1 && ok2) {
      localStorage.setItem("max_clicks", String(clicksNum));
      localStorage.setItem("time_limit_minutes", String(timeNum));
      const currentMaxClicks = qs("currentMaxClicks");
      const currentTimeLimit = qs("currentTimeLimit");
      if (currentMaxClicks) currentMaxClicks.value = String(clicksNum);
      if (currentTimeLimit) currentTimeLimit.value = String(timeNum);
      alertOnce("Impostazioni aggiornate!");
    } else {
      alertOnce("Errore nel salvataggio impostazioni.");
    }
  }

  // =============================================
  // ORARIO CHECK‑IN
  // =============================================
  function loadCheckinTimeSettings() {
    database.ref("settings").on("value", (snap) => {
      const s = snap.val() || {};
      const start = s.checkin_start_time || "14:00";
      const end = s.checkin_end_time || "22:00";
      const enabled = String(s.checkin_time_enabled) !== "false";

      const startEl = qs("checkinStartTime");
      const endEl = qs("checkinEndTime");
      const currentRangeEl = qs("currentCheckinTimeRange");
      const statusEl = qs("checkinTimeStatus");
      const toggleBtn = qs("btnToggleCheckinTime");

      if (startEl) startEl.value = start;
      if (endEl) endEl.value = end;
      if (currentRangeEl) currentRangeEl.value = `${start} - ${end}`;

      if (statusEl && toggleBtn) {
        if (enabled) {
          statusEl.innerHTML =
            '<span class="status-indicator status-on"></span> Attivo';
          toggleBtn.classList.remove("btn-error");
          toggleBtn.classList.add("btn-success");
          toggleBtn.innerHTML =
            '<i class="fas fa-toggle-on"></i> Disattiva Controllo Orario';
        } else {
          statusEl.innerHTML =
            '<span class="status-indicator status-off"></span> Disattivato';
          toggleBtn.classList.remove("btn-success");
          toggleBtn.classList.add("btn-error");
          toggleBtn.innerHTML =
            '<i class="fas fa-toggle-off"></i> Attiva Controllo Orario';
        }
      }
    });
  }

  function isValidTimeRange(startTime, endTime) {
    const [sh, sm] = startTime.split(":").map(Number);
    const [eh, em] = endTime.split(":").map(Number);
    return eh * 60 + em > sh * 60 + sm;
  }

  async function updateCheckinTime() {
    const start = qs("checkinStartTime")?.value;
    const end = qs("checkinEndTime")?.value;

    if (!start || !end) {
      alertOnce("Inserisci orari validi");
      return;
    }
    if (!isValidTimeRange(start, end)) {
      const errEl = qs("timeRangeError");
      if (errEl) errEl.style.display = "block";
      return;
    }
    const errEl = qs("timeRangeError");
    if (errEl) errEl.style.display = "none";

    const s1 = await saveSettingToFirebase("checkin_start_time", start);
    const s2 = await saveSettingToFirebase("checkin_end_time", end);
    if (s1 && s2) {
      alertOnce("Orario di check-in aggiornato con successo!");
    } else {
      alertOnce("Errore nel salvataggio dell'orario di check-in. Riprovare.");
    }
  }

  async function toggleCheckinTime() {
    const snap = await database
      .ref("settings/checkin_time_enabled")
      .once("value");
    const current = String(snap.val()) !== "false";
    const newStatus = !current;

    const ok = await saveSettingToFirebase(
      "checkin_time_enabled",
      String(newStatus)
    );
    if (ok) {
      alertOnce(
        `Controllo orario ${
          newStatus ? "attivato" : "disattivato"
        } con successo!`
      );
    } else {
      alertOnce("Errore nel salvataggio delle impostazioni. Riprovare.");
    }
  }

  // =============================================
  // PORTE EXTRA (visibilità)
  // =============================================
  function loadExtraDoorsVisibility() {
    try {
      const devices = JSON.parse(localStorage.getItem("devices") || "[]");
      if (devices.length >= 4) {
        const d2 = qs("extraDoor1Visible");
        const d3 = qs("extraDoor2Visible");
        if (d2) d2.checked = !!devices[2].visible;
        if (d3) d3.checked = !!devices[3].visible;
      }
    } catch (e) {
      console.error("Errore nel caricamento delle porte extra:", e);
    }
  }

  function updateExtraDoorsVisibilitySettings() {
    try {
      let devices = JSON.parse(localStorage.getItem("devices") || "[]");
      const v2 = !!qs("extraDoor1Visible")?.checked;
      const v3 = !!qs("extraDoor2Visible")?.checked;

      if (devices.length === 0) {
        devices = [
          { button_id: "MainDoor", visible: true },
          { button_id: "AptDoor", visible: true },
          { button_id: "ExtraDoor1", visible: v2 },
          { button_id: "ExtraDoor2", visible: v3 },
        ];
      } else {
        if (devices.length > 2) devices[2].visible = v2;
        if (devices.length > 3) devices[3].visible = v3;
      }

      localStorage.setItem("devices", JSON.stringify(devices));
      updateExtraDoorsVisibility();
      alertOnce("Visibilità porte extra aggiornata!");
    } catch (e) {
      console.error("Errore nel salvataggio delle porte extra:", e);
      alertOnce("Si è verificato un errore durante il salvataggio.");
    }
  }

  // =============================================
  // LINK SICURI (Firebase + LS) + HASH TOKEN
  // =============================================
  function generateUniqueId() {
    return "link_" + Date.now() + "_" + Math.random().toString(36).slice(2, 11);
  }

  async function generateSecureLink() {
    const expirationHours = parseInt(qs("linkExpiration")?.value || "0", 10);
    const maxUsage = parseInt(qs("linkUsage")?.value || "0", 10);
    const customCode = (qs("linkCustomCode")?.value || "").trim();

    if (!Number.isFinite(expirationHours) || expirationHours <= 0) {
      return alertOnce("Ore di scadenza non valide");
    }
    if (!Number.isFinite(maxUsage) || maxUsage <= 0) {
      return alertOnce("Numero utilizzi non valido");
    }

    const linkId = generateUniqueId();
    const expirationTime = Date.now() + expirationHours * 60 * 60 * 1000;
    const baseUrl = window.location.origin + window.location.pathname;
    const indexUrl = baseUrl.replace("admin.html", "index.html");
    const secureLink = `${indexUrl}?token=${linkId}`;
    const out = qs("generatedSecureLink");
    if (out) out.value = secureLink;

    // hash del token per integrità lato client (nota: segreto lato client non è realmente sicuro)
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
      maxUsage: Number(maxUsage),
      usedCount: 0,
      expirationHours: Number(expirationHours),
      status: "active",
      customCode: customCode || null,
      hash: tokenHash || null,
    };

    database
      .ref("secure_links/" + linkId)
      .set(linkData)
      .then(() => {
        updateActiveLinksList();
        updateLinkStatistics();
        const cc = qs("linkCustomCode");
        if (cc) cc.value = "";
      })
      .catch((error) => {
        console.error("Errore salvataggio link su Firebase:", error);
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
    if (!input || !input.value) return alertOnce("Genera prima un link");
    input.select();
    document.execCommand("copy");

    const btn = qs("btnCopySecureLink");
    if (!btn) return;
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
    if (container) {
      container.innerHTML =
        '<p style="color:#666;text-align:center;">Caricamento...</p>';
    }

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
    if (!container) return;
    if (!Array.isArray(activeLinks) || activeLinks.length === 0) {
      container.innerHTML =
        '<p style="color:#666;text-align:center;">Nessun link attivo</p>';
      return;
    }
    container.innerHTML = "";
    activeLinks
      .slice()
      .sort((a, b) => b.created - a.created)
      .forEach((l) => container.appendChild(createLinkElement(l)));
  }

  function createLinkElement(link) {
    const el = document.createElement("div");
    el.style.cssText = `
      padding: 10px; margin: 8px 0; background: #f8f9fa;
      border-radius: 6px; border-left: 4px solid var(--success);
    `;

    const expiresInH = Math.max(
      0,
      Math.floor((link.expiration - Date.now()) / (1000 * 60 * 60))
    );
    const usageText = `${link.usedCount}/${link.maxUsage} utilizzi`;
    const linkUrl =
      window.location.origin +
      window.location.pathname.replace("admin.html", "index.html") +
      `?token=${link.id}`;

    let html = `
      <div style="font-size:11px;color:#666">Creato: ${fmtDateTime(
        link.created
      )}</div>
      <div style="font-weight:bold;margin:3px 0;color:var(--dark)">Scade in: ${expiresInH}h • ${usageText}</div>
      <div style="font-size:12px;overflow:hidden;text-overflow:ellipsis;margin-bottom:5px;">
        <a href="${linkUrl}" target="_blank" style="color:var(--primary)">${
      link.id
    }</a>
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
        <i class="fas fa-fingerprint"></i> Hash: ${String(link.hash).slice(
          0,
          16
        )}…
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
    alertOnce("Link copiato negli appunti!");
  }

  function revokeSecureLink(id) {
    database
      .ref("secure_links/" + id)
      .update({ status: "revoked", expiration: Date.now() })
      .then(() => {
        updateActiveLinksList();
        updateLinkStatistics();
        alertOnce("Link revocato!");
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
          alertOnce("Link revocato (locale)!");
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
    const now = Date.now();
    const total = links.length;
    const active = links.filter(
      (l) => l.status === "active" && l.expiration > now
    ).length;
    const used = links.filter((l) => l.status === "used").length;
    const expired = links.filter(
      (l) => l.status === "expired" || l.status === "revoked"
    ).length;

    const totalEl = qs("totalLinks");
    const activeEl = qs("activeLinks");
    const usedEl = qs("usedLinks");
    const expiredEl = qs("expiredLinks");

    if (totalEl) totalEl.textContent = String(total);
    if (activeEl) activeEl.textContent = String(active);
    if (usedEl) usedEl.textContent = String(used);
    if (expiredEl) expiredEl.textContent = String(expired);
  }

  // =============================================
  // CONTROLLO PORTE (SHELLY)
  // =============================================
  function updateExtraDoorsVisibility() {
    try {
      const devices = JSON.parse(localStorage.getItem("devices") || "[]");
      ADMIN_DEVICES.forEach((device, index) => {
        if (!device.container_id) return;
        const container = qs(device.container_id);
        if (!container) return;
        const visible =
          devices.length > index && devices[index] && devices[index].visible;
        container.style.display = visible ? "block" : "none";
      });
    } catch (e) {
      console.error("Errore visibilità porte extra:", e);
    }
  }

  function initDoorControls() {
    updateExtraDoorsVisibility();

    ADMIN_DEVICES.forEach((device) => {
      const button = qs(device.button_id);
      if (button) button.addEventListener("click", () => openDoor(device));
    });

    on("btnOpenAllDoors", "click", openAllDoors);
    on("btnCheckAllDoors", "click", checkAllDoorsStatus);

    checkAllDoorsStatus();
  }

  async function openDoor(device) {
    const button = qs(device.button_id);
    const resultDiv = qs(device.result_id);

    if (button) {
      button.disabled = true;
      button.innerHTML =
        '<i class="fas fa-spinner fa-spin"></i> Apertura in corso...';
    }
    updateDoorStatus(device, "working", "Apertura in corso...");

    try {
      const resp = await fetchWithTimeout(
        SHELLY_API_URL,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: device.id,
            auth_key: device.auth_key,
            channel: 0,
            on: true,
            turn: "on",
          }),
        },
        12000
      );

      if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
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
    } catch (error) {
      handleDoorError(device, resultDiv, error);
    } finally {
      resetDoorButton(button, device);
    }
  }

  function handleDoorSuccess(device, resultDiv, message, responseText = "") {
    updateDoorStatus(device, "success", message);
    if (resultDiv) {
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
    }
    logDoorAction(device.name, "success", responseText || message);
  }

  function handleDoorError(device, resultDiv, error) {
    updateDoorStatus(device, "error", "Errore nell'apertura");
    if (resultDiv) {
      resultDiv.innerHTML = `
        <div class="error-message">
          <i class="fas fa-exclamation-circle"></i>
          Errore apertura ${device.name}: ${error.message}
        </div>
      `;
    }
    logDoorAction(device.name, "error", error.message);
  }

  function resetDoorButton(button, device) {
    setTimeout(() => {
      if (button) {
        button.disabled = false;
        button.innerHTML =
          '<i class="fas fa-key"></i> Apri ' + device.name.split(" ")[0];
      }
      setTimeout(() => {
        const res = qs(device.result_id);
        if (res) res.innerHTML = "";
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
        results.push({
          device: device.name,
          status: "error",
          error: e.message,
        });
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    showBulkOperationResult("Apertura multipla completata", results);
  }

  function checkAllDoorsStatus() {
    ADMIN_DEVICES.forEach((device) => {
      if (device.container_id) {
        const c = qs(device.container_id);
        if (c && c.style.display === "none") return;
      }
      checkDoorStatus(device);
    });
  }

  function checkDoorStatus(device) {
    // eventuale interrogazione reale dello stato (non implementata)
    updateDoorStatus(device, "success", "Porta disponibile");
  }

  function updateDoorStatus(device, status, message) {
    const indicator = qs(device.status_id);
    const text = qs(device.status_text_id);
    if (indicator) indicator.className = "status-indicator";
    if (text) text.textContent = `Stato: ${message}`;
    if (indicator) {
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
  }

  function showBulkOperationResult(title, results) {
    const ok = results.filter((r) => r.status === "success").length;
    const ko = results.filter((r) => r.status === "error").length;
    alertOnce(
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
      const logs = JSON.parse(localStorage.getItem("doorActionLogs") || "[]");
      logs.unshift(entry);
      if (logs.length > 100) logs.splice(100);
      localStorage.setItem("doorActionLogs", JSON.stringify(logs));
    } catch (e) {
      console.error("Errore salvataggio log:", e);
    }
  }

  // =============================================
  // SESSIONE LOCALE (reset)
  // =============================================
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
        if (k && !important.some((p) => k.startsWith(p))) toRemove.push(k);
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
      for (const c of cookies) {
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
    if (!el) return;
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
    if (!el) return;
    el.innerHTML = `
      <div class="error-message">
        <i class="fas fa-exclamation-circle"></i>
        Errore nel ripristino: ${error.message}
      </div>
    `;
  }

  // =============================================
  // BINDING EVENTI DOPO DOMContentLoaded
  // =============================================
  document.addEventListener("DOMContentLoaded", () => {
    // Avvio UI corretta
    if (isAdminSessionValid()) {
      showAdminInterface();
    } else {
      showLoginModal();
    }

    // Focus campo password se presente
    const pw = qs("adminPassword");
    if (pw) pw.focus();

    // Listener login + invio
    on("btnLogin", "click", handleLogin);
    const pwInput = qs("adminPassword");
    if (pwInput)
      pwInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") handleLogin();
      });

    // Logout opzionale
    const logoutBtn = qs("btnLogout");
    if (logoutBtn)
      logoutBtn.addEventListener("click", () => {
        clearAdminSession();
        showLoginModal();
      });

    // Impostazioni codice segreto
    on("btnCodeUpdate", "click", updateSecretCode);

    // Impostazioni di sistema
    on("btnSettingsUpdate", "click", updateSystemSettings);

    // Orario check‑in
    on("btnUpdateCheckinTime", "click", updateCheckinTime);
    on("btnToggleCheckinTime", "click", toggleCheckinTime);

    // Porte extra visibilità
    on("btnExtraDoorsVisibility", "click", updateExtraDoorsVisibilitySettings);

    // Link sicuri
    on("btnGenerateSecureLink", "click", generateSecureLink);
    on("btnCopySecureLink", "click", copyGeneratedLink);

    // Reset locale
    on("btnResetLocalSession", "click", () => {
      if (confirm("Ripristinare la sessione locale?")) resetLocalSession();
    });

    // Reset globale (se presente in UI)
    const resetSessionsBtn = qs("btnResetSessions");
    if (resetSessionsBtn) {
      resetSessionsBtn.addEventListener("click", async () => {
        if (!confirm("Sbloccare e riportare al login tutti i client?")) return;
        try {
          await database.ref("settings").update({
            session_reset_version: firebase.database.ServerValue.increment(1),
            global_unblock_message:
              "Sessioni ripristinate dall’amministratore 'refresh the page'",
          });
          alertOnce("Tutte le sessioni sono state ripristinate.");
        } catch (e) {
          console.error(e);
          alertOnce("Errore nel ripristino delle sessioni.");
        }
      });
    }

    // Aggiornamenti periodici
    updateActiveLinksList();
    updateLinkStatistics();
    setInterval(updateActiveLinksList, 60_000);
    setInterval(updateLinkStatistics, 5_000);
  });

  // =============================================
  // ESPORTA FUNZIONI GLOBALI (per compatibilità con onclick)
  // =============================================
  Object.assign(window, {
    // Utilità
    qs,
    sha256,
    // Sessione/admin
    isAdminSessionValid,
    establishAdminSession,
    clearAdminSession,
    showAdminInterface,
    showLoginModal,
    handleLogin,
    // Settings
    saveSettingToFirebase,
    loadSettingsFromFirebase,
    loadSettings,
    applySettingsFromFirebase,
    applySettingsFromLocalStorage,
    updateSecretCode,
    updateSystemSettings,
    // Check‑in time
    loadCheckinTimeSettings,
    updateCheckinTime,
    isValidTimeRange,
    toggleCheckinTime,
    // Porte extra
    loadExtraDoorsVisibility,
    updateExtraDoorsVisibilitySettings,
    // Link sicuri
    generateUniqueId,
    generateSecureLink,
    saveSecureLink,
    copyGeneratedLink,
    updateActiveLinksList,
    renderActiveLinks,
    createLinkElement,
    copySecureLink,
    revokeSecureLink,
    updateLinkStatistics,
    updateStatisticsUI,
    // Porte Shelly
    initDoorControls,
    updateExtraDoorsVisibility,
    openDoor,
    handleDoorSuccess,
    handleDoorError,
    resetDoorButton,
    openAllDoors,
    checkAllDoorsStatus,
    checkDoorStatus,
    updateDoorStatus,
    showBulkOperationResult,
    logDoorAction,
    // Sessione locale
    resetLocalSession,
    clearSessionCookies,
    showResetResult,
    showResetError,
  });
})();
