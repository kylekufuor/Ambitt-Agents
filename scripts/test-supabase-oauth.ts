import "dotenv/config";
import { initiateOAuthConnection } from "../shared/mcp/composio.js";

async function main() {
  const result = await initiateOAuthConnection("test-supabase-oauth", "supabase");
  console.log("Redirect URL:", result.redirectUrl);

  const res = await fetch(result.redirectUrl, { redirect: "manual" });
  const location = res.headers.get("location") ?? "";
  console.log("Redirects to:", location.slice(0, 100));
  console.log("Goes to Supabase?", location.includes("supabase"));
}

main().then(() => process.exit(0)).catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
