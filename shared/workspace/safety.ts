import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export class WorkspaceError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function publicAddress(ip: string): boolean {
  if (ip.includes(":"))
    return !/^(::|fc|fd|fe[89ab]|ff)/i.test(ip) && !ip.includes("ffff:");
  const [a, b] = ip.split(".").map(Number);
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && (b === 18 || b === 19))
  );
}
export async function publicUrl(value: string): Promise<string> {
  let u: URL;
  try {
    u = new URL(value.includes("://") ? value : `https://${value}`);
  } catch {
    throw new WorkspaceError("Enter a valid website address.");
  }
  if (
    !["https:", "http:"].includes(u.protocol) ||
    u.username ||
    u.password ||
    (u.port && !["80", "443"].includes(u.port))
  )
    throw new WorkspaceError(
      "Use a public http or https website without a password in its address.",
    );
  const hostname = u.hostname.replace(/^\[|\]$/g, "");
  if (
    !hostname.includes(".") ||
    /\.(localhost|local|internal|test|invalid)$/i.test(hostname)
  )
    throw new WorkspaceError("Use a public website address.");
  const ips = isIP(hostname)
    ? [{ address: hostname }]
    : await lookup(hostname, { all: true }).catch(() => []);
  if (!ips.length || ips.some((i) => !publicAddress(i.address)))
    throw new WorkspaceError("This address is not a public website.");
  u.hash = "";
  return u.toString();
}
// Never persist URL query parameters or fragments: OAuth codes and tokens
// commonly live there. The live browser still receives the full navigation.
export function safeLocation(value: string) {
  try {
    const u = new URL(value);
    return `${u.origin}${u.pathname}`.slice(0, 2000);
  } catch {
    return "about:blank";
  }
}
export function watchDelta(
  previous: Date | null,
  now: Date,
  elapsed: number,
  wasWatching: boolean,
) {
  if (!wasWatching || !previous) return 0;
  const gap = now.getTime() - previous.getTime();
  // Missing heartbeat is not assumed time spent watching.
  return gap > 7000
    ? 0
    : Math.max(0, Math.min(gap, 6000, Number.isFinite(elapsed) ? elapsed : 0));
}
