import type { Body } from "./types";
import { stepBodies } from "./physics";

/**
 * Thin wrapper that prefers the Rust/WASM engine when available
 * and falls back to the TypeScript mirror otherwise.
 *
 * Rendering strategy ≠ simulation engine: CSR/SSR/SSG/ISR only change
 * *where the initial state comes from*. The stepping backend is orthogonal.
 */
export interface WasmEngine {
  step: (bodies: Body[], dt: number, G: number) => void;
  isWasm: boolean;
}

type WasmExports = {
  __wbg_physicsworld_free?: (ptr: number) => void;
};

let cached: Promise<WasmEngine> | null = null;
let wasmOk = false;

export function isWasmActive(): boolean {
  return wasmOk;
}

async function tryLoadWasm(): Promise<WasmEngine | null> {
  try {
    // Built via `npm run wasm:build` -> public/wasm/gravity_physics.{js,wasm}
    // Non-literal specifier on purpose: skips TS static resolution and
    // keeps the import client-only (absent until wasm:build runs).
    const wasmUrl = "/wasm/gravity_physics.js";
    const mod = (await import(/* webpackIgnore: true */ wasmUrl).catch(
      () => null
    )) as
      | (WasmExports & {
          default?: (input?: unknown) => Promise<unknown>;
          step_bodies?: (
            xs: Float64Array,
            ys: Float64Array,
            vxs: Float64Array,
            vys: Float64Array,
            masses: Float64Array,
            dt: number,
            G: number
          ) => void;
        })
      | null;

    if (!mod) return null;
    if (typeof mod.default === "function") {
      await mod.default("/wasm/gravity_physics_bg.wasm").catch(() => null);
    }
    if (typeof mod.step_bodies !== "function") return null;

    const stepBodiesWasm = mod.step_bodies;
    wasmOk = true;
    const engine: WasmEngine = {
      isWasm: true,
      step: (bodies, dt, G) => {
        const n = bodies.length;
        const xs = new Float64Array(n);
        const ys = new Float64Array(n);
        const vxs = new Float64Array(n);
        const vys = new Float64Array(n);
        const masses = new Float64Array(n);
        for (let i = 0; i < n; i++) {
          xs[i] = bodies[i].x;
          ys[i] = bodies[i].y;
          vxs[i] = bodies[i].vx;
          vys[i] = bodies[i].vy;
          masses[i] = bodies[i].mass;
        }
        stepBodiesWasm(xs, ys, vxs, vys, masses, dt, G);
        for (let i = 0; i < n; i++) {
          bodies[i].x = xs[i];
          bodies[i].y = ys[i];
          bodies[i].vx = vxs[i];
          bodies[i].vy = vys[i];
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
