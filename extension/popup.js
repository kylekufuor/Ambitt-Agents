// Popup logic. Owns the user gesture, so per-run host-permission requests
// happen here; execution is handed to the background worker.

const $ = (id) => document.getElementById(id);
const views = ["pairView", "idleView", "runningView", "allowView"];
function show(view) {
  for (const v of views) $(v).classList.toggle("hide", v !== view);
}

function deviceLabel() {
  const ua = navigator.userAgent;
  const os = /Mac/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "browser";
  return `Chrome on ${os}`;
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
    $("allowAgent").textContent = `${s.pendingTask.agentName || agentName} would like to work in your browser`;
    $("allowText").textContent = s.pendingTask.allowPromptText || s.pendingTask.goal || "Run a task on your behalf.";
    show("allowView");
    return;
  }
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
  const { pendingTask } = await chrome.storage.local.get("pendingTask");
  if (!pendingTask) return render();
  $("allowErr").classList.add("hide");
  try {
    // Ask Chrome for access to the tool sites, scoped and enforced by the
    // browser. This must run inside the click (a user gesture).
    const granted = await chrome.permissions.request({ origins: TOOL_ORIGINS });
    if (!granted) throw new Error("Access is needed to run this. You can allow it and try again.");
    await chrome.runtime.sendMessage({ type: "allow", task: pendingTask });
    await render();
  } catch (e) {
    $("allowErr").textContent = String(e.message || e);
    $("allowErr").classList.remove("hide");
  }
});

$("denyBtn").addEventListener("click", async () => {
  const { pendingTask } = await chrome.storage.local.get("pendingTask");
  if (pendingTask) await chrome.runtime.sendMessage({ type: "deny", task: pendingTask });
  await render();
});

$("unpairBtn").addEventListener("click", async () => {
  await chrome.storage.local.clear();
  await render();
});

// Refresh state when the popup opens, and nudge a poll so a waiting task shows.
chrome.runtime.sendMessage({ type: "poll-now" }, () => render());
render();
