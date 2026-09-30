import type { Body } from "./types";
import { stepBodies } from "./physics";

/**
 * Prefiere el motor Rust/WASM cuando está disponible y usa el espejo
 * TypeScript en caso contrario.
 *
 * Estrategia de renderizado ≠ motor de simulación: CSR/SSR/SSG/ISR solo cambian
 * *de dónde viene el estado inicial*. El backend de integración es ortogonal.
 * Las colisiones siempre se resuelven en TS (tras el paso gravitatorio).
 */
export interface WasmEngine {
  step: (bodies: Body[], dt: number, G: number) => void;
  isWasm: boolean;
}

let cached: Promise<WasmEngine> | null = null;
let wasmOk = false;

export function isWasmActive(): boolean {
  return wasmOk;
}

async function tryLoadWasm(): Promise<WasmEngine | null> {
  try {
    // Generado con `npm run wasm:build` -> public/wasm/gravity_physics.{js,wasm}
    // Especificador no literal a propósito: evita la resolución estática de TS
    // y mantiene el import solo-cliente (ausente hasta compilar el wasm).
    const wasmUrl = "/wasm/gravity_physics.js";
    const mod = (await import(/* webpackIgnore: true */ wasmUrl).catch(
      () => null
    )) as {
      default?: (input?: unknown) => Promise<unknown>;
      step_bodies?: (
        xs: Float64Array,
        ys: Float64Array,
        zs: Float64Array,
        vxs: Float64Array,
        vys: Float64Array,
        vzs: Float64Array,
        masses: Float64Array,
        gMuls: Float64Array,
        dt: number,
        g: number
      ) => void;
    } | null;

    if (!mod) return null;
    if (typeof mod.default === "function") {
      await mod.default("/wasm/gravity_physics_bg.wasm").catch(() => null);
    }
    if (typeof mod.step_bodies !== "function") return null;
    // El pegamento debe exponer la firma 3D (10 parámetros); si es la
    // versión 2D antigua, se descarta y se usa TS.
    if (mod.step_bodies.length < 10) return null;

    const stepBodiesWasm = mod.step_bodies;
    // Prueba de humo: una llamada no debe lanzar.
    try {
      const t = (v: number) => new Float64Array([v]);
      stepBodiesWasm(t(0), t(0), t(0), t(0), t(0), t(0), t(1), t(1), 0.016, 40);
    } catch {
      return null;
    }

    wasmOk = true;
    const engine: WasmEngine = {
      isWasm: true,
      step: (bodies, dt, G) => {
        const n = bodies.length;
        const xs = new Float64Array(n);
        const ys = new Float64Array(n);
        const zs = new Float64Array(n);
        const vxs = new Float64Array(n);
        const vys = new Float64Array(n);
        const vzs = new Float64Array(n);
        const masses = new Float64Array(n);
        const gMuls = new Float64Array(n);
        for (let i = 0; i < n; i++) {
          xs[i] = bodies[i].x;
          ys[i] = bodies[i].y;
          zs[i] = bodies[i].z;
          vxs[i] = bodies[i].vx;
          vys[i] = bodies[i].vy;
          vzs[i] = bodies[i].vz;
          masses[i] = bodies[i].mass;
          gMuls[i] = bodies[i].gMul;
        }
        stepBodiesWasm(xs, ys, zs, vxs, vys, vzs, masses, gMuls, dt, G);
        for (let i = 0; i < n; i++) {
          bodies[i].x = xs[i];
          bodies[i].y = ys[i];
          bodies[i].z = zs[i];
          bodies[i].vx = vxs[i];
          bodies[i].vy = vys[i];
          bodies[i].vz = vzs[i];
        }
      },
    };
    return engine;
  } catch {
    return null;
  }
}

export function loadEngine(): Promise<WasmEngine> {
  if (!cached) {
    cached = (async () => {
      const wasm = await tryLoadWasm();
      if (wasm) return wasm;
      wasmOk = false;
      return {
        isWasm: false,
        step: (bodies, dt, G) => stepBodies(bodies, dt, G, 1),
      } satisfies WasmEngine;
    })();
  }
  return cached;
}
