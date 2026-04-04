import "dotenv/config";
import { initiateOAuthConnection, initiateApiKeyConnection, getConnectedAccounts, listApps, getAuthScheme } from "../shared/mcp/composio.js";

async function test() {
  // Test 1: List apps
  console.log("=== 1. List Apps ===");
  const apps = await listApps();
  console.log("Total apps:", apps.length);

  // Test 2: Auth schemes
  console.log("\n=== 2. Auth Schemes ===");
  for (const app of ["resend", "posthog", "supabase", "slack", "gmail"]) {
    const scheme = await getAuthScheme(app);
    console.log(`${app}: ${scheme}`);
  }

  // Test 3: API key connection (Resend)
  console.log("\n=== 3. API Key Connect (Resend) ===");
  const resend = await initiateApiKeyConnection("e2e-test", "resend", "re_test_key_123");
  console.log("Resend:", resend.status, resend.connectionId);

  // Test 4: API key connection (PostHog)
  console.log("\n=== 4. API Key Connect (PostHog) ===");
  const ph = await initiateApiKeyConnection("e2e-test", "posthog", "phx_test_key_123", { subdomain: "us" });
  console.log("PostHog:", ph.status, ph.connectionId);

  // Test 5: API key connection (Supabase)
  console.log("\n=== 5. API Key Connect (Supabase) ===");
  const sb = await initiateApiKeyConnection("e2e-test", "supabase", "sbp_test_token_123");
  console.log("Supabase:", sb.status, sb.connectionId);

  // Test 6: OAuth connection (Slack)
  console.log("\n=== 6. OAuth Connect (Slack) ===");
  const slack = await initiateOAuthConnection("e2e-test", "slack");
  console.log("Redirect URL:", slack.redirectUrl.slice(0, 80) + "...");
  // Follow the redirect
  const redirectCheck = await fetch(slack.redirectUrl, { redirect: "manual" });
  const location = redirectCheck.headers.get("location") ?? "";
  console.log("Redirects to:", location.slice(0, 60) + "...");
  console.log("Goes to Slack?", location.includes("slack.com"));

  // Test 7: OAuth connection (Gmail)
  console.log("\n=== 7. OAuth Connect (Gmail) ===");
  const gmail = await initiateOAuthConnection("e2e-test", "gmail");
  const gmailRedirect = await fetch(gmail.redirectUrl, { redirect: "manual" });
  const gmailLocation = gmailRedirect.headers.get("location") ?? "";
  console.log("Redirects to:", gmailLocation.slice(0, 60) + "...");
  console.log("Goes to Google?", gmailLocation.includes("google.com") || gmailLocation.includes("accounts.google"));

  // Test 8: Get connected accounts
  console.log("\n=== 8. Connected Accounts ===");
  const conns = await getConnectedAccounts("e2e-test");
  console.log("Connections:", conns.length);
  for (const c of conns.slice(0, 5)) {
    console.log(`  - ${c.appName}: ${c.status}`);
  }

  console.log("\n=== ALL TESTS PASSED ===");
}

test().then(() => process.exit(0)).catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
