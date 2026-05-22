import crypto from "node:crypto";
import prisma from "./db.js";
import logger from "./logger.js";

// ---------------------------------------------------------------------------
// Prospect helpers — shared by the Oracle find-or-create route AND any
// platform tool that needs to create/resume a Prospect (currently
// spawn_prospect). Same logic, single source of truth — keeps the resume
// rules consistent everywhere.
// ---------------------------------------------------------------------------

export interface FindOrCreateProspectInput {
  email: string;
  name?: string;
}

export interface FindOrCreateProspectResult {
  prospectId: string;
  token: string;
  isNew: boolean;
  isResume: boolean;
  status: string;
  /** Final contactName after the operation. */
  contactName: string | null;
}

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Validate + normalize. Throws on invalid email. */
export function normalizeProspectInput(input: FindOrCreateProspectInput): { email: string; name: string } {
  const email = (input.email ?? "").trim().toLowerCase();
  if (!email || !EMAIL_RX.test(email)) {
    throw new ProspectInputError("valid email required");
  }
  const name = (input.name ?? "").trim();
  return { email, name };
}

export class ProspectInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProspectInputError";
  }
}

/**
 * Resume rule (locked decision):
 *   - active prospect (status NOT in archived/ghosted) → return existing token (isResume)
 *   - archived/ghosted prospect → reuse the row but wipe formData + reissue token (treat as new)
 *   - no match → create fresh row
 */
export async function findOrCreateProspect(input: FindOrCreateProspectInput): Promise<FindOrCreateProspectResult> {
  const { email, name } = normalizeProspectInput(input);

  const existing = await prisma.prospect.findUnique({ where: { email } });

  // Active prospect — resume.
  if (existing && existing.status !== "archived" && existing.status !== "ghosted") {
    const update: Record<string, unknown> = { lastActivityAt: new Date() };
    if (name && name !== existing.contactName) update.contactName = name;
    const refreshed = await prisma.prospect.update({
      where: { id: existing.id },
      data: update,
      select: { id: true, token: true, status: true, contactName: true },
    });
    return {
      prospectId: refreshed.id,
      token: refreshed.token,
      isNew: false,
      isResume: true,
      status: refreshed.status,
      contactName: refreshed.contactName,
    };
  }

  // Dead prospect — revive with a fresh slate.
  if (existing) {
    const newToken = newProspectToken();
    const revived = await prisma.prospect.update({
      where: { id: existing.id },
      data: {
        token: newToken,
        status: "discovery",
        formData: {},
        sopFiles: [],
        chatLog: [],
        presentationData: undefined,
        presentationHtml: null,
        presentationGeneratedAt: null,
        contactName: name || existing.contactName,
        businessName: null,
        role: null,
        website: null,
        lastActivityAt: new Date(),
      },
      select: { id: true, token: true, status: true, contactName: true },
    });
    logger.info("Prospect revived from archived/ghosted", { prospectId: revived.id, email });
    return {
      prospectId: revived.id,
      token: revived.token,
      isNew: true,
      isResume: false,
      status: revived.status,
      contactName: revived.contactName,
    };
  }

  // Brand new.
  const created = await prisma.prospect.create({
    data: {
      email,
      token: newProspectToken(),
      contactName: name || null,
      status: "discovery",
    },
    select: { id: true, token: true, status: true, contactName: true },
  });
  logger.info("Prospect created", { prospectId: created.id, email });
  return {
    prospectId: created.id,
    token: created.token,
    isNew: true,
    isResume: false,
    status: created.status,
    contactName: created.contactName,
  };
}

/**
 * 24-char URL-safe random. Matches the visual length of cuid-shaped tokens
 * without taking a cuid dep. Collision risk at this length is astronomical.
 */
export function newProspectToken(): string {
  return crypto.randomBytes(18).toString("base64url");
}
