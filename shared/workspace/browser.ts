import puppeteer, { type Browser, type Page } from "puppeteer";
import prisma from "../db.js";
import { encrypt, decrypt } from "../encryption.js";
import { publicUrl, safeLocation, WorkspaceError } from "./safety.js";
import { stopRecorderSource } from "./recorder.js";

export async function browserApi<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  if (!process.env.BROWSERBASE_API_KEY)
    throw new WorkspaceError(
      "The browser service is not configured. Your tools and chat are still available.",
      503,
    );
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`https://api.browserbase.com/v1${path}`, {
        method,
        headers: {
          "X-BB-API-Key": process.env.BROWSERBASE_API_KEY,
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(25_000),
      });
      if (!res.ok) {
        if (res.status === 404 && path.startsWith("/sessions/"))
          throw new WorkspaceError(
            "This browser session is no longer available.",
            410,
          );
        if (res.status >= 500 || res.status === 429)
          throw new Error("Retryable browser service failure");
        throw new WorkspaceError(
          "The browser service could not complete that request. Please try again.",
          502,
        );
      }
      return (await res.json()) as T;
    } catch (error) {
      if (error instanceof WorkspaceError) throw error;
      // Creation cannot be replayed blindly after an ambiguous timeout.
      if (
        attempt === 2 ||
        (method === "POST" &&
          !(
            body &&
            typeof body === "object" &&
            "status" in body &&
            body.status === "REQUEST_RELEASE"
          ))
      )
        throw new WorkspaceError(
          "The browser service did not respond. Please try again.",
          502,
        );
      await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
    }
  }
  throw new WorkspaceError("Browser unavailable", 503);
}

type Remote = { browser: Browser; page: Page };
const remotes = new Map<string, Promise<Remote>>();

export async function remotePage(id: string): Promise<Remote> {
  let pending = remotes.get(id);
  if (!pending) {
    pending = (async () => {
      const session = await prisma.workspaceSession.findUniqueOrThrow({
        where: { id },
      });
      if (session.status !== "running" || !session.connectionEncrypted)
        throw new WorkspaceError(
          "This browser session has ended. Open the tool again.",
          409,
        );
      const browser = await puppeteer.connect({
        browserWSEndpoint: decrypt(session.connectionEncrypted),
        defaultViewport: null,
        protocolTimeout: 25_000,
      });
      browser.on("disconnected", () => remotes.delete(id));
      const pages = await browser.pages();
      const page = pages[0] ?? (await browser.newPage());
      // Credentials stay inside the browser. No request/console/body logging.
      await page.setRequestInterception(true);
      page.on("request", (request) => {
        if (request.isInterceptResolutionHandled()) return;
        const value = request.url();
        if (!/^https?:/i.test(value)) {
          void request.continue().catch(() => {});
          return;
        }
        // Validate document navigation, including redirects and child frames.
        if (request.isNavigationRequest()) {
          void publicUrl(value)
            .then(() => request.continue())
            .catch(() => request.abort())
            .catch(() => {});
        } else {
          void request.continue().catch(() => {});
        }
      });
      return { browser, page };
    })();
    remotes.set(id, pending);
    pending.catch(() => remotes.delete(id));
  }
  return pending;
}

export async function openBrowser(
  clientId: string,
  agentId: string,
  toolId: string,
  ownerTabId: string,
) {
  const tool = await prisma.workspaceTool.findFirst({
    where: { id: toolId, clientId, agentId, kind: "web", archivedAt: null },
  });
  if (!tool?.url) throw new WorkspaceError("Choose a web tool first.", 404);
  const url = await publicUrl(tool.url);
  const active = await prisma.workspaceSession.findFirst({
    where: { clientId, status: { in: ["starting", "running"] } },
  });
  if (active) {
    if (
      active.toolId === toolId &&
      active.status === "running" &&
      active.expiresAt.getTime() > Date.now() &&
      active.ownerTabId === ownerTabId
    )
      return sessionView(active.id);
    throw new WorkspaceError(
      "Close your current browser session before opening another tool. Check your other portal tabs.",
      409,
    );
  }
  const row = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${clientId}))::text`;
    if (
      await tx.browserSession.findFirst({
        where: {
          clientId,
          status: "running",
          startedAt: { gt: new Date(Date.now() - 10 * 60_000) },
        },
      })
    )
      throw new WorkspaceError(
        "Your agent is using a browser right now. Wait for its task to finish before opening this tool.",
        409,
      );
    return tx.workspaceSession.create({
      data: {
        clientId,
        agentId,
        toolId,
        ownerTabId,
        expiresAt: new Date(Date.now() + 30 * 60_000),
      },
    });
  });
  let providerId: string | undefined;
  try {
    let contextId = tool.contextId;
    if (!contextId) {
      const context = await browserApi<{ id: string }>("/contexts", "POST", {
        projectId: process.env.BROWSERBASE_PROJECT_ID,
      });
      contextId = context.id;
      await prisma.workspaceTool.update({
        where: { id: tool.id },
        data: { contextId },
      });
    }
    const created = await browserApi<{ id: string; connectUrl: string }>(
      "/sessions",
      "POST",
      {
        projectId: process.env.BROWSERBASE_PROJECT_ID,
        timeout: 1800,
        keepAlive: true,
        browserSettings: {
          recordSession: false,
          logSession: false,
          context: { id: contextId, persist: true },
          viewport: { width: 1280, height: 800 },
        },
      },
    );
    providerId = created.id;
    const view = await browserApi<{ debuggerFullscreenUrl: string }>(
      `/sessions/${created.id}/debug`,
    );
    if (!created.connectUrl || !view.debuggerFullscreenUrl)
      throw new Error("Browser did not provide a viewer");
    await prisma.workspaceSession.update({
      where: { id: row.id },
      data: {
        status: "running",
        providerId,
        connectionEncrypted: encrypt(created.connectUrl),
        viewEncrypted: encrypt(view.debuggerFullscreenUrl),
        currentUrl: safeLocation(url),
        lastHeartbeatAt: new Date(),
      },
    });
    const { page } = await remotePage(row.id);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25_000 });
    return sessionView(row.id);
  } catch (error) {
    if (providerId)
      await browserApi(`/sessions/${providerId}`, "POST", {
        status: "REQUEST_RELEASE",
        projectId: process.env.BROWSERBASE_PROJECT_ID,
      }).catch(() => {});
    await prisma.workspaceSession.update({
      where: { id: row.id },
      data: {
        status: "failed",
        endedAt: new Date(),
        connectionEncrypted: null,
        viewEncrypted: null,
      },
    });
    throw error instanceof WorkspaceError
      ? error
      : new WorkspaceError(
          "We couldn’t open this website. Try again or use a different tool.",
          502,
        );
  }
}

export async function sessionView(id: string) {
  const s = await prisma.workspaceSession.findUniqueOrThrow({
    where: { id },
    include: { tool: { select: { name: true } } },
  });
  return {
    id: s.id,
    toolId: s.toolId,
    toolName: s.tool.name,
    status: s.status,
    url: s.currentUrl,
    consentOrigin: s.consentOrigin,
    watching:
      s.watching &&
      !!s.lastHeartbeatAt &&
      Date.now() - s.lastHeartbeatAt.getTime() < 7000,
    watchedMs: s.watchedMs,
    ownerTabId: s.ownerTabId,
    heartbeatSeq: s.heartbeatSeq,
    expiresAt: s.expiresAt,
    viewUrl:
      s.status === "running" && s.viewEncrypted
        ? decrypt(s.viewEncrypted)
        : null,
  };
}

export async function closeBrowser(id: string) {
  const s = await prisma.workspaceSession.findUniqueOrThrow({ where: { id } });
  const remote = remotes.get(id);
  if (remote) {
    const r = await remote.catch(() => null);
    if (r) {
      await r.page.evaluate(stopRecorderSource).catch(() => {});
      await r.browser.disconnect();
    }
  }
  remotes.delete(id);
  if (s.providerId && s.status === "running") {
    try {
      await browserApi(`/sessions/${s.providerId}`, "POST", {
        status: "REQUEST_RELEASE",
        projectId: process.env.BROWSERBASE_PROJECT_ID,
      });
    } catch (error) {
      if (!(error instanceof WorkspaceError && error.status === 410)) {
        const status = await browserApi<{ status: string }>(
          `/sessions/${s.providerId}`,
        ).catch(() => null);
        if (
          !status ||
          !["COMPLETED", "TIMED_OUT", "ERROR"].includes(status.status)
        )
          throw error;
      }
    }
  }
  await prisma.workspaceSession.update({
    where: { id },
    data: {
      status: "closed",
      watching: false,
      endedAt: new Date(),
      connectionEncrypted: null,
      viewEncrypted: null,
    },
  });
}

export async function sweepWorkspace() {
  const expired = await prisma.workspaceSession.findMany({
    where: {
      status: { in: ["starting", "running"] },
      OR: [
        { expiresAt: { lt: new Date() } },
        { lastHeartbeatAt: { lt: new Date(Date.now() - 3 * 60_000) } },
        {
          status: "starting",
          startedAt: { lt: new Date(Date.now() - 2 * 60_000) },
        },
      ],
    },
    select: { id: true },
  });
  for (const s of expired) await closeBrowser(s.id).catch(() => {});
  await prisma.workspaceSession.updateMany({
    where: {
      watching: true,
      lastHeartbeatAt: { lt: new Date(Date.now() - 7000) },
    },
    data: { watching: false },
  });
  await prisma.workspaceObservation.updateMany({
    where: { expiresAt: { lt: new Date() }, contentEncrypted: { not: null } },
    data: { contentEncrypted: null },
  });
  await prisma.workspaceTurn.updateMany({
    where: {
      status: "pending",
      createdAt: { lt: new Date(Date.now() - 10 * 60_000) },
      OR: [
        { heartbeatAt: null },
        { heartbeatAt: { lt: new Date(Date.now() - 60_000) } },
      ],
    },
    data: {
      status: "interrupted",
      response:
        "This turn was interrupted. Check Activity before sending the task again.",
      completedAt: new Date(),
    },
  });
}
