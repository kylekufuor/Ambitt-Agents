"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Bot,
  Activity,
  Play,
  CheckCircle,
  Lightbulb,
  Zap,
} from "lucide-react";

const actions = [
  { label: "Create Agent", icon: Bot, href: "/oracle", color: "from-blue-500 to-cyan-400" },
  { label: "Fleet Health", icon: Activity, href: "/oracle", color: "from-emerald-500 to-green-400" },
  { label: "Run Agent", icon: Play, href: "/agents", color: "from-violet-500 to-purple-400" },
  { label: "Approvals", icon: CheckCircle, href: "/oracle", color: "from-amber-500 to-yellow-400", badgeKey: "approvals" as const },
  { label: "Improvements", icon: Lightbulb, href: "/oracle", color: "from-pink-500 to-rose-400" },
];

// Seeded PRNG for deterministic particles (no hydration mismatch)
function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const PARTICLE_COUNT = 40;
const rand = seededRandom(42);
const particleConfigs = Array.from({ length: PARTICLE_COUNT }, (_, i) => {
  const r1 = rand(), r2 = rand(), r3 = rand(), r4 = rand(), r5 = rand(), r6 = rand(), r7 = rand();
  return {
    id: i,
    size: 1 + r1 * 3,
    orbitRadius: 120 + r2 * 200,
    angle: r3 * 360,
    duration: 8 + r4 * 20,
    delay: r5 * -20,
    opacity: 0.15 + r6 * 0.5,
    drift: -30 + r7 * 60,
    color: r1 > 0.6 ? "bg-cyan-400" : r3 > 0.3 ? "bg-emerald-400" : "bg-white",
  };
});

export function OracleOrb({ pendingCount }: { pendingCount?: number }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape" && open) setOpen(false);
  }, [open]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const radius = 280;
  const spread = 220;
  const angleStep = spread / (actions.length - 1);

  return (
    <div className="flex flex-col items-center justify-center py-6">
      {/* Orb Container */}
      <div className="relative" style={{ width: "600px", height: "600px" }}>

        {/* Particle field */}
        {particleConfigs.map((p) => (
          <div
            key={p.id}
            className="absolute left-1/2 top-1/2 pointer-events-none"
            style={{
              width: `${p.size}px`,
              height: `${p.size}px`,
              animation: `orbit-particle ${p.duration}s linear infinite`,
              animationDelay: `${p.delay}s`,
              // CSS custom properties for the animation
              ["--orbit-radius" as string]: `${p.orbitRadius}px`,
              ["--start-angle" as string]: `${p.angle}deg`,
              ["--drift" as string]: `${p.drift}px`,
            }}
          >
            <div
              className={`w-full h-full rounded-full ${p.color}`}
              style={{ opacity: p.opacity }}
            />
          </div>
        ))}

        {/* Ambient gradient rings */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-gradient-to-br from-emerald-500/5 to-cyan-500/5 blur-3xl animate-pulse-slow" />
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full border border-emerald-500/5 animate-orb-spin-slow" />
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] rounded-full border border-cyan-500/8 animate-orb-spin-reverse" />
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[280px] h-[280px] rounded-full border border-emerald-500/10 animate-orb-rotate" style={{ animationDuration: "20s" }} />

        {/* Gradient sweeper rings */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[420px] h-[420px] rounded-full animate-orb-rotate" style={{ animationDuration: "15s" }}>
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-20 h-1 bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent rounded-full blur-sm" />
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-16 h-1 bg-gradient-to-r from-transparent via-cyan-500/20 to-transparent rounded-full blur-sm" />
        </div>
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[320px] h-[320px] rounded-full animate-orb-spin-reverse" style={{ animationDuration: "12s" }}>
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-1 bg-gradient-to-r from-transparent via-emerald-400/40 to-transparent rounded-full blur-[1px]" />
          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-12 bg-gradient-to-b from-transparent via-cyan-400/30 to-transparent rounded-full blur-[1px]" />
        </div>

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
                  <div className={`w-16 h-16 rounded-full bg-gradient-to-br ${action.color} flex items-center justify-center shadow-lg shadow-black/40 group-hover:scale-110 transition-transform`}>
                    <action.icon className="size-7 text-white" />
                  </div>
                  {action.badgeKey === "approvals" && pendingCount && pendingCount > 0 && (
                    <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-amber-500 text-black text-[11px] font-bold flex items-center justify-center ring-2 ring-background">
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

        {/* The Orb — dead center */}
        <button
          onClick={() => setOpen(!open)}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 group cursor-pointer z-10"
          aria-label="Oracle Command Center"
        >
          {/* Outermost ambient glow */}
          <div className="absolute -inset-24 rounded-full bg-gradient-to-br from-emerald-500/8 to-cyan-500/5 blur-3xl animate-pulse-slow" />

          {/* Ping ring */}
          <div className="absolute -inset-8 rounded-full bg-emerald-500/10 animate-ping-slow" />

          {/* Layered glow rings */}
          <div className="absolute -inset-6 rounded-full bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 blur-xl group-hover:from-emerald-500/35 group-hover:to-cyan-500/35 transition-all duration-700" />
          <div className="absolute -inset-3 rounded-full bg-gradient-to-br from-emerald-500/25 to-cyan-500/30 blur-lg" />
          <div className="absolute -inset-1 rounded-full bg-gradient-to-br from-emerald-400/30 to-cyan-400/30 blur-md" />

          {/* Core orb — 5x bigger (120px) */}
          <div className={`relative w-[120px] h-[120px] rounded-full flex items-center justify-center transition-all duration-500 ${
            open
              ? "bg-gradient-to-br from-emerald-400 via-cyan-400 to-teal-400 shadow-2xl shadow-emerald-500/50 scale-90"
              : "bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500 shadow-xl shadow-emerald-500/30 group-hover:shadow-2xl group-hover:shadow-emerald-500/50 group-hover:scale-105"
          }`}>
            {/* Rotating gradient overlay */}
            <div className="absolute inset-0 rounded-full bg-gradient-conic from-white/15 via-transparent to-white/10 animate-orb-rotate" style={{ animationDuration: "6s" }} />

            {/* Inner rings */}
            <div className="absolute inset-3 rounded-full border border-white/15 animate-orb-rotate" />
            <div className="absolute inset-6 rounded-full border border-white/10 animate-orb-spin-reverse" style={{ animationDuration: "8s" }} />

            {/* Inner highlight */}
            <div className="absolute inset-4 rounded-full bg-gradient-to-br from-white/25 to-transparent" />
            <div className="absolute inset-8 rounded-full bg-gradient-to-br from-white/20 to-transparent blur-[2px]" />

            {/* Center bright spot */}
            <div className="absolute inset-10 rounded-full bg-white/10 blur-sm animate-pulse-slow" />

            {/* Oracle icon */}
            <Zap className={`size-12 text-white relative z-10 drop-shadow-lg transition-transform duration-500 ${open ? "rotate-180 scale-90" : "group-hover:scale-110"}`} />
          </div>

          {/* Pending badge on orb */}
          {!open && pendingCount && pendingCount > 0 && (
            <div className="absolute -top-1 -right-1 w-7 h-7 rounded-full bg-amber-500 text-black text-xs font-bold flex items-center justify-center ring-2 ring-background z-20">
              {pendingCount}
            </div>
          )}
        </button>
      </div>

      {/* Label below orb */}
      <p className={`text-muted-foreground text-sm transition-opacity duration-300 ${open ? "opacity-0" : "opacity-100"}`}>
        Click to command
      </p>

      {!open && pendingCount && pendingCount > 0 && (
        <div className="flex items-center gap-2 mt-3 bg-amber-500/10 text-amber-400 px-3 py-1.5 rounded-lg text-xs font-semibold ring-1 ring-amber-500/20">
          <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
          {pendingCount} awaiting approval
        </div>
      )}
    </div>
  );
}
