import "dotenv/config";
import { initiateOAuthConnection, getAuthScheme } from "../shared/mcp/composio.js";

const TOOLS = [
  "google_analytics", "googlesheets", "googledrive",
  "googlemeet", "googlecalendar", "salesforce", "asana"
];

async function main() {
  for (const app of TOOLS) {
    const scheme = await getAuthScheme(app);
    if (scheme === "NONE") {
      console.log(`${app}: NO CONFIG`);
      continue;
    }

    try {
      const result = await initiateOAuthConnection(`verify-${app}`, app);
      const res = await fetch(result.redirectUrl, { redirect: "manual" });
      const location = res.headers.get("location") ?? "";
      console.log(`${app}: ${scheme} — PASS — ${location.slice(0, 70)}`);
    } catch (e: any) {
      console.log(`${app}: ${scheme} — FAIL — ${e.message}`);
    }
  }
}

main().then(() => process.exit(0));
