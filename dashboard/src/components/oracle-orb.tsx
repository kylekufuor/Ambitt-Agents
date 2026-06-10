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
import {
  ConversationProvider,
  useConversationControls,
  useConversationStatus,
  useConversationMode,
} from "@elevenlabs/react";
import { AtlasOrb, type OrbState } from "@/components/atlas-orb/atlas-orb";

// Radial destinations follow the relocated surfaces: approvals queue lives
// on /agents, fleet-health + improvement runs live on /activity.
const actions = [
  { label: "Run Agent", icon: Play, href: "/agents", color: "bg-violet-500" },
  { label: "Fleet Health", icon: Activity, href: "/activity", color: "bg-emerald-500" },
  { label: "Approvals", icon: CheckCircle, href: "/agents", color: "bg-amber-500", badgeKey: "approvals" as const },
  { label: "Create Agent", icon: Bot, href: "/agents/create", color: "bg-blue-500" },
  { label: "Improvements", icon: Lightbulb, href: "/activity", color: "bg-pink-500" },
];

const DEMO_STATES: OrbState[] = ["idle", "listening", "thinking", "speaking"];

interface TranscriptLine {
  source: "user" | "atlas";
  text: string;
}

export function OracleOrb({
  pendingCount,
  voiceEnabled = false,
}: {
  pendingCount?: number;
  voiceEnabled?: boolean;
}) {
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  return (
    <ConversationProvider
      onMessage={({ message, source }: { message: string; source: string }) => {
        setTranscript((prev) =>
          [...prev, { source: source === "user" ? ("user" as const) : ("atlas" as const), text: message }].slice(-12)
        );
      }}
      onError={(message: string) => {
        console.error("[atlas-voice]", message);
        setVoiceError(typeof message === "string" ? message : "Voice session error");
      }}
      onDisconnect={() => setTranscript([])}
    >
      <OrbInner
        pendingCount={pendingCount}
        voiceEnabled={voiceEnabled}
        transcript={transcript}
        voiceError={voiceError}
        clearVoiceError={() => setVoiceError(null)}
      />
    </ConversationProvider>
  );
}

function OrbInner({
  pendingCount,
  voiceEnabled,
  transcript,
  voiceError,
  clearVoiceError,
}: {
  pendingCount?: number;
  voiceEnabled: boolean;
  transcript: TranscriptLine[];
  voiceError: string | null;
  clearVoiceError: () => void;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const { startSession, endSession, getOutputVolume } = useConversationControls();
  const { status } = useConversationStatus();
  const { isSpeaking } = useConversationMode();

  const sessionActive = status === "connected" || status === "connecting";

  // Orb state — live session drives it when active; demo controls otherwise.
  const [demoState, setDemoState] = useState<OrbState>("idle");
  const [demoMode, setDemoMode] = useState(false);
  // Context capacity 0..1 — placeholder until live Fable telemetry lands.
  const [capacity, setCapacity] = useState(1);
  const levelRef = useRef(0);
  const [connecting, setConnecting] = useState(false);

  const orbState: OrbState = sessionActive
    ? status === "connecting"
      ? "thinking"
      : isSpeaking
        ? "speaking"
        : "listening"
    : demoMode
      ? demoState
      : "idle";

  useEffect(() => {
    setDemoMode(new URLSearchParams(window.location.search).has("orbDemo"));
  }, []);

  // Live audio → orb. While connected, sample Atlas's output volume every
  // frame into levelRef; the orb's render loop reads it without re-renders.
  useEffect(() => {
    if (status !== "connected") return;
    let raf = 0;
    const loop = () => {
      try {
        levelRef.current = Math.min(1, getOutputVolume() * 1.6);
      } catch {
        levelRef.current = 0;
      }
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => {
      cancelAnimationFrame(raf);
      levelRef.current = 0;
    };
  }, [status, getOutputVolume]);

  // Demo voice-cadence oscillator (only when no live session).
  useEffect(() => {
    if (sessionActive || !demoMode || demoState !== "speaking") {
      if (!sessionActive) levelRef.current = 0;
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
  }, [sessionActive, demoMode, demoState]);

  const wake = useCallback(async () => {
    clearVoiceError();
    setConnecting(true);
    try {
      const res = await fetch("/api/atlas-voice/signed-url", { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Signed URL failed (${res.status})`);
      }
      const { signedUrl } = (await res.json()) as { signedUrl: string };
      await startSession({ signedUrl });
    } catch (err) {
      console.error("[atlas-voice] wake failed", err);
      clearVoiceError();
      // Surface inline — the overlay isn't up yet on early failures.
      alert(err instanceof Error ? err.message : "Could not reach Atlas");
    } finally {
      setConnecting(false);
    }
  }, [startSession, clearVoiceError]);

  const sleep = useCallback(async () => {
    try {
      await endSession();
    } catch {
      /* already closed */
    }
  }, [endSession]);

  const handleOrbClick = useCallback(() => {
    if (sessionActive) {
      void sleep();
      return;
    }
    if (voiceEnabled && !connecting) {
      void wake();
    } else if (!voiceEnabled) {
      setOpen((o) => !o);
    }
  }, [sessionActive, voiceEnabled, connecting, wake, sleep]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (sessionActive) void sleep();
      else if (open) setOpen(false);
    },
    [open, sessionActive, sleep]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const radius = 285;
  const spread = 220;
  const angleStep = spread / (actions.length - 1);

  const lastAtlasLine = [...transcript].reverse().find((l) => l.source === "atlas");
  const lastUserLine = [...transcript].reverse().find((l) => l.source === "user");

  // ── Full-screen HUD takeover ─────────────────────────────────────────────
  if (sessionActive) {
    return (
      <div className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center">
        <button onClick={() => void sleep()} aria-label="End Atlas session" className="cursor-pointer">
          <AtlasOrb state={orbState} levelRef={levelRef} capacity={capacity} size={520} />
        </button>

        {/* Status readout */}
        <div className="mt-2 text-[11px] tracking-[0.3em] uppercase text-amber-200/70 font-mono">
          {status === "connecting" ? "Connecting" : isSpeaking ? "Atlas speaking" : "Listening"}
        </div>

        {/* Live transcript — last exchange */}
        <div className="mt-6 max-w-2xl px-8 text-center space-y-2 min-h-[72px]">
          {lastUserLine && (
            <p className="text-white/40 text-sm leading-relaxed">{lastUserLine.text}</p>
          )}
          {lastAtlasLine && (
            <p className="text-amber-100/90 text-base leading-relaxed">{lastAtlasLine.text}</p>
          )}
          {voiceError && <p className="text-red-400 text-sm">{voiceError}</p>}
        </div>

        {/* Context bar */}
        <div className="absolute bottom-10 flex items-center gap-3">
          <span className="text-[11px] uppercase tracking-wider text-white/30">Context</span>
          <div className="w-56 h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${Math.round(capacity * 100)}%`,
                background: `linear-gradient(90deg, rgb(255, ${Math.round(80 + 130 * capacity)}, ${Math.round(30 + 60 * capacity)}), rgb(255, ${Math.round(120 + 100 * capacity)}, ${Math.round(40 + 100 * capacity)}))`,
              }}
            />
          </div>
          <span className="text-[11px] font-mono text-white/50 tabular-nums w-8">
            {Math.round(capacity * 100)}%
          </span>
        </div>

        <p className="absolute bottom-4 text-white/20 text-xs">
          Click the core or press Esc to end
        </p>
      </div>
    );
  }

  // ── Resting state — Atlas's room ─────────────────────────────────────────
  return (
    <div className="flex flex-col items-center justify-center py-6">
      <div className="relative" style={{ width: "660px", height: "660px" }}>

        {/* Orbital rings */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[560px] h-[560px] rounded-full border border-neutral-300/30 dark:border-white/[0.06] animate-orb-spin-slow" />
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[495px] h-[495px] rounded-full border border-neutral-300/20 dark:border-white/[0.04] animate-orb-spin-reverse" />

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

        {/* The Orb — click to wake Atlas (voice) or open the radial menu;
            right-click always opens the radial menu when voice is on. */}
        <button
          onClick={handleOrbClick}
          onContextMenu={(e) => {
            if (voiceEnabled) {
              e.preventDefault();
              setOpen((o) => !o);
            }
          }}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 group cursor-pointer z-10"
          aria-label={voiceEnabled ? "Talk to Atlas" : "Atlas Command"}
        >
          <div className={`relative rounded-full transition-all duration-700 ${
            open ? "scale-90" : "group-hover:scale-[1.03]"
          }`}>
            <AtlasOrb state={orbState} levelRef={levelRef} capacity={capacity} size={430} />
          </div>

          {/* Pending badge */}
          {!open && pendingCount && pendingCount > 0 && (
            <div className="absolute top-8 right-8 w-7 h-7 rounded-full bg-amber-500 text-black text-xs font-bold flex items-center justify-center ring-2 ring-background z-20">
              {pendingCount}
            </div>
          )}
        </button>
      </div>

      {/* Label */}
      <p className={`text-muted-foreground/60 text-sm transition-opacity duration-300 ${open ? "opacity-0" : "opacity-100"}`}>
        {connecting
          ? "Reaching Atlas…"
          : voiceEnabled
            ? "Click to talk · right-click for actions"
            : "Click to command"}
      </p>

      {/* Context bar — fill + hue track the same capacity signal as the orb */}
      <div className={`flex items-center gap-3 mt-4 transition-opacity duration-300 ${open ? "opacity-0" : "opacity-100"}`}>
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground/60">Context</span>
        <div className="w-56 h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${Math.round(capacity * 100)}%`,
              background: `linear-gradient(90deg, rgb(255, ${Math.round(80 + 130 * capacity)}, ${Math.round(30 + 60 * capacity)}), rgb(255, ${Math.round(120 + 100 * capacity)}, ${Math.round(40 + 100 * capacity)}))`,
            }}
          />
        </div>
        <span className="text-[11px] font-mono text-muted-foreground tabular-nums w-8">
          {Math.round(capacity * 100)}%
        </span>
      </div>

      {/* Demo controls — only with ?orbDemo=1 */}
      {demoMode && (
        <div className="flex flex-col items-center gap-2 mt-4">
          <div className="flex items-center gap-1.5 bg-card border border-border rounded-full px-2 py-1.5">
            {DEMO_STATES.map((s) => (
              <button
                key={s}
                onClick={() => setDemoState(s)}
                className={`text-xs font-medium px-3 py-1 rounded-full transition-colors ${
                  demoState === s
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3 bg-card border border-border rounded-full px-4 py-1.5">
            <span className="text-xs text-muted-foreground whitespace-nowrap">context</span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(capacity * 100)}
              onChange={(e) => setCapacity(Number(e.target.value) / 100)}
              className="w-44 accent-amber-500"
            />
            <span className="text-xs font-mono text-foreground w-9 text-right">
              {Math.round(capacity * 100)}%
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
