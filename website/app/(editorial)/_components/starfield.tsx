"use client";

import { useEffect, useRef } from "react";

/**
 * Xtract's night sky: a few hundred faint stars, each breathing on its own
 * cycle, on a canvas behind the hero. Drawn once and left still when the
 * visitor prefers reduced motion; paused whenever the hero is off screen or
 * the tab is hidden, so it never costs a frame while someone reads pricing.
 */
export function Starfield() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    type Star = { x: number; y: number; r: number; base: number; speed: number; phase: number; teal: boolean };
    let stars: Star[] = [];
    let w = 0;
    let h = 0;
    let dpr = 1;
    let raf = 0;
    let running = false;

    const seed = () => {
      const count = Math.round((w * h) / 4200);
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() < 0.12 ? 1.4 + Math.random() * 0.8 : 0.5 + Math.random() * 0.7,
        base: 0.25 + Math.random() * 0.55,
        speed: 0.4 + Math.random() * 1.4,
        phase: Math.random() * Math.PI * 2,
        teal: Math.random() < 0.18,
      }));
    };

    const resize = () => {
      const box = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = Math.max(1, Math.round(box.width));
      h = Math.max(1, Math.round(box.height));
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
      draw(performance.now());
    };

    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      const s = t / 1000;
      for (const st of stars) {
        const a = reduced ? st.base : st.base * (0.55 + 0.45 * Math.sin(s * st.speed + st.phase));
        ctx.beginPath();
        ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2);
        ctx.fillStyle = st.teal ? `rgba(120,230,225,${a})` : `rgba(230,240,238,${a})`;
        ctx.fill();
      }
    };

    const loop = (t: number) => {
      if (!running) return;
      draw(t);
      raf = requestAnimationFrame(loop);
    };
    const start = () => {
      if (running || reduced) return;
      running = true;
      raf = requestAnimationFrame(loop);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const io = new IntersectionObserver(([e]) => (e.isIntersecting && !document.hidden ? start() : stop()), { threshold: 0 });
    io.observe(canvas);
    const onVis = () => (document.hidden ? stop() : start());
    document.addEventListener("visibilitychange", onVis);

    return () => {
      stop();
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return (
    <div className="sky" aria-hidden="true">
      <canvas ref={ref} />
    </div>
  );
}
