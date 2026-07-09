# Ambitt Agents — Chrome extension

The on-device execution surface. It lets a client's agent do work inside the
client's **own logged-in browser** (their real session, their residential IP,
no stored passwords), with the client approving every run. One extension serves
every client and every agent; it personalizes to the agent after pairing.

## How it fits together

```
Portal (mints pairing code)  →  extension pairs  →  device token stored
Platform enqueues a LocalTask  →  extension polls  →  client clicks Allow
   →  extension drives the client's tab  →  posts the result back to the platform
```

- `manifest.json` — MV3. Host permission for the Oracle API only; the tool
  sites (CoStar, Crexi) are **optional** permissions requested per-run on the
  client's Allow click, so Chrome itself enforces the "these sites only" scope.
- `background.js` — polls (via `chrome.alarms`), stashes the task, and on Allow
  drives the tab. Phase 1 executor is capture-only (opens the tool in the real
  session and reports what it sees). Phase 2 swaps in the platform-driven action
  loop.
- `popup.js` / `popup.html` — pairing screen, "connected" status, and the
  per-run allow prompt. Owns the user gesture for the permission request.

## Load it (dev)

1. Go to `chrome://extensions`, turn on **Developer mode** (top right).
2. Click **Load unpacked** and select this `extension/` folder.
3. Pin the puzzle-piece icon so the popup is one click away. (Branded icons come
   before we publish unlisted.)

## Pair it

1. Get a pairing code (until the portal "Connect your browser" button ships,
   mint one from Oracle):

   ```
   curl -s -X POST https://oracle-production-c0ff.up.railway.app/agents/<AGENT_ID>/extension/pairing-code
   ```

   Returns `{ "code": "ABCD1234", ... }`. Codes are single-use and expire in
   10 minutes.
2. Open the extension popup, paste the code, click **Connect**. You should see
   "<agent> is connected."

## Test a run

The platform enqueues a task (Phase 2 wires this to the agent's `browse` tool;
for now enqueue one with `scripts/enqueue-local-task.ts`). Within ~30s the
extension badges **1**. Open the popup → **Allow**. The extension opens the
task's `startingUrl` in your logged-in session, captures the page, and posts the
result back (visible on the `LocalTask` row and in the popup's "Last run").

## Not built yet

- Phase 2: the platform-driven action loop (the real automation) + routing the
  agent's `browse` tool to this queue.
- Portal "Connect your browser" button (replaces the curl above).
- Branded icons + notifications + unlisted Web Store listing.
