import "dotenv/config";

// Simulate exactly what the dashboard does when verifying connections
const ORACLE_URL = "https://oracle-production-c0ff.up.railway.app";
const CLIENT_EMAIL = "kylekufuor@gmail.com";

async function testVerification() {
  console.log("=== Testing connection verification (what dashboard does) ===\n");

  // Step 1: Call the connections endpoint (same as dashboard)
  console.log("1. Fetching connections from Oracle...");
  const res = await fetch(`${ORACLE_URL}/composio/connections/${encodeURIComponent(CLIENT_EMAIL)}`);
  console.log(`   Status: ${res.status}`);
  const connections = await res.json();
  console.log(`   Is array: ${Array.isArray(connections)}`);
  console.log(`   Count: ${Array.isArray(connections) ? connections.length : 'N/A'}`);

  if (Array.isArray(connections)) {
    console.log("\n2. Connection details:");
    for (const c of connections) {
      console.log(`   - appName="${c.appName}" status="${c.status}" id="${c.id?.slice(0, 12)}..."`);
    }
  } else {
    console.log("\n   RAW RESPONSE:", JSON.stringify(connections).slice(0, 300));
  }

  // Step 2: Test verification for each tool
  console.log("\n3. Verification results:");
  for (const tool of ["supabase", "posthog", "resend", "slack", "gmail"]) {
    const found = Array.isArray(connections) && connections.some(
      (c: any) => c.appName?.toLowerCase() === tool.toLowerCase() && c.status === "ACTIVE"
    );
    console.log(`   ${tool}: ${found ? "VERIFIED ✓" : "NOT FOUND ✗"}`);
  }
}

testVerification().then(() => process.exit(0)).catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
