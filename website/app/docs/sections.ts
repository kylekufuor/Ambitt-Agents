/* ---------------------------------------------------------------------------
   The documentation's table of contents, in one place.

   Shared by the page, the sidebar and the on-this-page rail so those three can
   never disagree. Three hand-maintained copies of the same list is how a docs
   site ends up with a nav entry pointing at a section somebody renamed.

   Ids are linked to from inside the client portal, so renaming one breaks a
   link a client is following. Add freely; rename deliberately.
   --------------------------------------------------------------------------- */

export interface DocSection {
  id: string;
  label: string;
  /** One-line summary, used by the sidebar's group intro and the hero cards. */
  blurb: string;
}

export interface DocGroup {
  label: string;
  sections: DocSection[];
}

export const DOC_GROUPS: DocGroup[] = [
  {
    label: "Getting in",
    sections: [
      {
        id: "signing-in",
        label: "Signing in",
        blurb: "Your first password, staying signed in, and what to do when you cannot get in.",
      },
    ],
  },
  {
    label: "Working with your agent",
    sections: [
      {
        id: "asking",
        label: "Asking for work",
        blurb: "How to give your agent a job, send a file, and know when they work.",
      },
      {
        id: "approvals",
        label: "Approvals",
        blurb: "What your agent stops for, and how to answer in one line.",
      },
      {
        id: "leads",
        label: "Your leads",
        blurb: "What hot, warm and cold mean, how to correct them, and how to take them with you.",
      },
    ],
  },
  {
    label: "Staying in control",
    sections: [
      {
        id: "control",
        label: "Stopping and starting",
        blurb: "Stop your agent whenever you like, and what it means when we have.",
      },
      {
        id: "codes",
        label: "Login codes by text",
        blurb: "Why we ask for a mobile number, and the promises attached to it.",
      },
    ],
  },
  {
    label: "Your account",
    sections: [
      {
        id: "tools",
        label: "Tools and passwords",
        blurb: "The accounts your agent uses, and where the passwords live.",
      },
      {
        id: "billing",
        label: "Billing and cancelling",
        blurb: "Invoices, what counts against your plan, and how to leave.",
      },
      {
        id: "help",
        label: "Getting a person",
        blurb: "The address that reaches a human, and what to put in it.",
      },
    ],
  },
];

/** Flat list, document order. */
export const DOC_SECTIONS: DocSection[] = DOC_GROUPS.flatMap((g) => g.sections);

/**
 * Which section is "current", given the set the observer says is on screen.
 *
 * Pulled out as a pure function because it is the part with a real decision in
 * it. Several sections are on screen at once whenever one is short or the
 * reader scrolls fast, and taking whichever the observer reported last makes
 * the highlight jitter between neighbours. Document order settles it: the
 * topmost visible section is the one being read.
 *
 * Never returns nothing. A nav with no current item looks broken rather than
 * idle, so an empty set keeps whatever was current before, and the very first
 * render falls back to the first section.
 */
export function pickActiveSection(visible: Set<string> | string[], previous?: string): string {
  const onScreen = visible instanceof Set ? visible : new Set(visible);
  const topmost = DOC_SECTIONS.find((s) => onScreen.has(s.id));
  if (topmost) return topmost.id;
  return previous ?? DOC_SECTIONS[0].id;
}
