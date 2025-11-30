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
- Copy `runtime-config.example.js` to `runtime-config.js` (keep `runtime-config.js` out of git).
- Fill in your Firebase keys and, if needed, `SHELLY_FUNCTION_URL`.
- Ensure `runtime-config.js` is served before `app.js`/`admin.js` (already referenced in `index.html` and `admin.html`).

Example:
```html
<script src="runtime-config.js"></script>
```
Keep this snippet out of version control and inject values via your hosting platform (e.g., Netlify HTML rewrite or server-side templating).
