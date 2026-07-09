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
  const { runningTask } = await chrome.storage.local.get(["runningTask"]);
  if (runningTask) return; // busy driving a task — don't grab new work
  // Always ask the server; it's the source of truth. The poll re-surfaces a
  // task we already claimed or claims the next pending one. Reconcile local
  // state so a stale pendingTask (from a cancelled task) can't poison the queue.
  const { ok, body } = await api("/extension/poll");
  if (!ok) return;
  if (body && body.task) {
    await chrome.storage.local.set({ pendingTask: body.task });
    await setBadge(true);
  } else {
    await chrome.storage.local.remove("pendingTask");
    await setBadge(false);
  }
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

// --- chrome.debugger (CDP) driver ---
function dbg(target, method, params) {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand(target, method, params || {}, (result) => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message));
      else resolve(result);
    });
  });
}

// Read a PNG's pixel dimensions from its IHDR (width/height sit at bytes 16-23,
// big-endian) so we can map the model's image-space coords to CSS pixels.
function pngSize(b64) {
  try {
    const bin = atob(b64.slice(0, 64));
    const at = (i) => bin.charCodeAt(i);
    const w = (at(16) << 24) | (at(17) << 16) | (at(18) << 8) | at(19);
    const h = (at(20) << 24) | (at(21) << 16) | (at(22) << 8) | at(23);
    return { w: w || 1280, h: h || 800 };
  } catch {
    return { w: 1280, h: 800 };
  }
}

const KEY_MAP = {
  Enter: { key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 },
  Tab: { key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 },
  Escape: { key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 },
  Backspace: { key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 },
};
async function pressKey(target, name) {
  const k = KEY_MAP[name] || { key: name, code: name, windowsVirtualKeyCode: 0 };
  await dbg(target, "Input.dispatchKeyEvent", { type: "keyDown", ...k });
  await dbg(target, "Input.dispatchKeyEvent", { type: "keyUp", ...k });
}

const MAX_STEPS = 32;

// PHASE 2 executor — drive the client's own tab under the platform's step-by-
// step direction. Each step: screenshot up to the brain, next action back,
// execute it via CDP. The brain stays on the platform.
async function runTask(task) {
  await chrome.storage.local.set({ runningTask: task });
  await chrome.storage.local.remove("pendingTask");
  await setBadge(false);

  const startUrl = task.startingUrl || "about:blank";
  // Open at about:blank first: a fresh tab created straight at an http URL can
  // momentarily resolve to another extension's new-tab page, and chrome.debugger
  // refuses to attach to a different extension's chrome-extension:// URL. Blank
  // is un-hijackable; we then drive to the real URL through CDP.
  const tab = await chrome.tabs.create({ url: "about:blank", active: true });
  const target = { tabId: tab.id };
  let attached = false;
  let outcome = { ok: false, text: "No result." };
  const history = [];
  let lastUrl = startUrl;
  let lastStep = 0;

  try {
    await api(`/extension/tasks/${task.id}/allow`, { method: "POST", body: JSON.stringify({ allowed: true }) });
    await chrome.debugger.attach(target, "1.3");
    attached = true;
    history.push({ action: "attached debugger" });
    await dbg(target, "Page.enable");
    history.push({ action: "Page.enable" });
    if (startUrl && startUrl !== "about:blank") {
      await dbg(target, "Page.navigate", { url: startUrl });
      history.push({ action: `Page.navigate ${startUrl}` });
    }
    await sleep(2800); // initial page load

    for (let step = 0; step < MAX_STEPS; step++) {
      await sleep(1300); // let the page settle after the last action

      // Screenshot via Chrome's own captureVisibleTab (needs the <all_urls>
      // grant), NOT the debugger — the debugger's Page.captureScreenshot throws
      // "chrome-extension:// URL of different extension" on browsers loaded with
      // page-injecting extensions. captureVisibleTab has no such issue. Our tab
      // must be the active one for it to grab the right page. Metrics via
      // scripting; the debugger is used only for the input actions below.
      await chrome.tabs.update(tab.id, { active: true });
      let shotData = "", cssW = 1280, cssH = 800, url = startUrl;
      try {
        const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
        shotData = (dataUrl || "").split(",")[1] || "";
      } catch (capErr) {
        history.push({ action: "capture", note: "ERROR: " + String(capErr && capErr.message ? capErr.message : capErr).slice(0, 130) });
      }
      try {
        const [mi] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => ({ w: innerWidth, h: innerHeight, u: location.href }) });
        if (mi && mi.result) { cssW = mi.result.w; cssH = mi.result.h; url = mi.result.u; }
      } catch (_) {}
      lastUrl = url;
      lastStep = step;
      if (!shotData) throw new Error("Could not capture the page.");
      const { w: imgW, h: imgH } = pngSize(shotData);

      const { ok, body } = await api(`/extension/tasks/${task.id}/step`, {
        method: "POST",
        body: JSON.stringify({ screenshotBase64: shotData, imgW, imgH, url, history, stepIndex: step }),
      });
      if (!ok || !body || !body.action) throw new Error("Brain did not return an action.");
      const a = body.action;
      const toCssX = (x) => Math.round((x || 0) * cssW / imgW);
      const toCssY = (y) => Math.round((y || 0) * cssH / imgH);

      if (a.action === "done") { outcome = { ok: true, text: a.result || "Done." }; break; }
      if (a.action === "fail") { outcome = { ok: false, text: a.reason || "The agent could not finish." }; break; }

      // A single action erroring (e.g. a CDP quirk from another extension's
      // injected frame) is recorded and the loop continues — the brain sees the
      // unchanged page next step and adapts, rather than the whole task dying.
      try {
        if (a.action === "click") {
          const x = toCssX(a.x), y = toCssY(a.y);
          await dbg(target, "Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
          await dbg(target, "Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
          await dbg(target, "Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
          history.push({ action: `click (${a.x},${a.y})`, note: a.reason });
        } else if (a.action === "type") {
          await dbg(target, "Input.insertText", { text: a.text || "" });
          history.push({ action: `type "${String(a.text || "").slice(0, 40)}"` });
        } else if (a.action === "key") {
          await pressKey(target, a.key || "Enter");
          history.push({ action: `key ${a.key || "Enter"}` });
        } else if (a.action === "scroll") {
          await dbg(target, "Runtime.evaluate", { expression: `window.scrollBy(0, ${Number(a.dy) || 600})` });
          history.push({ action: `scroll ${Number(a.dy) || 600}` });
        } else if (a.action === "navigate" && a.url) {
          await dbg(target, "Page.navigate", { url: a.url });
          await waitForTabComplete(tab.id);
          history.push({ action: `navigate ${a.url}` });
        } else {
          history.push({ action: `unknown (${a.action})` });
        }
      } catch (actErr) {
        history.push({ action: a.action, note: "ERROR: " + String(actErr && actErr.message ? actErr.message : actErr).slice(0, 140) });
      }
    }
  } catch (e) {
    const msg = String(e && e.message ? e.message : e);
    outcome = { ok: false, text: `Failed at step ${lastStep} on ${lastUrl}: ${msg}`.slice(0, 400) };
  } finally {
    if (attached) { try { await chrome.debugger.detach(target); } catch (_) {} }
    await api(`/extension/tasks/${task.id}/result`, {
      method: "POST",
      body: JSON.stringify(
        outcome.ok
          ? { status: "succeeded", result: outcome.text, transcript: history }
          : { status: "failed", error: outcome.text, transcript: history }
      ),
    });
    await chrome.storage.local.set({ lastResult: { at: Date.now(), ok: outcome.ok, summary: outcome.text.slice(0, 400) } });
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
