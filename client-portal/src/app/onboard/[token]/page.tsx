import { notFound } from "next/navigation";
import prisma from "@/lib/db";
import { OnboardForm } from "./form";
import "./form.css";

export const dynamic = "force-dynamic";

// Same three-robot lockup the funnel uses, kept inline so the closed state
// renders pixel-identical to the live flow even if a CDN blips.
function AmbittMark({ width = 44, height = 22 }: { width?: number; height?: number }) {
  return (
    <svg viewBox="0 0 86 42" width={width} height={height} xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <g transform="translate(43, 22)">
        {[-28, 0, 28].map((tx) => (
          <g key={tx} transform={`translate(${tx}, 0)`}>
            <rect x={-9} y={-2} width={18} height={18} rx={5} fill="#171717" />
            <circle cx={0} cy={-11} r={6.5} fill="#171717" />
            <rect x={-4} y={-12.25} width={8} height={2.5} rx={1.25} fill="#00b3b3" />
          </g>
        ))}
      </g>
    </svg>
  );
}

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
      <div className="fa-onboard">
        <div className="fa-header welcome">
          <div className="fa-brand">
            <AmbittMark />
            AMBITT AGENTS
          </div>
        </div>
        <div className="fa-stage">
          <div className="fa-hero" style={{ paddingTop: 48 }}>
            <div className="fa-agent-frame"><AmbittMark width={40} height={20} /></div>
            <div className="fa-hero-pill">Link paused</div>
            <div className="fa-h-title">This link has wrapped up.</div>
            <p className="fa-hero-body">
              Your onboarding link isn&apos;t active anymore — either the brief already went through, or it&apos;s been a while since it was opened.
            </p>
            <p className="fa-hero-body">
              Still want the agent we sketched out for you? We&apos;d love to pick it back up. Just reply to any note from us, or reach the team at{" "}
              <a href="mailto:hello@ambitt.agency" style={{ color: "#007373", fontWeight: 600 }}>hello@ambitt.agency</a>{" "}
              and we&apos;ll send a fresh link.
            </p>
          </div>
        </div>
      </div>
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
