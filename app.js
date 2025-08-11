const DEVICE_ID = "e4b063f0c38c";
const AUTH_KEY =
  "MWI2MDc4dWlk4908A71DA809FCEC05C5D1F360943FBFC6A7934EC0FD9E3CFEAF03F8F5A6A4A0C60665B97A1AA2E2";
const BASE_URL_SET =
  "https://shelly-73-eu.shelly.cloud/v2/devices/api/set/switch";

let clickCount = 0;
const MAX_CLICKS = 3;

function log(msg) {
  document.getElementById("log").textContent = msg;
}

async function accendiShelly() {
  if (clickCount >= MAX_CLICKS) {
    alert(
      `Hai raggiunto il limite massimo di ${MAX_CLICKS} utilizzi del pulsante.`
    );
    return;
  }

  clickCount++;
  const clicksLeft = MAX_CLICKS - clickCount;

  if (clicksLeft > 0) {
    alert(`You have ${clicksLeft} clicks left.`);
  } else {
    alert(
      `Hai raggiunto il limite massimo di ${MAX_CLICKS} utilizzi. Il pulsante sarà disabilitato.`
    );
    document.getElementById("btnAccendi").disabled = true;
  }

  try {
    const response = await fetch(BASE_URL_SET, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: DEVICE_ID,
        auth_key: AUTH_KEY,
        channel: 0,
        on: true,
      }),
    });

    if (!response.ok) {
      log(`Errore HTTP: ${response.status}`);
      return;
    }

    const text = await response.text();

    if (!text) {
      log("DOOR OPEN");
      return;
    }

    const data = JSON.parse(text);

    if (data.error) {
      log(`Errore API: ${JSON.stringify(data.error)}`);
    } else {
      log("Shelly acceso con successo!");
    }
  } catch (err) {
    log(`Errore fetch: ${err.message}`);
  }
}

document.getElementById("btnAccendi").onclick = accendiShelly;
