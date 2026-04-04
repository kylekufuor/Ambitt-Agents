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

export async function sendKyleWhatsApp(message: string): Promise<string> {
  const kyleNumber = process.env.KYLE_WHATSAPP_NUMBER;
  if (!kyleNumber) throw new Error("KYLE_WHATSAPP_NUMBER is not set");
  return sendWhatsApp({ to: kyleNumber, message });
}

export default { sendWhatsApp, sendKyleWhatsApp };
