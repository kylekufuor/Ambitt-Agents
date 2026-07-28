import logger from "./logger.js";
import { sendSms, smsConfigured } from "./sms.js";
import { sendOperatorEmail } from "./whatsapp.js";

// ---------------------------------------------------------------------------
// Operator alerts — SMS first, email fallback.
// ---------------------------------------------------------------------------
// Safety alerts (seatbelt trips, spike auto-pause, budget, build crashes) MUST
// reach the operator. WhatsApp is retired platform-wide, so the primary channel
// is now a plain text to the operator's phone — the same chain the 2FA relay
// uses (shared/sms.ts). Outbound SMS is A2P-blocked today (carrier registration
// pending) and Twilio isn't fully configured on prod, so smsConfigured() is
// false and every alert degrades to operator email. That degradation is the
// normal path right now, not an error case.
//
// Never throws. A dead alert channel must not crash the caller — an alert that
// blows up the code path that raised it is worse than a missed alert.
//
// NOTE: the operator's phone number is still read from the legacy
// KYLE_WHATSAPP_NUMBER env var. It holds a plain E.164 number and is the only
// operator-phone variable that exists today; it is used here as an SMS
// destination, not a WhatsApp one. It should be renamed to something like
// OPERATOR_PHONE_NUMBER — that's an env change on Railway, i.e. Kyle's call,
// not something this code should shim around.
// ---------------------------------------------------------------------------

/**
 * Send an operator alert. Tries SMS, falls back to email, never throws.
 * Returns a channel marker ("sms:<sid>" | "email:<id>" | "no-channel" |
 * "alert-failed") for logging and tests.
 */
export async function alertOperator(message: string): Promise<string> {
  const phone = process.env.KYLE_WHATSAPP_NUMBER;

  if (phone && smsConfigured()) {
    try {
      // audience:"operator" — alerts are Kyle-facing, so they skip the
      // client-copy em-dash scrub in shared/sms.ts and go out verbatim.
      const sid = await sendSms({ to: phone, message, audience: "operator" });
      return `sms:${sid}`;
    } catch (err) {
      logger.warn("Operator SMS failed — falling back to email", {
        err: err instanceof Error ? err.message : String(err),
      });
    }
  } else {
    logger.info("SMS unavailable for operator alert — sending via email", {
      hasPhone: !!phone,
      smsConfigured: smsConfigured(),
    });
  }

  try {
    return await sendOperatorEmail(message);
  } catch (err) {
    // sendOperatorEmail is best-effort by contract, but belt-and-braces: the
    // alert path itself must never throw into the caller.
    logger.error("Operator alert had no working channel", {
      err: err instanceof Error ? err.message : String(err),
    });
    return "alert-failed";
  }
}

export default { alertOperator };
