import "dotenv/config";
import { initiateConnection } from "../shared/mcp/composio.js";

async function main() {
  const app = process.argv[2] ?? "resend";
  try {
    const result = await initiateConnection(
      "test-client",
      app,
      "https://oracle-production-c0ff.up.railway.app/composio/callback"
    );
    console.log("SUCCESS:", JSON.stringify(result, null, 2));
  } catch (e: any) {
    console.error("FAILED:", e.message);
  }
  process.exit(0);
}
main();
