const DEVICES = [
  {
    id: "e4b063f0c38c",
    auth_key:
      "MWI2MDc4dWlk4908A71DA809FCEC05C5D1F360943FBFC6A7934EC0FD9E3CFEAF03F8F5A6A4A0C60665B97A1AA2E2",
    storage_key: "shelly_clicks_left_1",
    button_id: "MainDoor",
    log_id: "log1",
  },
  {
    id: "34945478d595",
    auth_key:
      "MWI2MDc4dWlk4908A71DA809FCEC05C5D1F360943FBFC6A7934EC0FD9E3CFEAF03F8F5A6A4A0C60665B97A1AA2E2",
    storage_key: "shelly_clicks_left_2",
    button_id: "AptDoor",
    log_id: "log2",
  },
];

const MAX_CLICKS = 3;
const BASE_URL_SET =
  "https://shelly-73-eu.shelly.cloud/v2/devices/api/set/switch";
const CORRECT_CODE = "2245"; // Password unica
const TIME_LIMIT_HOURS = 28;

// Log
function log(msg, logElementId) {
  document.getElementById(logElementId).textContent = msg;
}
//RIGT CLICK
document.addEventListener('contextmenu',function (e) {
  e.preventDefault()
},false);

// Gestione popup
function showDevicePopup(device, clicksLeft) {
  const popup = document.getElementById(`popup-${device.button_id}`);
  document.getElementById(`popup-title-${device.button_id}`).innerText =
    device.button_id;
  if (clicksLeft > 0) {
    document.getElementById(
      `popup-text-${device.button_id}`
    ).innerText = `You have ${clicksLeft} clicks remaining.`;
  } else {
    document.getElementById(
      `popup-text-${device.button_id}`
    ).innerText = `No clicks remaining. Please contact us.`;
  }
  popup.style.display = "block";
}

function closePopup(buttonId) {
  document.getElementById(`popup-${buttonId}`).style.display = "none";
}

// Click storage
function getClicksLeft(storageKey) {
  const stored = localStorage.getItem(storageKey);
  return stored === null ? MAX_CLICKS : parseInt(stored, 10);
}

function setClicksLeft(storageKey, count) {
  localStorage.setItem(storageKey, count);
}

// Pulsanti
function aggiornaStatoPulsante(device) {
  const btn = document.getElementById(device.button_id);
  const clicksLeft = getClicksLeft(device.storage_key);
  btn.disabled = clicksLeft <= 0;
}

// Blocco pagina
function checkTimeLimit() {
  const startTime = parseInt(localStorage.getItem("usage_start_time"));
  if (!startTime) return false;

  const now = Date.now();
  const hoursPassed = (now - startTime) / (1000 * 60 * 60);
  if (hoursPassed >= TIME_LIMIT_HOURS) {
      document.head.innerHTML = "";
      document.body.innerHTML = "";
      document.body.style.backgroundColor = "black";
      document.body.style.color = "white";
      document.body.style.display = "flex";
      document.body.style.justifyContent = "center";
      document.body.style.alignItems = "center";
      document.body.style.height = "100vh";
      document.body.style.fontSize = "22px";
      document.body.style.textAlign = "center";
      document.body.textContent = "⏰ Timeout link expired!.";
      window.stop(); 
    return true;
  }
  return false;
}

// Accensione Shelly
async function accendiShelly(device) {
  if (checkTimeLimit()) return;

  let clicksLeft = getClicksLeft(device.storage_key);

  if (clicksLeft <= 0) {
    showDevicePopup(device, clicksLeft);
    aggiornaStatoPulsante(device);
    return;
  }

  clicksLeft--;
  setClicksLeft(device.storage_key, clicksLeft);
  aggiornaStatoPulsante(device);

  showDevicePopup(device, clicksLeft);

  try {
    const response = await fetch(BASE_URL_SET, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: device.id,
        auth_key: device.auth_key,
        channel: 0,
        on: true,
      }),
    });

    if (!response.ok) {
      log(`Errore HTTP: ${response.status}`, device.log_id);
      return;
    }

    const text = await response.text();
    if (!text) {
      log("door open", device.log_id);
      return;
    }

    const data = JSON.parse(text);
    if (data.error) {
      log(`Errore API: ${JSON.stringify(data.error)}`, device.log_id);
    } else {
      log("acceso con successo!", device.log_id);
    }
  } catch (err) {
    log(`Errore fetch: ${err.message}`, device.log_id);
  }
}

// Abilitazione pulsanti
function abilitaPulsanti() {
  DEVICES.forEach((device) => {
    aggiornaStatoPulsante(device);
    document.getElementById(device.button_id).onclick = () =>
      accendiShelly(device);
  });
}

// Controllo codice
document.getElementById("btnCheckCode").onclick = () => {
  const insertedCode = document.getElementById("authCode").value.trim();
  if (insertedCode === CORRECT_CODE) {
    // Salvo l'orario di accesso quando la password è corretta
    if (!localStorage.getItem("usage_start_time")) {
      localStorage.setItem("usage_start_time", Date.now());
    }

    if (checkTimeLimit()) return;

    document.getElementById("controlPanel").style.display = "block";
    document.getElementById("authCode").style.display = "none";
    document.getElementById("authCodeh3").style.display = "none";
    document.getElementById("btnCheckCode").style.display = "none";
    abilitaPulsanti();
    document.getElementById("authCode").disabled = true;
    document.getElementById("btnCheckCode").disabled = true;
  } else {
    alert("Codice errato!.");
  }
};