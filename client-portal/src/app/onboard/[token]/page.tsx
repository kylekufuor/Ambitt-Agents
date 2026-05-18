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
            Reach out to Kyle if you&apos;d like to revisit your custom agent setup.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <header className="mb-10">
          <p className="text-xs uppercase tracking-wider text-zinc-500 font-medium mb-2">Ambitt Agents · Onboarding</p>
          <h1 className="text-3xl font-semibold text-zinc-900 mb-2">Let&apos;s build your agent.</h1>
          <p className="text-sm text-zinc-600 leading-relaxed">
            A few questions so I can put together a presentation of the agent we&apos;d build for you.
            No pricing yet — that comes later, after Kyle reviews. Save and come back any time.
          </p>
          <p className="text-sm text-zinc-500 mt-2">— Atlas, your onboarding agent</p>
        </header>

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
      </div>
    </main>
  );
}
