// Popup logic. Owns the user gesture, so per-run host-permission requests
// happen here; execution is handed to the background worker.

const $ = (id) => document.getElementById(id);
const views = ["pairView", "idleView", "runningView", "allowView"];
function show(view) {
  for (const v of views) $(v).classList.toggle("hide", v !== view);
}

// Cached so the Allow click can call chrome.permissions.request() FIRST, with
// no await before it — Chrome requires that call to happen synchronously inside
// the user gesture, and any await ahead of it silently voids the gesture.
let currentTask = null;

function deviceLabel() {
  const ua = navigator.userAgent;
  const os = /Mac/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "browser";
  return `Chrome on ${os}`;
}

// Server call carrying the stored device token — the popup records the client's
// allow/deny decision straight on the server, so it can't get lost.
async function deviceApi(path, opts = {}) {
  const { deviceToken } = await chrome.storage.local.get("deviceToken");
  return fetch(`${ORACLE_URL}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", "X-Device-Token": deviceToken || "", ...(opts.headers || {}) },
  });
}

// The exact site(s) this task needs, so Chrome grants only those. Includes the
// starting site plus its known redirect targets (CoStar's product.costar.com
// hands off to secure.costargroup.com, so we need both to read the page).
function neededOrigins(url) {
  try {
    const u = new URL(url);
    const set = new Set([`${u.protocol}//${u.hostname}/*`]);
    if (/costar/i.test(u.hostname)) {
      set.add("https://*.costar.com/*");
      set.add("https://*.costargroup.com/*");
    }
    if (/crexi/i.test(u.hostname)) set.add("https://*.crexi.com/*");
    return [...set];
  } catch {
    return ["https://*/*"];
  }
}

async function render() {
  const s = await chrome.storage.local.get(["deviceToken", "agents", "businessName", "pendingTask", "runningTask", "lastResult"]);
  const agentName = s.agents && s.agents[0] ? s.agents[0].name : "Your agent";

  if (!s.deviceToken) {
    $("dot").classList.remove("on");
    show("pairView");
    return;
  }

  $("dot").classList.add("on");
  $("topName").textContent = agentName;
  $("topSub").textContent = s.businessName || "Connected";
  $("agentPill").textContent = agentName;

  if (s.pendingTask) {
    currentTask = s.pendingTask;
    $("allowAgent").textContent = `${s.pendingTask.agentName || agentName} would like to work in your browser`;
    $("allowText").textContent = s.pendingTask.allowPromptText || s.pendingTask.goal || "Run a task on your behalf.";
    show("allowView");
    return;
  }
  currentTask = null;
  if (s.runningTask) {
    $("runTitle").textContent = `${s.runningTask.agentName || agentName} is working…`;
    show("runningView");
    return;
  }

  if (s.lastResult) {
    $("lastCard").classList.remove("hide");
    $("lastText").textContent = (s.lastResult.ok ? "Done. " : "Hit a snag. ") + (s.lastResult.summary || "");
  }
  show("idleView");
}

// --- Pairing ---
$("code").addEventListener("input", (e) => {
  e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  $("connectBtn").disabled = e.target.value.length !== 8;
});

$("connectBtn").addEventListener("click", async () => {
  const code = $("code").value.trim();
  $("connectBtn").disabled = true;
  $("connectBtn").textContent = "Connecting…";
  $("pairErr").classList.add("hide");
  try {
    const res = await fetch(`${ORACLE_URL}/extension/pair`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, label: deviceLabel(), platform: "chrome-extension" }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.deviceToken) throw new Error(body.error || "That code didn't work. Get a fresh one from your portal.");
    await chrome.storage.local.set({ deviceToken: body.deviceToken, agents: body.agents || [], businessName: body.businessName || "" });
    chrome.runtime.sendMessage({ type: "poll-now" });
    await render();
  } catch (e) {
    $("pairErr").textContent = String(e.message || e);
    $("pairErr").classList.remove("hide");
    $("connectBtn").disabled = false;
    $("connectBtn").textContent = "Connect";
  }
});

// --- Allow / Deny ---
$("allowBtn").addEventListener("click", async () => {
  const task = currentTask;
  if (!task) return render();
  $("allowErr").classList.add("hide");
  // Record approval on the server (source of truth). The background worker's
  // next poll sees the task is approved and runs it — no fragile message.
  try {
    const res = await deviceApi(`/extension/tasks/${task.id}/allow`, { method: "POST", body: JSON.stringify({ allowed: true }) });
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      throw new Error(b.error || "Could not start this run. Try again.");
    }
  } catch (e) {
    $("allowErr").textContent = String(e.message || e);
    $("allowErr").classList.remove("hide");
    return;
  }
  currentTask = null;
  await chrome.storage.local.remove("pendingTask");
  chrome.runtime.sendMessage({ type: "poll-now" }); // nudge the worker to run it now
  await render();
});

$("denyBtn").addEventListener("click", async () => {
  const task = currentTask;
  if (task) {
    try { await deviceApi(`/extension/tasks/${task.id}/allow`, { method: "POST", body: JSON.stringify({ allowed: false }) }); } catch (_) {}
  }
  currentTask = null;
  await chrome.storage.local.remove("pendingTask");
  await render();
});

$("unpairBtn").addEventListener("click", async () => {
  await chrome.storage.local.clear();
  await render();
});

// Refresh state when the popup opens, and nudge a poll so a waiting task shows.
chrome.runtime.sendMessage({ type: "poll-now" }, () => render());
render();
