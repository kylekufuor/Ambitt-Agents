// Local probe: round-trip the example JSON through the proposal-email
// renderer. Validates that the template + Zod schema agree.
import { readFileSync } from "node:fs";
import { renderProposalEmail, parseAtlasJsonOutput, ProposalEmailValidationError } from "../oracle/templates/proposal-email/render.js";

const example = JSON.parse(readFileSync("./oracle/templates/proposal-email/example.json", "utf-8"));

console.log("--- renderProposalEmail(example.json) ---");
try {
  const html = renderProposalEmail(example);
  console.log("OK — rendered", html.length, "chars");
  // Check the lockup/hero label rendered
  console.log("contains AMBITT AGENTS:", html.includes("AMBITT AGENTS"));
  console.log("contains hero title:", html.includes("Meet Kwame"));
} catch (e) {
  if (e instanceof ProposalEmailValidationError) {
    console.error("validation issues:", JSON.stringify(e.issues, null, 2));
  } else {
    console.error("error:", (e as Error).message);
  }
}

console.log("\n--- parseAtlasJsonOutput ---");
console.log("raw:", parseAtlasJsonOutput('{"a":1}'));
console.log("fenced:", parseAtlasJsonOutput('Here:\n```json\n{"b":2}\n```'));
console.log("preamble:", parseAtlasJsonOutput("Sure thing: {\"c\":3} done."));
console.log("garbage:", parseAtlasJsonOutput("totally not json"));

console.log("\n--- validation failure (missing required) ---");
try {
  renderProposalEmail({ subject: "X" });
} catch (e) {
  if (e instanceof ProposalEmailValidationError) {
    console.log("caught", e.issues.length, "issues, first:", `${e.issues[0].path.join(".")}: ${e.issues[0].message}`);
  }
}
