import { NextResponse, type NextRequest } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase-server";
import prisma from "@/lib/db";
import { publicOrigin } from "@/lib/public-url";

/**
 * Hands the client to Stripe's own billing portal for card and invoice
 * management.
 *
 * Deliberately a redirect and not a form. We never take a card number into
 * this app: no PCI surface, nothing to leak, and nothing to build. Stripe owns
 * the card, the invoices and the receipts, and the session below is scoped to
 * exactly one customer and expires on its own.
 *
 * GET rather than POST because it is reached from a plain link in the page and
 * has no side effect beyond minting a short-lived, single-customer session.
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return NextResponse.redirect(new URL("/login", publicOrigin(req)));
  }

  const client = await prisma.client.findUnique({
    where: { email: user.email },
    select: { stripeCustomerId: true },
  });
  // The session is minted for the customer id we look up from the SESSION, never
  // from anything the caller sends, so one client cannot open another's billing.
  if (!client?.stripeCustomerId) {
    return NextResponse.json(
      { error: "No billing account is attached to your login yet. Write to support@ambitt.agency." },
      { status: 404 },
    );
  }

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    console.error("[billing/portal] STRIPE_SECRET_KEY is not set");
    return NextResponse.json(
      { error: "Billing is temporarily unavailable. Write to support@ambitt.agency and we will sort it." },
      { status: 503 },
    );
  }

  try {
    const stripe = new Stripe(key);
    const session = await stripe.billingPortal.sessions.create({
      customer: client.stripeCustomerId,
      return_url: new URL("/billing", publicOrigin(req)).toString(),
    });
    return NextResponse.redirect(session.url, { status: 303 });
  } catch (err) {
    // Never leak Stripe's error text to the client; it names internal ids.
    console.error("[billing/portal] stripe session failed:", err);
    return NextResponse.json(
      { error: "We could not open your billing just now. Write to support@ambitt.agency." },
      { status: 502 },
    );
  }
}
