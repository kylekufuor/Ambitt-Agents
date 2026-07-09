const { runBrowserTask } = await import("../shared/platform-tools/browser.ts");
console.log("probing Browserbase gateway with anthropic/claude-sonnet-4-6 …");
const t0 = Date.now();
const res = await runBrowserTask({
  agentId: "cmptgvnoq000fbp15wa7bgsw9",
  clientId: "cmptgvn84000dbp15hh4vj8gs",
  goal: "Report the main heading text shown on this page.",
  startingUrl: "https://example.com",
});
console.log(`status=${res.status} (${((Date.now()-t0)/1000).toFixed(1)}s)`);
console.log("message:", (res.message || res.error || "").slice(0, 400));
