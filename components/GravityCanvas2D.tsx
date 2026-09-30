"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Body, RenderingMode, SimState } from "@/lib/types";
import { getInitialState } from "@/lib/scenarios";
import { loadEngine } from "@/lib/wasm-loader";

interface Props {
  initial: SimState;
  mode: RenderingMode;
  generatedAt: string;
  nextRegenAt?: string;
}

const WORLD = 420; // semiextensión del mundo visible (zoom base)
const CANVAS_H = 480;

/**
 * Reserva Canvas 2D. Misma física y mismos controles que el lienzo 3D;
 * se usa automáticamente cuando el navegador no ofrece WebGL.
 */
export function GravityCanvas2D({ initial, mode, generatedAt, nextRegenAt }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [bodies, setBodies] = useState<Body[]>(() =>
    initial.bodies.map((b) => ({ ...b }))
  );
  const bodiesRef = useRef<Body[]>(bodies);
  bodiesRef.current = bodies;

  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [trails, setTrails] = useState(true);
  const [wasmLabel, setWasmLabel] = useState("cargando…");
  const [fps, setFps] = useState(0);
  const [simTime, setSimTime] = useState(0);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [massInput, setMassInput] = useState("10");

  const simRef = useRef({ time: 0, speed: 1, paused: false });
  simRef.current.speed = speed;
  simRef.current.paused = paused;

  useEffect(() => {
    setBodies(initial.bodies.map((b) => ({ ...b })));
    setSimTime(0);
    simRef.current.time = 0;
    setSelectedId(null);
  }, [initial]);

  const reset = useCallback(() => {
    const fresh = getInitialState(initial.scenario, initial.seed);
    setBodies(fresh.bodies.map((b) => ({ ...b })));
    simRef.current.time = 0;
    setSimTime(0);
  }, [initial.scenario, initial.seed]);

  const randomize = useCallback(() => {
    const fresh = getInitialState(
      initial.scenario,
      Math.floor(Math.random() * 1_000_000)
    );
    setBodies(fresh.bodies.map((b) => ({ ...b })));
    simRef.current.time = 0;
    setSimTime(0);
  }, [initial.scenario]);

  const addBody = useCallback(() => {
    const m = Math.max(0.5, Number(massInput) || 10);
    setBodies((prev) => {
      const id = prev.reduce((mx, b) => Math.max(mx, b.id), 0) + 1;
      const angle = Math.random() * Math.PI * 2;
      const r = 180 + Math.random() * 120;
      const colors = ["#38bdf8", "#a78bfa", "#34d399", "#f472b6", "#facc15"];
      return [
        ...prev,
        {
          id,
          x: Math.cos(angle) * r,
          y: Math.sin(angle) * r,
          vx: -Math.sin(angle) * 45,
          vy: Math.cos(angle) * 45,
          mass: m,
          radius: Math.cbrt(m) * 1.6 + 2,
          color: colors[id % colors.length],
        },
      ];
    });
  }, [massInput]);

  const selected = useMemo(
    () => bodies.find((b) => b.id === selectedId) ?? null,
    [bodies, selectedId]
  );

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let frames = 0;
    let fpsT = last;
    const trailPts = new Map<number, { x: number; y: number }[]>();
    let engine: { step: (b: Body[], dt: number, G: number) => void } | null = null;

    loadEngine().then((e) => {
      engine = e;
      setWasmLabel(e.isWasm ? "✓ WASM" : "TS (reserva)");
    });

    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;

    const resize = () => {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(CANVAS_H * dpr));
      canvas.style.height = `${CANVAS_H}px`;
    };
    resize();
    window.addEventListener("resize", resize);

    const toScreen = (x: number, y: number, w: number, h: number) => {
      const scale = Math.min(w, h) / 2 / WORLD;
      return { sx: w / 2 + x * scale, sy: h / 2 - y * scale, scale };
    };

    let dragId: number | null = null;
    let dragOffset = { x: 0, y: 0 };
    let flingFrom: { x: number; y: number; t: number } | null = null;

    const posFromEvent = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const sx = px * dpr;
      const sy = py * dpr;
      const scale = Math.min(canvas.width, canvas.height) / 2 / WORLD;
      return {
        x: (sx - canvas.width / 2) / scale,
        y: (canvas.height / 2 - sy) / scale,
      };
    };

    const onDown = (e: PointerEvent) => {
      const p = posFromEvent(e);
      const arr = bodiesRef.current;
      let best: Body | null = null;
      let bestD = 1e9;
      for (const b of arr) {
        const d = Math.hypot(b.x - p.x, b.y - p.y);
        const grab = Math.max(b.radius * 2.2, 18);
        if (d < grab && d < bestD) {
          best = b;
          bestD = d;
        }
      }
      if (best) {
        dragId = best.id;
        dragOffset = { x: best.x - p.x, y: best.y - p.y };
        flingFrom = { x: p.x, y: p.y, t: performance.now() };
        setSelectedId(best.id);
        canvas.setPointerCapture(e.pointerId);
      } else {
        setSelectedId(null);
      }
    };
    const onMove = (e: PointerEvent) => {
      if (dragId == null) return;
      const p = posFromEvent(e);
      const arr = bodiesRef.current;
      const b = arr.find((x) => x.id === dragId);
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
      flingFrom = null;
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dtReal = Math.min((now - last) / 1000, 0.05);
      last = now;
      void dtReal;
      frames++;
      if (now - fpsT >= 500) {
        setFps(Math.round((frames * 1000) / (now - fpsT)));
        frames = 0;
        fpsT = now;
      }
      const { paused: p, speed: sp } = simRef.current;
      const arr = bodiesRef.current;

      if (!p && engine) {
        const simDt = initial.dt * sp;
        const steps = sp > 2 ? 2 : 1;
        for (let i = 0; i < steps; i++) engine.step(arr, simDt / steps, initial.G);
        if (dragId == null) simRef.current.time += simDt;
        setBodies([...arr]);
        setSimTime(simRef.current.time);
      }

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.width;
      const h = canvas.height;
      ctx.fillStyle = "#070b16";
      ctx.fillRect(0, 0, w, h);

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

      if (trails) {
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
        if (b.id === dragId || b.id === selectedId) {
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 1.5 * dpr;
          ctx.beginPath();
          ctx.arc(sx, sy, r + 4 * dpr, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
    };
  }, [initial, trails]);

  return (
    <div className="lab">
      <div className="hud">
        <span className="pill">Representación: {mode}</span>
        <span className="pill" title="Cuándo se produjo el estado inicial">
          Generado: {generatedAt}
        </span>
        {nextRegenAt && (
          <span className="pill" title="Ventana de revalidación ISR">
            Próx. regen: {nextRegenAt}
          </span>
        )}
        <span className="pill">Simulación: {wasmLabel}</span>
        <span className="pill">Vista: 2D</span>
        <span className="pill">Cuerpos: {bodies.length}</span>
        <span className="pill">FPS: {fps}</span>
        <span className="pill">Tiempo: {simTime.toFixed(1)}s</span>
      </div>

      <div ref={wrapRef} className="canvas-wrap">
        <canvas ref={canvasRef} className="canvas" />
      </div>

      <div className="controls">
        <button className="btn" onClick={() => setPaused((pa) => !pa)}>
          {paused ? "▶ Reanudar" : "⏸ Pausar"}
        </button>
        <button className="btn" onClick={reset}>
          Reiniciar
        </button>
        <button className="btn" onClick={addBody}>
          + Añadir cuerpo
        </button>
        <button className="btn" onClick={randomize}>
          🎲 Aleatorio
        </button>
        <label className="speed">
          Velocidad {speed.toFixed(1)}×
          <input
            type="range"
            min={0.1}
            max={4}
            step={0.1}
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
          />
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={trails}
            onChange={(e) => setTrails(e.target.checked)}
          />
          Estelas
        </label>
      </div>

      <div className="sandbox-row">
        <button
          className="btn small danger"
          disabled={selected == null}
          onClick={() => {
            if (selected == null) return;
            setBodies((prev) => prev.filter((b) => b.id !== selected.id));
            setSelectedId(null);
          }}
        >
          Eliminar seleccionado
        </button>
        <label className="mass">
          Masa del cuerpo nuevo
          <input
            className="input"
            value={massInput}
            onChange={(e) => setMassInput(e.target.value)}
            inputMode="decimal"
          />
        </label>
        {selected && (
          <span className="selected">
            Seleccionado #{selected.id} · m={selected.mass.toFixed(1)} · v=(
            {selected.vx.toFixed(1)}, {selected.vy.toFixed(1)}) · arrastra para
            mover, lanza para impulsar
          </span>
        )}
        {!selected && (
          <span className="selected dim">
            Clic en un cuerpo para seleccionar · arrástralo para mover · lánzalo
            para impulsarlo
          </span>
        )}
      </div>
    </div>
  );
}
