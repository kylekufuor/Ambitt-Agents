// ---------------------------------------------------------------------------
// Machine-email guard (control-plane, Pillar 3)
// ---------------------------------------------------------------------------
// Automated / no-reply / bounce / auto-reply / mailing-list mail is LOGGED but
// never spawns an agent run. Root-cause layer for the runaway loop where a
// vendor's automated security/OTP emails kept re-triggering fresh runs. Only
// genuine human mail (from an authorized sender) drives an agent. Seatbelts
// (Pillar 4) are the backstop for anything this misses.
//
// Pure, side-effect-free, and channel-agnostic so email/WhatsApp/chat inbound
// can all reuse it. Unit-tested in inbound-classify.test.ts.
// ---------------------------------------------------------------------------

export interface AutomatedVerdict {
  automated: boolean;
  reason: string;
}

// Read a header case-insensitively from whatever shape a provider hands us
// (array of {name,value} | Record<string,string>). "" if absent.
export function inboundHeader(emailData: Record<string, unknown>, name: string): string {
  const h = emailData.headers;
  const want = name.toLowerCase();
  if (Array.isArray(h)) {
    for (const item of h as Array<{ name?: string; value?: string }>) {
      if (typeof item?.name === "string" && item.name.toLowerCase() === want) {
        return typeof item.value === "string" ? item.value : "";
      }
    }
  } else if (h && typeof h === "object") {
    for (const [k, v] of Object.entries(h as Record<string, unknown>)) {
      if (k.toLowerCase() === want) return typeof v === "string" ? v : String(v ?? "");
    }
  }
  return "";
}

// Bare localpart from "Name <a@b.com>" or "a@b.com", lowercased.
export function senderLocalpart(from: string): string {
  const m = from.match(/<([^>]+)>/);
  const addr = (m ? m[1] : from).trim().toLowerCase();
  const at = addr.indexOf("@");
  return at > 0 ? addr.slice(0, at) : addr;
}

// Decide whether an inbound message is machine-generated. Any single positive
// signal is enough — we fail toward "don't spawn a run" for automated mail.
export function classifyAutomatedInbound(
  from: string,
  subjectRaw: string,
  emailData: Record<string, unknown>
): AutomatedVerdict {
  // 1) Sender localpart — strongest, always-available signal.
  const lp = senderLocalpart(from);
  if (/^(no-?reply|do-?not-?reply|donotreply|notification|notifications|alert|alerts|mailer-daemon|postmaster|bounce|bounces|auto-?reply|autoresponder|daemon|mailerdaemon)([.+_-]|$)/i.test(lp)) {
    return { automated: true, reason: `sender:${lp}` };
  }
  // no-reply / noreply appearing anywhere as a token (e.g. security-noreply@).
  if (/(^|[.+_-])(no-?reply|noreply|do-?not-?reply|donotreply)([.+_-]|$)/i.test(lp)) {
    return { automated: true, reason: `sender:${lp}` };
  }

  // 2) Headers — RFC 3834 auto-submitted, bulk precedence, vendor autoreply
  //    markers, bounces (null return-path / DSN report), mailing lists.
  const autoSub = inboundHeader(emailData, "auto-submitted").toLowerCase();
  if (autoSub && autoSub !== "no") return { automated: true, reason: `auto-submitted:${autoSub}` };
  const precedence = inboundHeader(emailData, "precedence").toLowerCase();
  if (/\b(bulk|list|junk|auto_reply)\b/.test(precedence)) return { automated: true, reason: `precedence:${precedence}` };
  if (inboundHeader(emailData, "x-auto-response-suppress")) return { automated: true, reason: "x-auto-response-suppress" };
  if (inboundHeader(emailData, "x-autoreply") || inboundHeader(emailData, "x-autorespond")) return { automated: true, reason: "x-autoreply" };
  if (inboundHeader(emailData, "list-id") || inboundHeader(emailData, "list-unsubscribe")) return { automated: true, reason: "mailing-list" };
  if (inboundHeader(emailData, "return-path").trim() === "<>") return { automated: true, reason: "null-return-path" };
  const contentType = inboundHeader(emailData, "content-type").toLowerCase();
  if (contentType.includes("multipart/report") || /report-type=(delivery-status|disposition-notification)/.test(contentType)) {
    return { automated: true, reason: "dsn-report" };
  }

  // 3) Subject — well-known auto-reply / bounce / security-notification
  //    phrasings. Kept narrow to avoid false-dropping human mail.
  const subj = (subjectRaw || "").toLowerCase();
  if (/(out of office|automatic reply|auto[- ]?reply|undeliverable|delivery status notification|mail delivery (failed|subsystem)|returned mail|failure notice|delivery has failed|address not found)/.test(subj)) {
    return { automated: true, reason: "subject:autoreply-or-bounce" };
  }
  if (/(suspicious (activity|(sign|log)-?in)|unusual (activity|sign-?in|login)|security alert|new (sign-?in|device|login)|verify your (email|account|identity)|confirm your email|your (verification|security) code)/.test(subj)) {
    return { automated: true, reason: "subject:security-notification" };
  }

  return { automated: false, reason: "" };
}
