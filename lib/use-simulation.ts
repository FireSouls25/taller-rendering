"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import { useRouter } from "next/navigation";
import type {
  Body,
  CollisionMode,
  RenderingMode,
  SimState,
  ViewMode,
} from "./types";
import { getInitialState } from "./scenarios";
import { applyCollisions, bodyRadius } from "./physics";
import { loadEngine } from "./wasm-loader";

export type DrawFn = () => void;

/** Fuente de verdad mutable de la simulación (la leen las vistas cada dibujo). */
export interface SimCore {
  bodies: Body[];
  time: number;
  speed: number;
  paused: boolean;
  gravityMul: number;
  collisions: CollisionMode;
  trails: boolean;
  selectedId: number | null;
  dragId: number | null;
  gen: number;
  view: ViewMode;
}

/** Lo mínimo que necesitan las vistas 2D/3D. */
export interface SimViews {
  core: SimCore;
  drawRef: MutableRefObject<DrawFn | null>;
  focusCameraRef: MutableRefObject<(() => void) | null>;
  select: (id: number | null) => void;
}

const VIEW_KEY = "gravitylab:view";

function storedView(): ViewMode {
  try {
    if (typeof window === "undefined") return "3d";
    return window.localStorage.getItem(VIEW_KEY) === "2d" ? "2d" : "3d";
  } catch {
    return "3d";
  }
}

function isWebglAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    const gl =
      c.getContext("webgl2", { failIfMajorPerformanceCaveat: false }) ??
      c.getContext("webgl", { failIfMajorPerformanceCaveat: false });
    if (!gl) return false;
    const lose = (gl as WebGLRenderingContext).getExtension(
      "WEBGL_lose_context"
    );
    lose?.loseContext();
    return true;
  } catch {
    return false;
  }
}

function randomDir3D(): [number, number, number] {
  const t = Math.random() * Math.PI * 2;
  const z = 2 * Math.random() - 1;
  const s = Math.sqrt(Math.max(0, 1 - z * z));
  return [s * Math.cos(t), s * Math.sin(t), z];
}

export function useSimulation(opts: { initial: SimState; mode: RenderingMode }) {
  const { initial, mode } = opts;
  const router = useRouter();

  const [bodies, setBodies] = useState<Body[]>(() =>
    initial.bodies.map((b) => ({ ...b }))
  );
  const [fps, setFps] = useState(0);
  const [time, setTime] = useState(0);
  const [backend, setBackend] = useState("…");
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [trails, setTrails] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [collisions, setCollisions] = useState<CollisionMode>("merge");
  const [gravityMul, setGravityMul] = useState(1);
  const [view, setView] = useState<ViewMode>(storedView);
  const [webglOk, setWebglOk] = useState<boolean | null>(null);

  const coreRef = useRef<SimCore>({
    bodies: bodies.map((b) => ({ ...b })),
    time: 0,
    speed: 1,
    paused: false,
    gravityMul: 1,
    collisions: "merge",
    trails: true,
    selectedId: null,
    dragId: null,
    gen: 0,
    view: "3d",
  });
  const core = coreRef.current;

  const drawRef = useRef<DrawFn | null>(null);
  const focusCameraRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    setWebglOk(isWebglAvailable());
  }, []);

  // Sin WebGL la vista 3D es imposible: fuerza 2D.
  useEffect(() => {
    if (webglOk === false) {
      core.view = "2d";
      setView("2d");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webglOk]);

  const sync = useCallback(() => {
    setBodies([...core.bodies]);
  }, [core]);

  // El escenario cambia por navegación (mismo montaje en CSR/SSR):
  // reinicia la simulación de inmediato con el nuevo estado inicial.
  useEffect(() => {
    const fresh = initial.bodies.map((b) => ({ ...b }));
    if (core.view === "2d") {
      for (const b of fresh) {
        b.z = 0;
        b.vz = 0;
      }
    }
    core.bodies = fresh;
    core.time = 0;
    core.selectedId = null;
    core.dragId = null;
    core.gen++;
    setSelectedId(null);
    setTime(0);
    setBodies(fresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  const select = useCallback(
    (id: number | null) => {
      core.selectedId = id;
      setSelectedId(id);
    },
    [core]
  );

  // ---- acciones ----
  const togglePaused = useCallback(() => {
    core.paused = !core.paused;
    setPaused(core.paused);
  }, [core]);

  const changeSpeed = useCallback(
    (v: number) => {
      core.speed = v;
      setSpeed(v);
    },
    [core]
  );

  const changeTrails = useCallback(
    (v: boolean) => {
      core.trails = v;
      setTrails(v);
    },
    [core]
  );

  const changeCollisions = useCallback(
    (m: CollisionMode) => {
      core.collisions = m;
      setCollisions(m);
    },
    [core]
  );

  const changeGravityMul = useCallback(
    (v: number) => {
      core.gravityMul = v;
      setGravityMul(v);
    },
    [core]
  );

  const changeView = useCallback(
    (v: ViewMode) => {
      if (v === "3d" && webglOk === false) return;
      if (v === "2d") {
        for (const b of core.bodies) {
          b.z = 0;
          b.vz = 0;
        }
      }
      core.view = v;
      core.gen++;
      setView(v);
      sync();
      try {
        window.localStorage.setItem(VIEW_KEY, v);
      } catch {
        /* sin almacenamiento */
      }
    },
    [core, sync, webglOk]
  );

  const reset = useCallback(() => {
    const fresh = getInitialState(initial.scenario, initial.seed);
    if (core.view === "2d") {
      for (const b of fresh.bodies) {
        b.z = 0;
        b.vz = 0;
      }
    }
    core.bodies = fresh.bodies.map((b) => ({ ...b }));
    core.time = 0;
    core.selectedId = null;
    core.gen++;
    setSelectedId(null);
    setTime(0);
    sync();
  }, [core, initial.scenario, initial.seed, sync]);

  const randomize = useCallback(() => {
    const fresh = getInitialState(
      initial.scenario,
      Math.floor(Math.random() * 1_000_000)
    );
    if (core.view === "2d") {
      for (const b of fresh.bodies) {
        b.z = 0;
        b.vz = 0;
      }
    }
    core.bodies = fresh.bodies.map((b) => ({ ...b }));
    core.time = 0;
    core.selectedId = null;
    core.gen++;
    setSelectedId(null);
    setTime(0);
    sync();
  }, [core, initial.scenario, sync]);

  const nextId = useCallback(() => {
    return core.bodies.reduce((mx, b) => Math.max(mx, b.id), 0) + 1;
  }, [core]);

  const addBody = useCallback(
    (mass: number) => {
      const m = Math.max(0.5, Number.isFinite(mass) ? mass : 10);
      const palette = ["#38bdf8", "#a78bfa", "#34d399", "#f472b6", "#facc15"];
      const id = nextId();
      if (core.view === "3d") {
        const [dx, dy, dz] = randomDir3D();
        const r = 200 + Math.random() * 160;
        core.bodies.push({
          id,
          x: dx * r,
          y: dy * r,
          z: dz * r,
          vx: -dy * 45,
          vy: dx * 45,
          vz: (Math.random() - 0.5) * 30,
          mass: m,
          radius: bodyRadius(m),
          color: palette[id % palette.length],
          gMul: 1,
        });
      } else {
        const angle = Math.random() * Math.PI * 2;
        const r = 180 + Math.random() * 120;
        core.bodies.push({
          id,
          x: Math.cos(angle) * r,
          y: Math.sin(angle) * r,
          z: 0,
          vx: -Math.sin(angle) * 45,
          vy: Math.cos(angle) * 45,
          vz: 0,
          mass: m,
          radius: bodyRadius(m),
          color: palette[id % palette.length],
          gMul: 1,
        });
      }
      sync();
    },
    [core, nextId, sync]
  );

  /** Dispara asteroides rápidos desde el borde hacia el centro. */
  const shootAsteroid = useCallback(
    (count = 1) => {
      const palette = ["#fdba74", "#fca5a5", "#fcd34d", "#d6d3d1"];
      for (let k = 0; k < count; k++) {
        const id = nextId() + k;
        const speedShot = 150 + Math.random() * 110;
        if (core.view === "3d") {
          const [dx, dy, dz] = randomDir3D();
          const r = 640;
          const px = dx * r;
          const py = dy * r;
          const pz = dz * r;
          // Hacia el centro + desvío tangencial para órbitas rasantes.
          const tx = -dy;
          const ty = dx;
          const off = (Math.random() - 0.3) * 110;
          const m = 1 + Math.random() * 4;
          core.bodies.push({
            id,
            x: px,
            y: py,
            z: pz,
            vx: -dx * speedShot + tx * off,
            vy: -dy * speedShot + ty * off,
            vz: -dz * speedShot + (Math.random() - 0.5) * 60,
            mass: m,
            radius: bodyRadius(m),
            color: palette[Math.floor(Math.random() * palette.length)],
            gMul: 1,
          });
        } else {
          const angle = Math.random() * Math.PI * 2;
          const r = 560;
          const dx = Math.cos(angle);
          const dy = Math.sin(angle);
          const off = (Math.random() - 0.3) * 100;
          const m = 1 + Math.random() * 4;
          core.bodies.push({
            id,
            x: dx * r,
            y: dy * r,
            z: 0,
            vx: -dx * speedShot - dy * off,
            vy: -dy * speedShot + dx * off,
            vz: 0,
            mass: m,
            radius: bodyRadius(m),
            color: palette[Math.floor(Math.random() * palette.length)],
            gMul: 1,
          });
        }
      }
      sync();
    },
    [core, nextId, sync]
  );

  const deleteSelected = useCallback(() => {
    if (core.selectedId == null) return;
    core.bodies = core.bodies.filter((b) => b.id !== core.selectedId);
    core.selectedId = null;
    setSelectedId(null);
    sync();
  }, [core, sync]);

  const updateSelected = useCallback(
    (patch: Partial<Body>) => {
      if (core.selectedId == null) return;
      core.bodies = core.bodies.map((b) => {
        if (b.id !== core.selectedId) return b;
        const next = { ...b, ...patch, id: b.id, color: b.color };
        if (patch.mass != null) next.radius = bodyRadius(patch.mass);
        return next;
      });
      sync();
    },
    [core, sync]
  );

  const gotoScenario = useCallback(
    (s: string) => {
      if (mode === "CSR") router.push(`/csr?scenario=${s}`);
      else if (mode === "SSR") router.push(`/ssr?scenario=${s}`);
      else if (mode === "SSG") router.push(`/ssg/${s}`);
      else router.push(`/isr/${s}`);
    },
    [mode, router]
  );

  // ---- bucle maestro: física + dibujo ----
  useEffect(() => {
    let raf = 0;
    let alive = true;
    let last = performance.now();
    let frames = 0;
    let fpsT = last;
    let engine: { step: (b: Body[], dt: number, G: number) => void } | null =
      null;
    loadEngine().then((e) => {
      if (!alive) return;
      engine = e;
      setBackend(e.isWasm ? "WASM" : "TS");
    });

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      last = now;
      frames++;
      if (now - fpsT >= 500) {
        setFps(Math.round((frames * 1000) / (now - fpsT)));
        frames = 0;
        fpsT = now;
      }
      if (!core.paused && engine && core.dragId == null) {
        const simDt = initial.dt * core.speed;
        const steps = core.speed > 2 ? 2 : 1;
        const G = initial.G * core.gravityMul;
        for (let i = 0; i < steps; i++) {
          engine.step(core.bodies, simDt / steps, G);
        }
        applyCollisions(core.bodies, core.collisions);
        core.time += simDt;
        if (
          core.selectedId != null &&
          !core.bodies.some((b) => b.id === core.selectedId)
        ) {
          core.selectedId = null;
          setSelectedId(null);
        }
        setBodies([...core.bodies]);
        setTime(core.time);
      } else if (core.dragId != null) {
        setBodies([...core.bodies]);
      }
      drawRef.current?.();
    };
    raf = requestAnimationFrame(frame);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  const selected = bodies.find((b) => b.id === selectedId) ?? null;

  const views: SimViews = {
    core,
    drawRef,
    focusCameraRef,
    select,
  };

  return {
    views,
    bodies,
    fps,
    time,
    backend,
    paused,
    speed,
    trails,
    selectedId,
    selected,
    collisions,
    gravityMul,
    view,
    webglOk,
    focusCamera: () => focusCameraRef.current?.(),
    togglePaused,
    changeSpeed,
    changeTrails,
    changeCollisions,
    changeGravityMul,
    changeView,
    reset,
    randomize,
    addBody,
    shootAsteroid,
    deleteSelected,
    updateSelected,
    gotoScenario,
  };
}

export type Simulation = ReturnType<typeof useSimulation>;
