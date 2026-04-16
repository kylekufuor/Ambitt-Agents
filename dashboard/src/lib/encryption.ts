import { createDecipheriv } from "node:crypto";

// Mirror of shared/encryption.ts — kept in sync with the Oracle-side module.
// Dashboard reads encrypted agent memory from the same Postgres as Oracle.

const ALGORITHM = "aes-256-gcm";

function getKey(): Buffer {
  const key = process.env.APP_ENCRYPTION_KEY;
  if (!key) throw new Error("APP_ENCRYPTION_KEY is not set");
  return Buffer.from(key, "hex");
}

export function decrypt(encryptedText: string): string {
  const key = getKey();
  const [ivHex, authTagHex, ciphertext] = encryptedText.split(":");

  if (!ivHex || !authTagHex || !ciphertext) {
    throw new Error("Invalid encrypted text format");
  }

  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}
