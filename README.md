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
