"use client";

import { useEffect, useRef } from "react";
import type { Body } from "@/lib/types";
import type { SimViews } from "@/lib/use-simulation";

const WORLD = 420; // semiextensión del mundo visible (zoom base)

/** Vista 2D (proyección XY): solo dibuja. La física la avanza el bucle maestro. */
export function View2D({ sim }: { sim: SimViews }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const wrap = canvas.parentElement as HTMLElement;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const trailPts = new Map<number, { x: number; y: number }[]>();
    let lastGen = -1;

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    const toScreen = (x: number, y: number, w: number, h: number) => {
      const scale = Math.min(w, h) / 2 / WORLD;
      return { sx: w / 2 + x * scale, sy: h / 2 - y * scale, scale };
    };

    let dragId: number | null = null;
    let dragOffset = { x: 0, y: 0 };
    let flingFrom: { x: number; y: number; t: number } | null = null;

    const posFromEvent = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const sx = (e.clientX - rect.left) * dpr;
      const sy = (e.clientY - rect.top) * dpr;
      const scale = Math.min(canvas.width, canvas.height) / 2 / WORLD;
      return {
        x: (sx - canvas.width / 2) / scale,
        y: (canvas.height / 2 - sy) / scale,
      };
    };

    const onDown = (e: PointerEvent) => {
      const p = posFromEvent(e);
      let best: Body | null = null;
      let bestD = 1e9;
      for (const b of sim.core.bodies) {
        const d = Math.hypot(b.x - p.x, b.y - p.y);
        const grab = Math.max(b.radius * 2.2, 18);
        if (d < grab && d < bestD) {
          best = b;
          bestD = d;
        }
      }
      if (best) {
        dragId = best.id;
        sim.core.dragId = best.id;
        dragOffset = { x: best.x - p.x, y: best.y - p.y };
        flingFrom = { x: p.x, y: p.y, t: performance.now() };
        sim.select(best.id);
        canvas.setPointerCapture(e.pointerId);
      } else {
        sim.select(null);
      }
    };
    const onMove = (e: PointerEvent) => {
      if (dragId == null) return;
      const p = posFromEvent(e);
      const b = sim.core.bodies.find((x) => x.id === dragId);
      if (b) {
        b.x = p.x + dragOffset.x;
        b.y = p.y + dragOffset.y;
        if (flingFrom) {
          const dt = Math.max((performance.now() - flingFrom.t) / 1000, 1e-3);
          b.vx = (p.x - flingFrom.x) / dt / 8;
          b.vy = (p.y - flingFrom.y) / dt / 8;
        }
      }
    };
    const onUp = () => {
      dragId = null;
      sim.core.dragId = null;
      flingFrom = null;
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);

    const draw = () => {
      const arr = sim.core.bodies;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.width;
      const h = canvas.height;
      if (w < 2 || h < 2) return;
      ctx.fillStyle = "#070b16";
      ctx.fillRect(0, 0, w, h);

      if (lastGen !== sim.core.gen) {
        lastGen = sim.core.gen;
        trailPts.clear();
      }

      ctx.strokeStyle = "rgba(148,163,184,0.08)";
      ctx.lineWidth = 1;
      const grid = 48 * dpr;
      ctx.beginPath();
      for (let x = 0; x <= w; x += grid) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
      }
      for (let y = 0; y <= h; y += grid) {
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
      }
      ctx.stroke();

      if (sim.core.trails) {
        for (const b of arr) {
          let t = trailPts.get(b.id);
          if (!t) {
            t = [];
            trailPts.set(b.id, t);
          }
          const s = toScreen(b.x, b.y, w, h);
          const lastPt = t[t.length - 1];
          if (!lastPt || Math.hypot(lastPt.x - s.sx, lastPt.y - s.sy) > 2 * dpr) {
            t.push({ x: s.sx, y: s.sy });
            if (t.length > 60) t.shift();
          }
          if (t.length > 1) {
            ctx.strokeStyle = b.color + "55";
            ctx.lineWidth = 1.2 * dpr;
            ctx.beginPath();
            ctx.moveTo(t[0].x, t[0].y);
            for (const pt of t) ctx.lineTo(pt.x, pt.y);
            ctx.stroke();
          }
        }
      } else {
        trailPts.clear();
      }

      for (const b of arr) {
        const { sx, sy, scale } = toScreen(b.x, b.y, w, h);
        const r = Math.max(b.radius * scale, 2.5 * dpr);
        const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 3);
        glow.addColorStop(0, b.color);
        glow.addColorStop(1, "transparent");
        ctx.fillStyle = glow;
        ctx.globalAlpha = 0.35;
        ctx.beginPath();
        ctx.arc(sx, sy, r * 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = b.color;
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fill();
        if (b.id === dragId || b.id === sim.core.selectedId) {
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 1.5 * dpr;
          ctx.beginPath();
          ctx.arc(sx, sy, r + 4 * dpr, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    };
    sim.drawRef.current = draw;

    return () => {
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      if (sim.drawRef.current === draw) sim.drawRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="canvas-wrap">
      <canvas ref={canvasRef} className="canvas" />
    </div>
  );
}
