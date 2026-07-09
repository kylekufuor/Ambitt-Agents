// Shared config for the background service worker and the popup.
// Loaded via importScripts() in background.js and <script src> in popup.html.
const ORACLE_URL = "https://oracle-production-c0ff.up.railway.app";
const POLL_ALARM = "ambitt-poll";
// Host patterns we request (per-run, on the user's Allow click) so the agent
// can operate these tools. Kept minimal on purpose — Chrome enforces the scope.
const TOOL_ORIGINS = [
  "https://*.costar.com/*",
  "https://*.costargroup.com/*",
  "https://*.crexi.com/*",
];
