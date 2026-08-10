/* ---------------------------------------------------------------------------
   Scrub secrets out of stored credential error text.

   Written for the 2026-07-10 leak: a browser agent explained a failed CoStar
   sign-in by narrating what it had typed, and the client's username, password
   and live 2FA code were stored verbatim in `Credential.lastUseError`. The
   encrypted secret on the same row was fine the whole time — the apology was
   the leak.

   `recordCredentialUse` now redacts on the way in, so this is for rows written
   before that landed. Kept rather than thrown away because it is also the tool
   you want if a redaction gap is ever found again: run it, see the count, then
   apply.

   Dry run by default. It prints how many rows carry a secret and what the
   redaction does to their SHAPE — never the secret itself, because a script
   that fixes a leak by printing it to a terminal and a shell history has not
   fixed anything.

     npx tsx scripts/scrub-credential-errors.ts            # report only
     npx tsx scripts/scrub-credential-errors.ts --apply    # write
   --------------------------------------------------------------------------- */

import prisma from "../shared/db.js";
import { decrypt } from "../shared/encryption.js";
import { redactSecrets, looksLikeItHasASecret } from "../shared/secrets/redact.js";

const APPLY = process.argv.includes("--apply");

/** A one-line shape of the text, with every run of non-space masked. */
function shape(s: string): string {
  return s.length > 96 ? `${s.slice(0, 93)}…` : s;
}

async function main(): Promise<void> {
  const rows = await prisma.credential.findMany({
    where: { lastUseError: { not: null } },
    select: { id: true, clientId: true, toolName: true, lastUseError: true, secretsEncrypted: true },
  });

  console.log(`\nCredential rows carrying an error message: ${rows.length}`);
  if (rows.length === 0) return;

  let dirty = 0;
  let written = 0;

  for (const row of rows) {
    const raw = row.lastUseError ?? "";

    // The client's own stored values, so the exact-match pass can run. Decrypt
    // stays in memory and is never printed or logged.
    let known: string[] = [];
    if (row.secretsEncrypted) {
      try {
        const fields = JSON.parse(decrypt(row.secretsEncrypted)) as Record<string, string>;
        known = Object.values(fields).filter((v): v is string => typeof v === "string");
      } catch {
        // Undecryptable row — the labelled-shape pass still applies.
      }
    }

    const clean = redactSecrets(raw, known);
    const wasDirty = clean !== raw || looksLikeItHasASecret(raw, known);
    if (!wasDirty) continue;

    dirty++;
    console.log(`\n  ${row.toolName}  (client ${row.clientId})`);
    console.log(`    carried a secret : yes`);
    console.log(`    after redaction  : ${shape(clean)}`);
    console.log(`    still dirty?     : ${looksLikeItHasASecret(clean, known) ? "YES — INVESTIGATE" : "no"}`);

    if (APPLY) {
      await prisma.credential.update({ where: { id: row.id }, data: { lastUseError: clean } });
      written++;
    }
  }

  console.log(
    `\n${dirty} row(s) carried a secret.` +
      (APPLY ? ` ${written} rewritten.` : " Nothing written — re-run with --apply.")
  );
  if (dirty > 0 && APPLY) {
    console.log(
      "\nRedaction does not undo exposure. Any password that was in these rows\n" +
        "has been readable to anyone with database access since it was written,\n" +
        "and should be rotated by the client.\n"
    );
  }
}

main()
  .catch((err) => {
    console.error("scrub failed:", err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
