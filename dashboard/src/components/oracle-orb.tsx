"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Bot,
  Activity,
  Play,
  CheckCircle,
  Lightbulb,
} from "lucide-react";
import { AtlasOrb, type OrbState } from "@/components/atlas-orb/atlas-orb";

const actions = [
  { label: "Run Agent", icon: Play, href: "/agents", color: "bg-violet-500" },
  { label: "Fleet Health", icon: Activity, href: "/oracle", color: "bg-emerald-500" },
  { label: "Approvals", icon: CheckCircle, href: "/oracle", color: "bg-amber-500", badgeKey: "approvals" as const },
  { label: "Create Agent", icon: Bot, href: "/agents/create", color: "bg-blue-500" },
  { label: "Improvements", icon: Lightbulb, href: "/oracle", color: "bg-pink-500" },
];

const DEMO_STATES: OrbState[] = ["idle", "listening", "thinking", "speaking"];

export function OracleOrb({ pendingCount }: { pendingCount?: number }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  // Orb state — V1 demos via ?orbDemo=1; V2 wires this to the ElevenLabs
  // session lifecycle (connect → listening, agent thinking → thinking,
  // agent audio → speaking).
  const [orbState, setOrbState] = useState<OrbState>("idle");
  const [demoMode, setDemoMode] = useState(false);
  const levelRef = useRef(0);

  useEffect(() => {
    // Read the query param post-mount — avoids useSearchParams' Suspense
    // requirement for a dev-only toggle.
    setDemoMode(new URLSearchParams(window.location.search).has("orbDemo"));
  }, []);

  // Fake voice signal while demoing "speaking" — composite of slow phrase
  // cadence + fast syllable jitter, close enough to judge the visual.
  useEffect(() => {
    if (!demoMode || orbState !== "speaking") {
      levelRef.current = 0;
      return;
    }
    let raf = 0;
    const start = performance.now();
    const loop = () => {
      const t = (performance.now() - start) / 1000;
      const phrase = Math.max(0, Math.sin(t * 0.9));
      const syllables = 0.5 + 0.5 * Math.sin(t * 11 + Math.sin(t * 5.3) * 2.0);
      levelRef.current = Math.min(1, phrase * (0.35 + syllables * 0.65));
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [demoMode, orbState]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape" && open) setOpen(false);
  }, [open]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const radius = 240;
  const spread = 220;
  const angleStep = spread / (actions.length - 1);

  return (
    <div className="flex flex-col items-center justify-center py-6">
      <div className="relative" style={{ width: "580px", height: "580px" }}>

        {/* Orbital rings */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full border border-neutral-300/30 dark:border-white/[0.06] animate-orb-spin-slow" />
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] rounded-full border border-neutral-300/20 dark:border-white/[0.04] animate-orb-spin-reverse" />

        {/* Radial Actions */}
        {actions.map((action, i) => {
          const angleDeg = -90 - spread / 2 + i * angleStep;
          const angleRad = (angleDeg * Math.PI) / 180;
          const x = Math.cos(angleRad) * radius;
          const y = Math.sin(angleRad) * radius;

          return (
            <div
              key={action.label}
              className="absolute transition-all duration-500 ease-out z-20"
              style={{
                left: "50%",
                top: "50%",
                transform: open
                  ? `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) scale(1)`
                  : "translate(-50%, -50%) scale(0)",
                opacity: open ? 1 : 0,
                transitionDelay: open ? `${i * 60}ms` : "0ms",
              }}
            >
              <button
                onClick={() => { setOpen(false); router.push(action.href); }}
                className="group flex flex-col items-center gap-2"
              >
                <div className="relative">
                  <div className={`w-14 h-14 rounded-full ${action.color} flex items-center justify-center shadow-lg shadow-black/20 group-hover:scale-110 transition-transform`}>
                    <action.icon className="size-6 text-white" />
                  </div>
                  {action.badgeKey === "approvals" && pendingCount && pendingCount > 0 && (
                    <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-amber-500 text-black text-[10px] font-bold flex items-center justify-center ring-2 ring-background">
                      {pendingCount}
                    </div>
                  )}
                </div>
                <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors whitespace-nowrap">
                  {action.label}
                </span>
              </button>
            </div>
          );
        })}

        {/* The Orb — the observable universe */}
        <button
          onClick={() => setOpen(!open)}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 group cursor-pointer z-10"
          aria-label="Atlas Command"
        >
          {/* The hologram floats bare — no glow pools, no shadows, no discs */}
          <div className={`relative rounded-full transition-all duration-700 ${
            open ? "scale-90" : "group-hover:scale-[1.03]"
          }`}>
            <AtlasOrb state={orbState} levelRef={levelRef} size={300} />
          </div>

          {/* Pending badge */}
          {!open && pendingCount && pendingCount > 0 && (
            <div className="absolute top-3 right-3 w-7 h-7 rounded-full bg-amber-500 text-black text-xs font-bold flex items-center justify-center ring-2 ring-background z-20">
              {pendingCount}
            </div>
          )}
        </button>
      </div>

      {/* Label */}
      <p className={`text-muted-foreground/60 text-sm transition-opacity duration-300 ${open ? "opacity-0" : "opacity-100"}`}>
        Click to command
      </p>

      {!open && pendingCount && pendingCount > 0 && (
        <div className="flex items-center gap-2 mt-3 bg-amber-500/10 text-amber-400 px-3 py-1.5 rounded-lg text-xs font-semibold ring-1 ring-amber-500/20">
          <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
          {pendingCount} awaiting approval
        </div>
      )}

      {/* Demo state switcher — only with ?orbDemo=1. Lets the operator
          preview listening/thinking/speaking before the voice loop exists. */}
      {demoMode && (
        <div className="flex items-center gap-1.5 mt-4 bg-card border border-border rounded-full px-2 py-1.5">
          {DEMO_STATES.map((s) => (
            <button
              key={s}
              onClick={() => setOrbState(s)}
              className={`text-xs font-medium px-3 py-1 rounded-full transition-colors ${
                orbState === s
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
