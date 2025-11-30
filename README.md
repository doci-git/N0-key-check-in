# Check-in

musart-check-in2.netlify.app

Frontend now calls a Netlify Function so Shelly auth keys are kept in environment variables instead of the browser bundle.

## Netlify environment variables
- `DEVICE1_KEY`, `DEVICE2_KEY`, `DEVICE3_KEY`, `DEVICE4_KEY`: Shelly auth keys for each device.
- `SHELLY_API_URL` (optional): Override Shelly API endpoint if needed.

## Frontend config
`admin.js` and `app.js` post to `/.netlify/functions/shelly-control` by default. To point elsewhere, expose `window.RUNTIME_CONFIG.SHELLY_FUNCTION_URL` before loading the scripts, for example:
```html
<script>
  window.RUNTIME_CONFIG = { SHELLY_FUNCTION_URL: "/.netlify/functions/shelly-control" };
</script>
```

## Firebase config
Frontend no longer hardcodes Firebase keys. Provide them at runtime via `window.RUNTIME_CONFIG.FIREBASE_CONFIG`.

### Runtime config file
- Copy `frontend/runtime-config.example.js` to `frontend/runtime-config.js` (keep `runtime-config.js` out of git).
- Fill in your Firebase keys and, if needed, `SHELLY_FUNCTION_URL`.
- Ensure `runtime-config.js` is served before `app.js`/`admin.js` (already referenced in `frontend/index.html` and `frontend/admin.html`).

Example:
```html
<script src="runtime-config.js"></script>
```
Keep this snippet out of version control and inject values via your hosting platform (e.g., Netlify HTML rewrite or server-side templating).

## Deploying to Netlify
1) Set environment variables in Netlify: `DEVICE1_KEY`, `DEVICE2_KEY`, `DEVICE3_KEY`, `DEVICE4_KEY` (and optional `SHELLY_API_URL`).
2) Set Firebase env vars in Netlify: `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_DATABASE_URL`, `FIREBASE_PROJECT_ID`, `FIREBASE_STORAGE_BUCKET`, `FIREBASE_MESSAGING_SENDER_ID`, `FIREBASE_APP_ID`, optional `FIREBASE_MEASUREMENT_ID`, and optional `SHELLY_FUNCTION_URL`.
3) Deploy with the provided `netlify.toml` (functions path is `netlify/functions`, publish is `frontend`). The build command runs `npm run build`, which generates `frontend/runtime-config.js` from those env vars so the HTML can load it.

Local dev: copy `frontend/runtime-config.example.js` to `frontend/runtime-config.js` and fill with your values. Do not commit `runtime-config.js`.
