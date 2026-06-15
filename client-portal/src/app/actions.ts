"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";

/**
 * Shared server actions used across the portal.
 *
 * Lives at /app/actions.ts so client components (account menu, future
 * inline-edit forms, etc.) can import these without circular issues.
 * Per Next.js docs: `"use server"` at the top of the file marks every
 * exported function as a Server Function callable from either side.
 */

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
