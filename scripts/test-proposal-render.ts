// Local probe: round-trip the example JSON through the proposal-email
// renderer. Validates that the template + Zod schema agree.
import { readFileSync } from "node:fs";
import { renderProposalEmail, parseAtlasJsonOutput, ProposalEmailValidationError } from "../oracle/templates/proposal-email/render.js";

const example = JSON.parse(readFileSync("./oracle/templates/proposal-email/example.json", "utf-8"));

console.log("--- renderProposalEmail(example.json) ---");
try {
  const html = renderProposalEmail(example);
  console.log("OK, rendered", html.length, "chars");
  // The masthead wordmark. Used to look for the uppercase "AMBITT AGENTS" that
  // sat inside the old near-black hero slab; that slab is gone and the wordmark
  // is now live sentence-case text at the top of the document.
  console.log("contains masthead wordmark:", html.includes("Ambitt <span>Agents</span>"));
  console.log("contains hero title:", html.includes("Meet Kwame"));
  // The two things this pass was meant to remove. Comments are stripped first:
  // the template documents what it replaced, and naming Geist in a comment is
  // not the same as loading it.
  const doc = html.replace(/<!--[\s\S]*?-->/g, "");
  console.log("no webfont at all:", !doc.includes("@font-face") && !doc.includes("@import"));
  console.log("no second cyan #00d4d4:", !doc.includes("#00d4d4"));
  console.log("teal never carries text:", !/color:\s*#00b3b3/i.test(doc));
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
