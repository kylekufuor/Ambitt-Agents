importScripts("config.js");

// ---------------------------------------------------------------------------
// Ambitt Agents — background service worker
// ---------------------------------------------------------------------------
// Polls the platform for the next LocalTask, stashes it for the popup to show
// the client an allow prompt, and (on Allow) drives the client's OWN logged-in
// browser tab to do the work, then posts the result back. MV3 workers are
// ephemeral, so the poll runs off chrome.alarms, and all state lives in
// chrome.storage.local.
//
// Phase 1 executor is capture-only: it opens the tool in the user's real
// session and reports what it sees, proving the whole pipe end to end. Phase 2
// replaces runTask()'s body with the step loop (send page state to the
// platform, execute the action it returns, repeat).
// ---------------------------------------------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getToken() {
  return (await chrome.storage.local.get("deviceToken")).deviceToken || null;
}

async function api(path, opts = {}) {
  const token = await getToken();
  const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
  if (token) headers["X-Device-Token"] = token;
  const res = await fetch(ORACLE_URL + path, { ...opts, headers });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

function ensurePolling() {
  chrome.alarms.create(POLL_ALARM, { periodInMinutes: 0.5 });
}
chrome.runtime.onInstalled.addListener(ensurePolling);
chrome.runtime.onStartup.addListener(ensurePolling);
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === POLL_ALARM) poll();
});

async function setBadge(on) {
  await chrome.action.setBadgeText({ text: on ? "1" : "" });
  if (on) await chrome.action.setBadgeBackgroundColor({ color: "#00b3b3" });
}

// Grab the next task (unless one is already awaiting the client's decision or
// running), and stash it for the popup.
async function poll() {
  if (!(await getToken())) return;
  const { pendingTask, runningTask } = await chrome.storage.local.get(["pendingTask", "runningTask"]);
  if (pendingTask || runningTask) return;
  const { ok, body } = await api("/extension/poll");
  if (!ok || !body || !body.task) return;
  await chrome.storage.local.set({ pendingTask: body.task });
  await setBadge(true);
}

function waitForTabComplete(tabId, timeoutMs = 45000) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    };
    const listener = (id, info) => {
      if (id === tabId && info.status === "complete") finish();
    };
    chrome.tabs.onUpdated.addListener(listener);
    setTimeout(finish, timeoutMs);
  });
}

// PHASE 1 executor — open the tool in the user's real (logged-in) session and
// report what's visible. This proves pairing → queue → allow → drive → result
// without the brain. Phase 2 replaces the capture with the platform-driven
// action loop.
async function runTask(task) {
  await chrome.storage.local.set({ runningTask: task });
  await chrome.storage.local.remove("pendingTask");
  await setBadge(false);
  try {
    await api(`/extension/tasks/${task.id}/allow`, {
      method: "POST",
      body: JSON.stringify({ allowed: true }),
    });

    const url = task.startingUrl || "https://product.costar.com";
    const tab = await chrome.tabs.create({ url, active: true });
    await waitForTabComplete(tab.id);
    await sleep(2500); // let client-rendered content settle

    let captured = { title: "", url, text: "" };
    try {
      const [inj] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => ({
          title: document.title,
          url: location.href,
          text: (document.body && document.body.innerText ? document.body.innerText : "").slice(0, 6000),
        }),
      });
      if (inj && inj.result) captured = inj.result;
    } catch (e) {
      captured.text = "(could not read the page: " + String(e).slice(0, 120) + ")";
    }

    const summary =
      `Opened ${captured.url} (title: "${captured.title}"). ` +
      `Captured ${captured.text.length} chars of visible text.\n\n` +
      captured.text.slice(0, 2000);

    await api(`/extension/tasks/${task.id}/result`, {
      method: "POST",
      body: JSON.stringify({ status: "succeeded", result: summary }),
    });
    await chrome.storage.local.set({ lastResult: { at: Date.now(), ok: true, summary: summary.slice(0, 400) } });
  } catch (e) {
    await api(`/extension/tasks/${task.id}/result`, {
      method: "POST",
      body: JSON.stringify({ status: "failed", error: String(e).slice(0, 300) }),
    });
    await chrome.storage.local.set({ lastResult: { at: Date.now(), ok: false, summary: String(e).slice(0, 200) } });
  } finally {
    await chrome.storage.local.remove("runningTask");
  }
}

async function denyTask(task) {
  try {
    await api(`/extension/tasks/${task.id}/allow`, {
      method: "POST",
      body: JSON.stringify({ allowed: false }),
    });
  } finally {
    await chrome.storage.local.remove("pendingTask");
    await setBadge(false);
  }
}

// Messages from the popup. The popup owns the user gesture (needed for the
// per-run host-permission request), then hands execution to the worker.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (msg.type === "poll-now") {
      await poll();
      sendResponse({ ok: true });
    } else if (msg.type === "allow" && msg.task) {
      runTask(msg.task); // fire and forget; popup can close
      sendResponse({ ok: true });
    } else if (msg.type === "deny" && msg.task) {
      await denyTask(msg.task);
      sendResponse({ ok: true });
    } else {
      sendResponse({ ok: false });
    }
  })();
  return true; // async response
});
