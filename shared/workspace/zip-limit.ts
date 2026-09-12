import { inflateRaw } from "node:zlib";
import { promisify } from "node:util";
import { WorkspaceError } from "./safety.js";
const inflate = promisify(inflateRaw);
const MAX = 30_000_000;

/** Bound actual decompressed Office data before handing it to an XML parser.
 * Central-directory sizes alone cannot be trusted for user-supplied ZIPs. */
export async function checkOfficeArchive(bytes: Buffer) {
  const invalid = () =>
    new WorkspaceError(
      "This Office file is too large or has an unsupported archive format. Export a smaller file or CSV.",
    );
  const end = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end < 0 || end + 22 > bytes.length) throw invalid();
  const entries = bytes.readUInt16LE(end + 10);
  const directory = bytes.readUInt32LE(end + 16);
  if (entries > 1000 || directory >= end || bytes.readUInt16LE(end + 4) !== 0)
    throw invalid();
  let cursor = directory,
    total = 0;
  for (let i = 0; i < entries; i++) {
    if (cursor + 46 > end || bytes.readUInt32LE(cursor) !== 0x02014b50)
      throw invalid();
    const method = bytes.readUInt16LE(cursor + 10);
    const compressed = bytes.readUInt32LE(cursor + 20);
    const size = bytes.readUInt32LE(cursor + 24);
    const local = bytes.readUInt32LE(cursor + 42);
    if (
      size > MAX - total ||
      local + 30 > directory ||
      bytes.readUInt32LE(local) !== 0x04034b50
    )
      throw invalid();
    const start =
      local +
      30 +
      bytes.readUInt16LE(local + 26) +
      bytes.readUInt16LE(local + 28);
    if (start + compressed > directory) throw invalid();
    let actual: number;
    try {
      if (method === 0) actual = compressed;
      else if (method === 8)
        actual = (
          await inflate(bytes.subarray(start, start + compressed), {
            maxOutputLength: MAX - total + 1,
          })
        ).byteLength;
      else throw invalid();
    } catch {
      throw invalid();
    }
    total += actual;
    if (actual !== size || total > MAX) throw invalid();
    cursor +=
      46 +
      bytes.readUInt16LE(cursor + 28) +
      bytes.readUInt16LE(cursor + 30) +
      bytes.readUInt16LE(cursor + 32);
  }
}
