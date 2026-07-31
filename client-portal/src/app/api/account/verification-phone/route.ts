import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase-server";
import prisma from "@/lib/db";
import { toE164 } from "@/lib/phone";

/* ---------------------------------------------------------------------------
   The mobile a verification code gets texted to.

   Deliberately its own field and its own endpoint, not a corner of the
   WhatsApp settings. The client hands this over for ONE purpose — receiving a
   login code so their agent can finish signing in on their behalf — and the
   only way that stays true is if nothing else reads it. Client.whatsappNumber
   is the WhatsApp channel and is read by other comms; putting a codes-only
   number there would quietly widen what it is used for.

   The number is written against the client resolved from the SESSION, never
   from anything in the request body, so one client cannot set another's.
   --------------------------------------------------------------------------- */

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const raw = body?.phone;

  // An empty string is a deliberate "remove it", not a validation failure.
  const clearing = typeof raw === "string" && raw.trim() === "";
  const phone = clearing ? null : toE164(raw);
  if (!clearing && !phone) {
    return NextResponse.json(
      { error: "That does not look like a mobile number. Try it with the area code, like 918 555 0142." },
      { status: 400 },
    );
  }

  const client = await prisma.client.findUnique({
    where: { email: user.email },
    select: { id: true },
  });
  if (!client) return NextResponse.json({ error: "No account found" }, { status: 404 });

  await prisma.client.update({
    where: { id: client.id },
    data: { verificationPhone: phone, verificationPhoneAt: phone ? new Date() : null },
  });

  return NextResponse.json({ phone });
}
