import { readFileSync } from "node:fs";
import { join } from "node:path";
import { editorialResponse } from "../lib/editorial";

// The editorial use-cases page. Same mechanism as app/route.ts: the approved
// design file, wrapped in a full document, rendered once at build.
export const dynamic = "force-static";

export function GET(): Response {
  return editorialResponse(readFileSync(join(process.cwd(), "editorial/use-cases.html"), "utf8"), {
    path: "/use-cases",
    description:
      "Four jobs, four industries, one workforce. What the client asked for in plain English, what the agent does about it, and what lands in the inbox.",
  });
}
