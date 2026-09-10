import { readFileSync } from "node:fs";
import { join } from "node:path";
import { editorialResponse } from "./lib/editorial";

/* ---------------------------------------------------------------------------
   `/` is the editorial homepage, served as the approved design file rather
   than as React (see app/lib/editorial.ts for why). A route handler, not a
   page: this replaces app/page.tsx, because a route.ts and a page.tsx cannot
   share a segment. Route handlers also skip the root layout, so the document
   and its <head> are built in full by editorialResponse().

   force-static renders it once at build and serves the result as a static
   file; the fragment is read at build time and never per request. The path
   is a literal so file tracing can see exactly which file this reads.
   --------------------------------------------------------------------------- */
export const dynamic = "force-static";

export function GET(): Response {
  return editorialResponse(readFileSync(join(process.cwd(), "editorial/home.html"), "utf8"), {
    path: "/",
    description:
      "Every agent has a name, an inbox, and a standing job. Ask once, and the finished work comes back in the inbox you already read.",
  });
}
