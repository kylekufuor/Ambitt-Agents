"use client";

import { useState, useEffect, useCallback } from "react";
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
  { label: "Run Agent", icon: Play, href: "/agents", color: "bg-violet-500" },
  { label: "Fleet Health", icon: Activity, href: "/oracle", color: "bg-emerald-500" },
  { label: "Approvals", icon: CheckCircle, href: "/oracle", color: "bg-amber-500", badgeKey: "approvals" as const },
  { label: "Create Agent", icon: Bot, href: "/agents/create", color: "bg-blue-500" },
  { label: "Improvements", icon: Lightbulb, href: "/oracle", color: "bg-pink-500" },
];

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

  const radius = 240;
  const spread = 220;
  const angleStep = spread / (actions.length - 1);

  return (
    <div className="flex flex-col items-center justify-center py-6">
      <div className="relative" style={{ width: "580px", height: "580px" }}>

        {/* Subtle shadow pool beneath orb */}
        <div className="absolute left-1/2 top-[55%] -translate-x-1/2 w-[200px] h-[40px] rounded-full bg-black/10 dark:bg-white/[0.03] blur-2xl" />

        {/* Outer rings */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[340px] h-[340px] rounded-full border border-neutral-300/30 dark:border-white/[0.06] animate-orb-spin-slow" />
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[290px] h-[290px] rounded-full border border-neutral-300/20 dark:border-white/[0.04] animate-orb-spin-reverse" />

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

        {/* The Orb — Dark Chrome Sphere (works on light + dark) */}
        <button
          onClick={() => setOpen(!open)}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 group cursor-pointer z-10"
          aria-label="Oracle Command Center"
        >
          {/* Ambient glow */}
          <div className="absolute -inset-12 rounded-full bg-neutral-400/10 dark:bg-white/[0.03] blur-3xl animate-pulse-slow" />

          {/* Sphere — large with breathing animation */}
          <div className={`relative w-[200px] h-[200px] rounded-full transition-all duration-700 ${
            open ? "scale-90" : "group-hover:scale-105 animate-breathe"
          }`}>

            {/* Base — dark gradient sphere */}
            <div className="absolute inset-0 rounded-full bg-gradient-to-b from-neutral-700 via-neutral-900 to-black shadow-2xl shadow-black/50" />

            {/* Top highlight — chrome reflection */}
            <div className="absolute inset-0 rounded-full bg-gradient-to-b from-white/30 via-transparent to-transparent" />

            {/* Upper caustic arc */}
            <div className="absolute top-2 left-1/2 -translate-x-1/2 w-[55%] h-[25%] rounded-full bg-white/20 blur-[4px]" />

            {/* Subtle mid reflection */}
            <div className="absolute top-[40%] left-[15%] w-[20%] h-[15%] rounded-full bg-white/[0.07] blur-[3px]" />

            {/* Edge rim light */}
            <div className="absolute inset-0 rounded-full ring-1 ring-white/[0.15]" />

            {/* Inner rotating ring */}
            <div className="absolute inset-5 rounded-full ring-1 ring-white/[0.08] animate-orb-rotate" style={{ animationDuration: "10s" }} />

            {/* Bottom reflection */}
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 w-[40%] h-[10%] rounded-full bg-white/[0.06] blur-[2px]" />

            {/* Center icon container */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className={`w-14 h-14 rounded-full bg-white/[0.08] flex items-center justify-center backdrop-blur-sm ring-1 ring-white/[0.1] transition-transform duration-500 ${
                open ? "rotate-180 scale-90" : "group-hover:scale-110"
              }`}>
                <Zap className="size-7 text-white drop-shadow-md" />
              </div>
            </div>
          </div>

          {/* Pending badge */}
          {!open && pendingCount && pendingCount > 0 && (
            <div className="absolute -top-1 -right-1 w-7 h-7 rounded-full bg-amber-500 text-black text-xs font-bold flex items-center justify-center ring-2 ring-background z-20">
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
    </div>
  );
}
