import { describe, it, expect } from "vitest";
import { redactSecrets, looksLikeItHasASecret, MASK } from "./redact.js";

/* ---------------------------------------------------------------------------
   The first test is the actual leak, near-verbatim. If this file is ever
   loosened, that is the case that has to keep passing — it is the sentence a
   model really wrote, about a real client, that really got stored.
   --------------------------------------------------------------------------- */

const REAL_LEAK =
  "The task could not be completed. The automation successfully navigated to " +
  "costar.com, entered the correct username (broker@example.com) and password " +
  "(Hunter2Example!), and reached the two-factor authentication verification " +
  "screen. However, the provided verification code 331713 was repeatedly rejected.";

describe("the July 2026 leak", () => {
  const stored = ["broker@example.com", "Hunter2Example!"];

  it("removes the password", () => {
    const out = redactSecrets(REAL_LEAK, stored);
    expect(out).not.toContain("Hunter2Example!");
  });

  it("removes the username", () => {
    expect(redactSecrets(REAL_LEAK, stored)).not.toContain("broker@example.com");
  });

  it("removes the one-time code", () => {
    expect(redactSecrets(REAL_LEAK, stored)).not.toContain("331713");
  });

  it("still explains what went wrong", () => {
    const out = redactSecrets(REAL_LEAK, stored);
    expect(out).toContain("costar.com");
    expect(out).toContain("two-factor");
    expect(out).toContain("repeatedly rejected");
    expect(out).toContain(MASK);
  });

  it("is clean by its own detector afterwards", () => {
    expect(looksLikeItHasASecret(REAL_LEAK, stored)).toBe(true);
    expect(looksLikeItHasASecret(redactSecrets(REAL_LEAK, stored), stored)).toBe(false);
  });
});

describe("known values, whatever the phrasing", () => {
  it("catches a secret with no label near it at all", () => {
    // The point of pass 1: the model does not have to say "password".
    const out = redactSecrets("I typed Hunter2Example! and it bounced.", ["Hunter2Example!"]);
    expect(out).toBe(`I typed ${MASK} and it bounced.`);
  });

  it("is case-insensitive", () => {
    expect(redactSecrets("tried HUNTER2EXAMPLE! twice", ["Hunter2Example!"])).not.toMatch(/hunter/i);
  });

  it("masks every occurrence, not just the first", () => {
    const out = redactSecrets("used s3cr3tpw, then s3cr3tpw again", ["s3cr3tpw"]);
    expect(out).not.toContain("s3cr3tpw");
    expect(out.match(new RegExp(MASK, "g"))).toHaveLength(2);
  });

  it("masks the longer value first so no tail survives", () => {
    // "pw" is a substring of "pw-and-more"; longest-first stops the shorter
    // match from chopping the longer one into a still-readable remainder.
    const out = redactSecrets("password (pw-and-more)", ["pw12", "pw-and-more"]);
    expect(out).not.toContain("and-more");
  });

  it("ignores values too short to mask safely", () => {
    // Masking "no" would shred the sentence and protect nothing.
    expect(redactSecrets("the login did not complete", ["no"])).toBe("the login did not complete");
  });
});

describe("labelled shapes, for secrets we do not hold", () => {
  it("handles colon form", () => {
    expect(redactSecrets("password: sup3rsecret")).toBe(`password: ${MASK}`);
  });

  it("handles equals form", () => {
    expect(redactSecrets("api_key=abc123xyz")).toContain(MASK);
    expect(redactSecrets("api_key=abc123xyz")).not.toContain("abc123xyz");
  });

  it("handles the parenthesised form a model actually writes", () => {
    expect(redactSecrets("the password (letmein99) failed")).toBe(`the password (${MASK}) failed`);
  });

  it("catches a bearer token", () => {
    expect(redactSecrets("sent bearer eyJhbGciOiJIUzI1NiJ9")).not.toContain("eyJhbGciOiJIUzI1NiJ9");
  });

  it("keeps the label so the error is still actionable", () => {
    expect(redactSecrets("password: sup3rsecret")).toContain("password");
  });
});

describe("what must NOT be mangled", () => {
  it("leaves a sentence about a password alone", () => {
    const s = "The password was rejected and the account is now locked.";
    expect(redactSecrets(s)).toBe(s);
  });

  it("leaves ordinary failure prose alone", () => {
    const s = "Sign-in did not complete. The page timed out after 30 seconds.";
    expect(redactSecrets(s)).toBe(s);
  });

  it("does not mask the word after 'password' when it is grammar", () => {
    for (const s of [
      "password is incorrect",
      "password was expired",
      "password field was empty",
      "password entered successfully",
    ]) {
      expect(redactSecrets(s)).toBe(s);
    }
  });

  it("is idempotent — redacting twice changes nothing", () => {
    const once = redactSecrets(REAL_LEAK, ["Hunter2Example!"]);
    expect(redactSecrets(once, ["Hunter2Example!"])).toBe(once);
  });

  it("handles empty and missing input", () => {
    expect(redactSecrets("")).toBe("");
    expect(redactSecrets(null)).toBe("");
    expect(redactSecrets(undefined)).toBe("");
  });
});

describe("one-time codes", () => {
  it("masks a verification code", () => {
    expect(redactSecrets("verification code 331713 was rejected")).not.toContain("331713");
  });

  it("masks a 2FA code in the other common phrasing", () => {
    expect(redactSecrets("the 2fa code is 884412")).not.toContain("884412");
  });

  it("leaves unrelated numbers alone", () => {
    const s = "The page timed out after 30 seconds and returned 403.";
    expect(redactSecrets(s)).toBe(s);
  });
});
