import "dotenv/config";
import { initiateOAuthConnection, initiateApiKeyConnection, getAuthScheme } from "../shared/mcp/composio.js";

// All tools from Kyle's Composio auth configs
const TOOLS = [
  "linkedin", "instagram", "1password", "google_analytics",
  "calendly", "hubspot", "salesforce", "asana",
  "posthog", "supabase", "googlemeet", "googlesheets",
  "googledrive", "slack", "outlook", "googlecalendar",
  "gmail", "resend",
];

async function main() {
  let pass = 0, fail = 0;

  for (const app of TOOLS) {
    const scheme = await getAuthScheme(app);

    if (scheme === "NONE") {
      console.log(`${app}: NO CONFIG`);
      fail++;
      continue;
    }

    try {
      if (scheme === "API_KEY") {
        const result = await initiateApiKeyConnection(`full-test`, app, `test_key_${app}`);
        console.log(`${app}: ${scheme} — PASS — ${result.status}`);
        pass++;
      } else {
        const result = await initiateOAuthConnection(`full-test`, app);
        const res = await fetch(result.redirectUrl, { redirect: "manual" });
        const location = res.headers.get("location") ?? "no redirect";
        console.log(`${app}: ${scheme} — PASS — ${location.slice(0, 60)}`);
        pass++;
      }
    } catch (e: any) {
      console.log(`${app}: ${scheme} — FAIL — ${e.message.slice(0, 80)}`);
      fail++;
    }
  }

  console.log(`\n=== ${pass} PASS, ${fail} FAIL out of ${TOOLS.length} ===`);
}

main().then(() => process.exit(0));
