"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Body, RenderingMode, SimState } from "@/lib/types";
import { getInitialState } from "@/lib/scenarios";
import { loadEngine } from "@/lib/wasm-loader";

interface Props {
  initial: SimState;
  mode: RenderingMode;
  generatedAt: string;
  nextRegenAt?: string;
  /** Se llama si WebGL falla (contexto no creado o perdido) para usar la reserva 2D. */
  onWebglFail?: () => void;
}

const CANVAS_H = 480;
const TRAIL_LEN = 90;
const MAX_FLING = 500;

function makeGlowTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.35, "rgba(255,255,255,0.4)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

interface BodyView {
  mesh: THREE.Mesh;
  mat: THREE.MeshStandardMaterial;
  glow: THREE.Sprite;
  trail: THREE.Line;
  trailPos: THREE.BufferAttribute;
  hist: number[];
}

export function GravityCanvas3D({ initial, mode, generatedAt, nextRegenAt, onWebglFail }: Props) {
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
  const trailsRef = useRef(trails);
  trailsRef.current = trails;
  const selectedRef = useRef<number | null>(selectedId);
  selectedRef.current = selectedId;
  const genRef = useRef(0);
  const cameraResetRef = useRef<(() => void) | null>(null);
  const failRef = useRef(onWebglFail);
  failRef.current = onWebglFail;

  // Reinicia cuando el estado inicial del servidor cambia (escenario/modo).
  useEffect(() => {
    setBodies(initial.bodies.map((b) => ({ ...b })));
    setSimTime(0);
    simRef.current.time = 0;
    setSelectedId(null);
    genRef.current++;
  }, [initial]);

  const reset = useCallback(() => {
    const fresh = getInitialState(initial.scenario, initial.seed);
    setBodies(fresh.bodies.map((b) => ({ ...b })));
    simRef.current.time = 0;
    setSimTime(0);
    genRef.current++;
  }, [initial.scenario, initial.seed]);

  const randomize = useCallback(() => {
    const fresh = getInitialState(
      initial.scenario,
      Math.floor(Math.random() * 1_000_000)
    );
    setBodies(fresh.bodies.map((b) => ({ ...b })));
    simRef.current.time = 0;
    setSimTime(0);
    genRef.current++;
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

  const centerCamera = useCallback(() => {
    cameraResetRef.current?.();
  }, []);

  const selected = useMemo(
    () => bodies.find((b) => b.id === selectedId) ?? null,
    [bodies, selectedId]
  );

  // ---- bucle principal: física (WASM preferido) + render 3D (Three.js) ----
  useEffect(() => {
    const canvas = canvasRef.current!;
    const wrap = wrapRef.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    } catch {
      // Sin contexto WebGL (navegador sandbox, sin GPU): el envoltorio usa 2D.
      failRef.current?.();
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;

    // Si el contexto se pierde en caliente, cambia a la reserva 2D.
    const onLost = (e: Event) => {
      e.preventDefault();
      failRef.current?.();
    };
    canvas.addEventListener("webglcontextlost", onLost);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05070f);

    const camera = new THREE.PerspectiveCamera(55, 1, 1, 8000);
    const HOME_POS = new THREE.Vector3(0, -380, 430);
    camera.position.copy(HOME_POS);

    const controls = new OrbitControls(camera, canvas);
    controls.target.set(0, 0, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 120;
    controls.maxDistance = 2000;
    cameraResetRef.current = () => {
      camera.position.copy(HOME_POS);
      controls.target.set(0, 0, 0);
    };

    scene.add(new THREE.AmbientLight(0xffffff, 1.1));
    const dir = new THREE.DirectionalLight(0xffffff, 1.6);
    dir.position.set(200, -120, 400);
    scene.add(dir);
    const sunLight = new THREE.PointLight(0xfff1c9, 3, 3000, 1);
    sunLight.position.set(0, 0, 80);
    scene.add(sunLight);

    // Campo de estrellas
    {
      const N = 900;
      const pos = new Float32Array(N * 3);
      const col = new Float32Array(N * 3);
      const c = new THREE.Color();
      for (let i = 0; i < N; i++) {
        const r = 1300 + Math.random() * 1100;
        const t = Math.random() * Math.PI * 2;
        const p = Math.acos(2 * Math.random() - 1);
        pos[i * 3] = r * Math.sin(p) * Math.cos(t);
        pos[i * 3 + 1] = r * Math.sin(p) * Math.sin(t);
        pos[i * 3 + 2] = Math.abs(r * Math.cos(p)) * 0.6 - 200;
        c.setHSL(0.55 + Math.random() * 0.12, 0.5, 0.55 + Math.random() * 0.35);
        col[i * 3] = c.r;
        col[i * 3 + 1] = c.g;
        col[i * 3 + 2] = c.b;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      g.setAttribute("color", new THREE.BufferAttribute(col, 3));
      const m = new THREE.PointsMaterial({
        size: 3,
        vertexColors: true,
        transparent: true,
        opacity: 0.9,
        sizeAttenuation: true,
      });
      scene.add(new THREE.Points(g, m));
    }

    // Rejilla de referencia del plano orbital
    const grid = new THREE.GridHelper(1700, 34, 0x1e3a5f, 0x0e1a33);
    grid.rotation.x = Math.PI / 2;
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.35;
    scene.add(grid);

    const sphereGeo = new THREE.SphereGeometry(1, 32, 32);
    const glowTex = makeGlowTexture();
    const ringGeo = new THREE.RingGeometry(0.86, 1, 48);
    const ring = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
      })
    );
    ring.visible = false;
    scene.add(ring);

    const views = new Map<number, BodyView>();
    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();
    const planeZ0 = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const hitPoint = new THREE.Vector3();

    const createView = (b: Body): BodyView => {
      const color = new THREE.Color(b.color);
      const mat = new THREE.MeshStandardMaterial({
        color: color.clone().multiplyScalar(0.55),
        emissive: color,
        emissiveIntensity: 0.9,
        roughness: 0.35,
        metalness: 0.15,
      });
      const mesh = new THREE.Mesh(sphereGeo, mat);
      mesh.userData.bodyId = b.id;
      scene.add(mesh);

      const glow = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowTex,
          color,
          transparent: true,
          opacity: 0.5,
          depthWrite: false,
        })
      );
      scene.add(glow);

      const tg = new THREE.BufferGeometry();
      const arr = new Float32Array(TRAIL_LEN * 3);
      const attr = new THREE.BufferAttribute(arr, 3);
      tg.setAttribute("position", attr);
      tg.setDrawRange(0, 0);
      const trail = new THREE.Line(
        tg,
        new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.55 })
      );
      trail.frustumCulled = false;
      scene.add(trail);

      const view: BodyView = { mesh, mat, glow, trail, trailPos: attr, hist: [] };
      views.set(b.id, view);
      return view;
    };

    const removeView = (id: number) => {
      const v = views.get(id);
      if (!v) return;
      scene.remove(v.mesh, v.glow, v.trail);
      v.mat.dispose();
      (v.glow.material as THREE.Material).dispose();
      (v.trail.material as THREE.Material).dispose();
      v.trail.geometry.dispose();
      views.delete(id);
    };

    let engine: { step: (b: Body[], dt: number, G: number) => void } | null = null;
    loadEngine().then((e) => {
      engine = e;
      setWasmLabel(e.isWasm ? "✓ WASM" : "TS (reserva)");
    });

    const resize = () => {
      const w = wrap.clientWidth || 1;
      renderer.setSize(w, CANVAS_H, false);
      camera.aspect = w / CANVAS_H;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    // ---- arrastre / impulso de cuerpos ----
    let dragId: number | null = null;
    const dragOffset = new THREE.Vector3();
    const samples: { x: number; y: number; t: number }[] = [];
    let downXY = { x: 0, y: 0 };
    let downHit = false;

    const setNdc = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    };
    const pickBody = (e: PointerEvent): number | null => {
      setNdc(e);
      raycaster.setFromCamera(pointerNdc, camera);
      const hits = raycaster.intersectObjects(
        [...views.values()].map((v) => v.mesh),
        false
      );
      if (hits.length === 0) return null;
      return (hits[0].object.userData.bodyId as number) ?? null;
    };
    const planePos = (e: PointerEvent): THREE.Vector3 | null => {
      setNdc(e);
      raycaster.setFromCamera(pointerNdc, camera);
      return raycaster.ray.intersectPlane(planeZ0, hitPoint) ? hitPoint : null;
    };

    const onDown = (e: PointerEvent) => {
      downXY = { x: e.clientX, y: e.clientY };
      const id = pickBody(e);
      downHit = id != null;
      if (id == null) return;
      const p = planePos(e);
      const b = bodiesRef.current.find((x) => x.id === id);
      if (!b || !p) return;
      dragId = id;
      dragOffset.set(b.x - p.x, b.y - p.y, 0);
      samples.length = 0;
      samples.push({ x: b.x, y: b.y, t: performance.now() });
      setSelectedId(id);
      controls.enabled = false;
      canvas.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (dragId == null) return;
      const p = planePos(e);
      const b = bodiesRef.current.find((x) => x.id === dragId);
      if (!b || !p) return;
      b.x = p.x + dragOffset.x;
      b.y = p.y + dragOffset.y;
      const now = performance.now();
      samples.push({ x: b.x, y: b.y, t: now });
      while (samples.length > 8) samples.shift();
      const old = samples[0];
      const dt = Math.max((now - old.t) / 1000, 1e-3);
      let vx = (b.x - old.x) / dt / 4;
      let vy = (b.y - old.y) / dt / 4;
      const sp = Math.hypot(vx, vy);
      if (sp > MAX_FLING) {
        vx = (vx / sp) * MAX_FLING;
        vy = (vy / sp) * MAX_FLING;
      }
      b.vx = vx;
      b.vy = vy;
    };
    const onUp = (e: PointerEvent) => {
      if (dragId == null) {
        // Clic en el vacío = deseleccionar
        const moved = Math.hypot(e.clientX - downXY.x, e.clientY - downXY.y);
        if (moved < 5 && !downHit) setSelectedId(null);
        return;
      }
      dragId = null;
      samples.length = 0;
      controls.enabled = true;
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);

    // ---- fotogramas ----
    let raf = 0;
    let last = performance.now();
    let frames = 0;
    let fpsT = last;
    let lastGen = genRef.current;

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

      if (lastGen !== genRef.current) {
        lastGen = genRef.current;
        for (const v of views.values()) {
          v.hist.length = 0;
          v.trailPos.needsUpdate = true;
          v.trail.geometry.setDrawRange(0, 0);
        }
      }

      if (!p && engine && dragId == null) {
        const simDt = initial.dt * sp;
        const steps = sp > 2 ? 2 : 1;
        for (let i = 0; i < steps; i++) engine.step(arr, simDt / steps, initial.G);
        simRef.current.time += simDt;
        setBodies([...arr]);
        setSimTime(simRef.current.time);
      } else if (dragId != null) {
        setBodies([...arr]);
      }

      // Concilia mallas 3D con los cuerpos
      const ids = new Set(arr.map((b) => b.id));
      for (const id of [...views.keys()]) {
        if (!ids.has(id)) removeView(id);
      }

      let heaviest: Body | null = null;
      for (const b of arr) {
        if (!heaviest || b.mass > heaviest.mass) heaviest = b;
        let v = views.get(b.id);
        if (!v) v = createView(b);
        v.mesh.position.set(b.x, b.y, 0);
        v.mesh.scale.setScalar(Math.max(b.radius, 0.5));
        v.glow.position.set(b.x, b.y, 0);
        const gs = Math.max(b.radius * 7, 12);
        v.glow.scale.set(gs, gs, 1);

        if (trailsRef.current && dragId == null) {
          const h = v.hist;
          const lx = h[h.length - 2];
          const ly = h[h.length - 1];
          if (
            lx === undefined ||
            Math.hypot(b.x - lx, b.y - ly) > Math.max(b.radius * 0.15, 0.8)
          ) {
            h.push(b.x, b.y);
            if (h.length > TRAIL_LEN * 2) h.splice(0, h.length - TRAIL_LEN * 2);
          }
        }
        const posAttr = v.trailPos;
        const n = v.hist.length / 2;
        const a = posAttr.array as Float32Array;
        for (let i = 0; i < n; i++) {
          a[i * 3] = v.hist[i * 2];
          a[i * 3 + 1] = v.hist[i * 2 + 1];
          a[i * 3 + 2] = 0;
        }
        posAttr.needsUpdate = true;
        v.trail.geometry.setDrawRange(0, n);
        v.trail.visible = trailsRef.current && n > 1;
      }

      if (heaviest) sunLight.position.set(heaviest.x, heaviest.y, 90);

      // Anillo de selección
      const sel = selectedRef.current;
      const selBody = sel != null ? arr.find((b) => b.id === sel) : undefined;
      if (selBody) {
        ring.visible = true;
        ring.position.set(selBody.x, selBody.y, 0);
        ring.scale.setScalar(selBody.radius * 1.9 + 3);
      } else {
        ring.visible = false;
      }

      controls.update();
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("webglcontextlost", onLost);
      controls.dispose();
      for (const id of [...views.keys()]) removeView(id);
      sphereGeo.dispose();
      ringGeo.dispose();
      (ring.material as THREE.Material).dispose();
      glowTex.dispose();
      scene.clear();
      renderer.dispose();
      cameraResetRef.current = null;
    };
  }, [initial]);

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
        <span className="pill">Vista: 3D</span>
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
        <button className="btn" onClick={centerCamera}>
          🎥 Centrar cámara
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
            para impulsarlo · arrastra el fondo para orbitar · rueda para zoom
          </span>
        )}
      </div>
    </div>
  );
}
