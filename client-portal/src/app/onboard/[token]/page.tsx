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

  return (
    <main className="min-h-screen bg-zinc-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <header className="mb-10">
          <div className="mb-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/ambitt-agents-lockup.svg" alt="Ambitt Agents" width={220} height={27} />
            <p className="text-xs uppercase tracking-wider text-[#00b3b3] font-semibold mt-3">Onboarding</p>
          </div>
          <h1 className="text-3xl font-semibold text-zinc-900 mb-3">Let&apos;s build your agent.</h1>
          <p className="text-sm text-zinc-700 leading-relaxed mb-2">
            Hi — I&apos;m <strong>Atlas</strong>, Ambitt&apos;s onboarding agent. The more you tell me here, the sharper the proposal I&apos;ll put together for you.
          </p>
          <p className="text-sm text-zinc-600 leading-relaxed">
            When you hit send, I&apos;ll review your answers and email you a presentation of the agent we&apos;d build — usually within a day.
            Pricing comes after our team reviews the scope. Take your time; progress is saved.
          </p>
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
