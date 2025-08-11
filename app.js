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
    id: "3494547ab161",
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

const CORRECT_CODE = "1234"; // Password unica

function log(msg, logElementId) {
  document.getElementById(logElementId).textContent = msg;
}

function aggiornaStatoPulsante(clicksLeft, buttonId) {
  const btn = document.getElementById(buttonId);
  if (clicksLeft <= 0) {
    btn.disabled = true;
    alert(
      `You have used the maximum number of button clicks! contacts us by cell or message...`
    );
  } else {
    btn.disabled = false;
  }
}

function getClicksLeft(storageKey) {
  const stored = localStorage.getItem(storageKey);
  return stored === null ? MAX_CLICKS : parseInt(stored, 10);
}

function setClicksLeft(storageKey, count) {
  localStorage.setItem(storageKey, count);
}

async function accendiShelly(device) {
  let clicksLeft = getClicksLeft(device.storage_key);

  if (clicksLeft <= 0) {
    alert(
      `You have used the maximum number of button clicks! contacts us by cell or message...`
    );
    aggiornaStatoPulsante(clicksLeft, device.button_id);
    return;
  }

  clicksLeft--;
  setClicksLeft(device.storage_key, clicksLeft);
  aggiornaStatoPulsante(clicksLeft, device.button_id);

  alert(`${device.button_id}:You have ${clicksLeft} more clicks.`);

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
      log(
        "door open",
        device.log_id
      );
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

function abilitaPulsanti() {
  DEVICES.forEach((device) => {
    aggiornaStatoPulsante(getClicksLeft(device.storage_key), device.button_id);
    document.getElementById(device.button_id).onclick = () =>
      accendiShelly(device);
  });
}

document.getElementById("btnCheckCode").onclick = () => {
  const insertedCode = document.getElementById("authCode").value.trim();
  if (insertedCode === CORRECT_CODE) {
    alert("Codice corretto! Accesso consentito.");
    document.getElementById("controlPanel").style.display = "block";
    abilitaPulsanti();
    document.getElementById("authCode").disabled = true;
    document.getElementById("btnCheckCode").disabled = true;
  } else {
    alert("Codice errato, riprova.");
  }
};
