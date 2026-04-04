import "dotenv/config";
import { scaffoldAgent } from "../oracle/scaffold.js";

async function main() {
  try {
    const id = await scaffoldAgent({
      clientEmail: "hello@mcquizzy.com",
      businessName: "McQuizzy",
      businessWebsite: "mcquizzy.com",
      businessDescription: "SaaS that helps people break into IT",
      agent: {
        name: "Priya",
        agentType: "analytics",
        tools: ["posthog", "supabase", "resend"],
        purpose: "Product analytics and growth insights",
      },
    });
    console.log("SUCCESS — Agent ID:", id);
  } catch (error: any) {
    console.error("FAILED:", error.message);
    console.error(error.stack?.split("\n").slice(0, 5).join("\n"));
  }
  process.exit(0);
}
main();
