"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Body } from "@/lib/types";
import type { SimViews } from "@/lib/use-simulation";

const TRAIL_LEN = 110;
const MAX_FLING = 600;

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

/** Vista 3D: solo dibuja. La física la avanza el bucle maestro. */
export function View3D({ sim }: { sim: SimViews }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const wrap = canvas.parentElement as HTMLElement;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    } catch {
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05070f);

    const camera = new THREE.PerspectiveCamera(55, 1, 1, 9000);
    const HOME_POS = new THREE.Vector3(0, -430, 470);
    camera.position.copy(HOME_POS);

    const controls = new OrbitControls(camera, canvas);
    controls.target.set(0, 0, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 120;
    controls.maxDistance = 2600;
    sim.focusCameraRef.current = () => {
      camera.position.copy(HOME_POS);
      controls.target.set(0, 0, 0);
    };

    scene.add(new THREE.AmbientLight(0xffffff, 1.1));
    const dir = new THREE.DirectionalLight(0xffffff, 1.6);
    dir.position.set(200, -120, 400);
    scene.add(dir);
    const sunLight = new THREE.PointLight(0xfff1c9, 3, 4000, 1);
    sunLight.position.set(0, 0, 80);
    scene.add(sunLight);

    // Campo de estrellas
    {
      const N = 1000;
      const pos = new Float32Array(N * 3);
      const col = new Float32Array(N * 3);
      const c = new THREE.Color();
      for (let i = 0; i < N; i++) {
        const r = 1500 + Math.random() * 1400;
        const t = Math.random() * Math.PI * 2;
        const p = Math.acos(2 * Math.random() - 1);
        pos[i * 3] = r * Math.sin(p) * Math.cos(t);
        pos[i * 3 + 1] = r * Math.sin(p) * Math.sin(t);
        pos[i * 3 + 2] = Math.abs(r * Math.cos(p)) * 0.7 - 250;
        c.setHSL(0.55 + Math.random() * 0.12, 0.5, 0.55 + Math.random() * 0.35);
        col[i * 3] = c.r;
        col[i * 3 + 1] = c.g;
        col[i * 3 + 2] = c.b;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      g.setAttribute("color", new THREE.BufferAttribute(col, 3));
      scene.add(
        new THREE.Points(
          g,
          new THREE.PointsMaterial({
            size: 3.2,
            vertexColors: true,
            transparent: true,
            opacity: 0.9,
          })
        )
      );
    }

    // Rejilla del plano orbital XY
    const grid = new THREE.GridHelper(2000, 40, 0x1e3a5f, 0x0e1a33);
    grid.rotation.x = Math.PI / 2;
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.32;
    scene.add(grid);

    const sphereGeo = new THREE.SphereGeometry(1, 32, 32);
    const glowTex = makeGlowTexture();
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.86, 1, 48),
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
    const ndc = new THREE.Vector2();
    const hitPoint = new THREE.Vector3();
    const dragPlane = new THREE.Plane();
    let lastGen = -1;

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
      const attr = new THREE.BufferAttribute(new Float32Array(TRAIL_LEN * 3), 3);
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

    const resize = () => {
      const w = wrap.clientWidth || 1;
      const h = wrap.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    // ---- arrastre 3D sobre un plano orientado a la cámara ----
    let dragId: number | null = null;
    const samples: { x: number; y: number; z: number; t: number }[] = [];
    let downXY = { x: 0, y: 0 };
    let downHit = false;

    const setNdc = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    };
    const pickBody = (e: PointerEvent): number | null => {
      setNdc(e);
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObjects(
        [...views.values()].map((v) => v.mesh),
        false
      );
      if (hits.length === 0) return null;
      return (hits[0].object.userData.bodyId as number) ?? null;
    };

    const onDown = (e: PointerEvent) => {
      downXY = { x: e.clientX, y: e.clientY };
      const id = pickBody(e);
      downHit = id != null;
      if (id == null) return;
      const b = sim.core.bodies.find((x) => x.id === id);
      if (!b) return;
      // Plano que pasa por el cuerpo y mira a la cámara: movimiento 3D libre.
      const n = camera.position
        .clone()
        .sub(new THREE.Vector3(b.x, b.y, b.z))
        .normalize();
      dragPlane.setFromNormalAndCoplanarPoint(n, new THREE.Vector3(b.x, b.y, b.z));
      dragId = id;
      sim.core.dragId = id;
      samples.length = 0;
      samples.push({ x: b.x, y: b.y, z: b.z, t: performance.now() });
      sim.select(id);
      controls.enabled = false;
      canvas.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (dragId == null) return;
      setNdc(e);
      raycaster.setFromCamera(ndc, camera);
      if (!raycaster.ray.intersectPlane(dragPlane, hitPoint)) return;
      const b = sim.core.bodies.find((x) => x.id === dragId);
      if (!b) return;
      b.x = hitPoint.x;
      b.y = hitPoint.y;
      b.z = hitPoint.z;
      const now = performance.now();
      samples.push({ x: b.x, y: b.y, z: b.z, t: now });
      while (samples.length > 8) samples.shift();
      const old = samples[0];
      const dt = Math.max((now - old.t) / 1000, 1e-3);
      let vx = (b.x - old.x) / dt / 4;
      let vy = (b.y - old.y) / dt / 4;
      let vz = (b.z - old.z) / dt / 4;
      const sp = Math.sqrt(vx * vx + vy * vy + vz * vz);
      if (sp > MAX_FLING) {
        vx = (vx / sp) * MAX_FLING;
        vy = (vy / sp) * MAX_FLING;
        vz = (vz / sp) * MAX_FLING;
      }
      b.vx = vx;
      b.vy = vy;
      b.vz = vz;
    };
    const onUp = (e: PointerEvent) => {
      if (dragId == null) {
        const moved = Math.hypot(e.clientX - downXY.x, e.clientY - downXY.y);
        if (moved < 5 && !downHit) sim.select(null);
        return;
      }
      dragId = null;
      sim.core.dragId = null;
      samples.length = 0;
      controls.enabled = true;
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);

    // ---- dibujo (lo invoca el bucle maestro tras integrar) ----
    const draw = () => {
      const arr = sim.core.bodies;
      if (lastGen !== sim.core.gen) {
        lastGen = sim.core.gen;
        for (const v of views.values()) {
          v.hist.length = 0;
          v.trail.geometry.setDrawRange(0, 0);
        }
      }
      const ids = new Set(arr.map((b) => b.id));
      for (const id of [...views.keys()]) {
        if (!ids.has(id)) removeView(id);
      }
      let heaviest: Body | null = null;
      for (const b of arr) {
        if (!heaviest || b.mass > heaviest.mass) heaviest = b;
        let v = views.get(b.id);
        if (!v) v = createView(b);
        v.mesh.position.set(b.x, b.y, b.z);
        v.mesh.scale.setScalar(Math.max(b.radius, 0.5));
        v.glow.position.set(b.x, b.y, b.z);
        const gs = Math.max(b.radius * 7, 12);
        v.glow.scale.set(gs, gs, 1);

        if (sim.core.trails && dragId == null) {
          const h = v.hist;
          const lx = h[h.length - 3];
          const ly = h[h.length - 2];
          const lz = h[h.length - 1];
          const moved =
            lx === undefined ||
            Math.hypot(b.x - lx, b.y - ly, b.z - lz) >
              Math.max(b.radius * 0.15, 0.8);
          if (moved) {
            h.push(b.x, b.y, b.z);
            if (h.length > TRAIL_LEN * 3) h.splice(0, h.length - TRAIL_LEN * 3);
          }
        }
        const a = v.trailPos.array as Float32Array;
        const n = v.hist.length / 3;
        for (let i = 0; i < n; i++) {
          a[i * 3] = v.hist[i * 3];
          a[i * 3 + 1] = v.hist[i * 3 + 1];
          a[i * 3 + 2] = v.hist[i * 3 + 2];
        }
        v.trailPos.needsUpdate = true;
        v.trail.geometry.setDrawRange(0, n);
        v.trail.visible = sim.core.trails && n > 1;
      }
      if (heaviest) sunLight.position.set(heaviest.x, heaviest.y, heaviest.z + 90);

      const sel = sim.core.selectedId;
      const selBody = sel != null ? arr.find((b) => b.id === sel) : undefined;
      if (selBody) {
        ring.visible = true;
        ring.position.set(selBody.x, selBody.y, selBody.z);
        ring.scale.setScalar(selBody.radius * 1.9 + 3);
        ring.lookAt(camera.position);
      } else {
        ring.visible = false;
      }
      controls.update();
      renderer.render(scene, camera);
    };
    sim.drawRef.current = draw;

    return () => {
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      controls.dispose();
      for (const id of [...views.keys()]) removeView(id);
      sphereGeo.dispose();
      (ring.geometry as THREE.BufferGeometry).dispose();
      (ring.material as THREE.Material).dispose();
      glowTex.dispose();
      scene.clear();
      renderer.dispose();
      if (sim.drawRef.current === draw) sim.drawRef.current = null;
      sim.focusCameraRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="canvas-wrap">
      <canvas ref={canvasRef} className="canvas" />
    </div>
  );
}
