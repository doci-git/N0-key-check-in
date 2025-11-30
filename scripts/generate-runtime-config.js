const fs = require("fs");
const path = require("path");

const {
  FIREBASE_API_KEY,
  FIREBASE_AUTH_DOMAIN,
  FIREBASE_DATABASE_URL,
  FIREBASE_PROJECT_ID,
  FIREBASE_STORAGE_BUCKET,
  FIREBASE_MESSAGING_SENDER_ID,
  FIREBASE_APP_ID,
  FIREBASE_MEASUREMENT_ID,
  SHELLY_FUNCTION_URL,
} = process.env;

const missing = [
  ["FIREBASE_API_KEY", FIREBASE_API_KEY],
  ["FIREBASE_AUTH_DOMAIN", FIREBASE_AUTH_DOMAIN],
  ["FIREBASE_DATABASE_URL", FIREBASE_DATABASE_URL],
  ["FIREBASE_PROJECT_ID", FIREBASE_PROJECT_ID],
  ["FIREBASE_STORAGE_BUCKET", FIREBASE_STORAGE_BUCKET],
  ["FIREBASE_MESSAGING_SENDER_ID", FIREBASE_MESSAGING_SENDER_ID],
  ["FIREBASE_APP_ID", FIREBASE_APP_ID],
]
  .filter(([, v]) => !v)
  .map(([k]) => k);

if (missing.length) {
  throw new Error(
    `Missing required Firebase env vars: ${missing.join(
      ", "
    )}. Set them in Netlify site settings.`
  );
}

const runtimeConfig = {
  FIREBASE_CONFIG: {
    apiKey: "AIzaSyCuaY2HQzUneKpHBXX-p1GaEjdI2tdgjso",
    authDomain: "planning-with-ai-dbf8d.firebaseapp.com",
    projectId: "planning-with-ai-dbf8d",
    storageBucket: "planning-with-ai-dbf8d.firebasestorage.app",
    messagingSenderId: "314211443397",
    appId: "1:314211443397:web:76fcd26e997719fe9386ac",
    databaseURL:
      "https://planning-with-ai-dbf8d.europe-west1.firebasedatabase.app/",
    ...(FIREBASE_MEASUREMENT_ID
      ? { measurementId: FIREBASE_MEASUREMENT_ID }
      : {}),
  },
  ...(SHELLY_FUNCTION_URL
    ? { SHELLY_FUNCTION_URL }
    : { SHELLY_FUNCTION_URL: "/.netlify/functions/shelly-control" }),
};

const output = `window.RUNTIME_CONFIG = ${JSON.stringify(
  runtimeConfig,
  null,
  2
)};\n`;

const outPath = path.join(__dirname, "..", "runtime-config.js");
fs.writeFileSync(outPath, output, "utf8");
console.log(`runtime-config.js written to ${outPath}`);
