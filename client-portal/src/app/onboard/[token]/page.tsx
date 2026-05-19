import { notFound } from "next/navigation";
import prisma from "@/lib/db";
import { OnboardForm } from "./form";

export const dynamic = "force-dynamic";

export default async function OnboardPage(
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const prospect = await prisma.prospect.findUnique({
    where: { token },
    select: {
      id: true,
      email: true,
      status: true,
      contactName: true,
      businessName: true,
      role: true,
      website: true,
      formData: true,
    },
  });

  if (!prospect) notFound();

  if (prospect.status === "archived" || prospect.status === "ghosted") {
    return (
      <main className="min-h-screen bg-white flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold text-zinc-900 mb-2">This onboarding link is closed</h1>
          <p className="text-sm text-zinc-600">
            Get in touch if you&apos;d like to revisit your custom agent setup.
          </p>
        </div>
      </main>
    );
  }

  // The form owns the full layout (progress bar, header lockup, slideshow).
  // No outer Next layout wrappers here — the design needs edge-to-edge canvas.
  return (
    <OnboardForm
      token={token}
      prospectId={prospect.id}
      initial={{
        contactName: prospect.contactName ?? "",
        email: prospect.email,
        businessName: prospect.businessName ?? "",
        role: prospect.role ?? "",
        website: prospect.website ?? "",
        ...((prospect.formData as Record<string, string>) ?? {}),
      }}
      status={prospect.status}
    />
  );
}
