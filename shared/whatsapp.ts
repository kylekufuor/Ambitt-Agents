import twilio from "twilio";
import logger from "./logger.js";

function getClient(): twilio.Twilio {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) throw new Error("Twilio credentials not set");
  return twilio(sid, token);
}

interface WhatsAppOptions {
  to: string;
  message: string;
}

export async function sendWhatsApp(
  options: WhatsAppOptions,
  retries = 3
): Promise<string> {
  const { to, message } = options;
  const from = process.env.TWILIO_WHATSAPP_NUMBER;
  if (!from) throw new Error("TWILIO_WHATSAPP_NUMBER is not set");

  const client = getClient();

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const result = await client.messages.create({
        body: message,
        from: `whatsapp:${from}`,
        to: `whatsapp:${to}`,
      });

      logger.info("WhatsApp sent", { to, sid: result.sid });
      return result.sid;
    } catch (error) {
      logger.error(`WhatsApp attempt ${attempt}/${retries} failed`, {
        error,
        to,
      });
      if (attempt === retries) throw error;
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }

  throw new Error("WhatsApp send failed after all retries");
}

// Operator alerts (spike auto-pause, seatbelt trips, budget, build crashes)
// MUST reach Kyle. WhatsApp is the preferred channel, but it isn't always
// configured (and unprompted WhatsApp messages hit the 24h-window/template
// wall), so this ALWAYS falls back to email when WhatsApp is unavailable or
// fails. Never throws — a failed alert channel must not crash the caller.
// Every existing sendKyleWhatsApp(...) call across the platform gets this for
// free.
export async function sendKyleWhatsApp(message: string): Promise<string> {
  const kyleNumber = process.env.KYLE_WHATSAPP_NUMBER;
  const twilioReady = !!(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_WHATSAPP_NUMBER &&
    kyleNumber
  );

  if (twilioReady) {
    try {
      return await sendWhatsApp({ to: kyleNumber as string, message });
    } catch (err) {
      logger.warn("Operator WhatsApp failed — falling back to email", {
        err: err instanceof Error ? err.message : String(err),
      });
    }
  } else {
    logger.info("WhatsApp not configured — sending operator alert via email");
  }

  return sendOperatorEmail(message);
}

// Email fallback for operator alerts → OPERATOR_EMAIL via Resend (a verified
// domain; RESEND_API_KEY + OPERATOR_EMAIL are set on Oracle). Best-effort:
// returns a marker string, never throws.
async function sendOperatorEmail(message: string): Promise<string> {
  const to = process.env.OPERATOR_EMAIL;
  const key = process.env.RESEND_API_KEY;
  if (!to || !key) {
    logger.error("Operator alert has NO channel — WhatsApp unconfigured and OPERATOR_EMAIL/RESEND_API_KEY missing", { message: message.slice(0, 120) });
    return "no-channel";
  }
  const domain = process.env.EMAIL_DOMAIN || "ambitt.agency";
  const firstLine = message.split("\n")[0].replace(/^[^\p{L}\p{N}]+/u, "").trim();
  const subject = `⚠️ Ambitt alert — ${firstLine.slice(0, 70) || "operator notification"}`;
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;line-height:1.6;color:#15201f;white-space:pre-wrap;max-width:560px;">${esc(message)}</div>`;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: `Ambitt Alerts <alerts@${domain}>`, to: [to], subject, html }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      logger.error("Operator alert email failed", { status: res.status, body: body.slice(0, 200) });
      return "email-failed";
    }
    const body = (await res.json().catch(() => ({}))) as { id?: string };
    logger.info("Operator alert emailed", { to, id: body?.id });
    return `email:${body?.id ?? "sent"}`;
  } catch (err) {
    logger.error("Operator alert email threw", { err: err instanceof Error ? err.message : String(err) });
    return "email-threw";
  }
}

export default { sendWhatsApp, sendKyleWhatsApp };
