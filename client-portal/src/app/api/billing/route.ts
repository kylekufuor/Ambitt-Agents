import { createClient } from "@/lib/supabase-server";
import prisma from "@/lib/db";
import Stripe from "stripe";
import { NextResponse, type NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const client = await prisma.client.findUnique({
    where: { email: user.email },
    select: { stripeCustomerId: true },
  });

  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  const session = await stripe.billingPortal.sessions.create({
    customer: client.stripeCustomerId,
    return_url: `${request.nextUrl.origin}/`,
  });

  return NextResponse.json({ url: session.url });
}
