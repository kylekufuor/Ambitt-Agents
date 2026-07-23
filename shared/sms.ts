import twilio from "twilio";
import logger from "./logger.js";

// ---------------------------------------------------------------------------
// Plain SMS via Twilio — sister to shared/whatsapp.ts, minus the "whatsapp:"
// address prefix. First (and currently only) consumer is the MFA relay
// (shared/mfa-relay.ts): the 2FA code arrives on the client's phone as a text,
// so the ask goes out as a text. No 24h-window/template constraints apply.
//
// Dependency-free by design (twilio + logger only) — dry-run interception is
// the caller's job, where the agentId/decision context lives.
// ---------------------------------------------------------------------------

function getClient(): twilio.Twilio {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) throw new Error("Twilio credentials not set");
  return twilio(sid, token);
}

/**
 * True iff the platform can send SMS right now. TWILIO_SMS_NUMBER is the
 * canonical from-number; the TWILIO_WHATSAPP_NUMBER read is a one-line
 * fallback only (both are +18178097106 today — don't rely on it surviving).
 */
export function smsConfigured(): boolean {
  return !!(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    (process.env.TWILIO_SMS_NUMBER || process.env.TWILIO_WHATSAPP_NUMBER)
  );
}

interface SmsOptions {
  to: string;
  message: string;
}

export async function sendSms(
  options: SmsOptions,
  retries = 3
): Promise<string> {
  const { to, message } = options;
  const from =
    process.env.TWILIO_SMS_NUMBER || process.env.TWILIO_WHATSAPP_NUMBER;
  if (!from) throw new Error("TWILIO_SMS_NUMBER is not set");

  const client = getClient();

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const result = await client.messages.create({
        body: message,
        from,
        to,
      });

      logger.info("SMS sent", { to, sid: result.sid });
      return result.sid;
    } catch (error) {
      // Never log the message body at error level — MFA-relay copy names the
      // service being signed into; the number + error is enough to debug.
      logger.error(`SMS attempt ${attempt}/${retries} failed`, {
        error,
        to,
      });
      if (attempt === retries) throw error;
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }

  throw new Error("SMS send failed after all retries");
}

export default { sendSms, smsConfigured };
