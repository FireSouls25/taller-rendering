import type { Body } from "./types";

/**
 * TypeScript mirror of the Rust N-body engine (rust-physics/src/lib.rs).
 * Semi-implicit (symplectic) Euler with softening. O(n²), fine for ≤ ~200 bodies.
 * Used as instant fallback until WASM loads, and when WASM is unavailable.
 */
export function stepBodies(
  bodies: Body[],
  dt: number,
  G: number,
  substeps = 1
): void {
  const h = dt / substeps;
  const eps2 = 4; // softening² to avoid singularities
  for (let s = 0; s < substeps; s++) {
    const n = bodies.length;
    const ax = new Float64Array(n);
    const ay = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const bi = bodies[i];
      for (let j = i + 1; j < n; j++) {
        const bj = bodies[j];
        const dx = bj.x - bi.x;
        const dy = bj.y - bi.y;
        const r2 = dx * dx + dy * dy + eps2;
        const invR3 = 1 / (Math.sqrt(r2) * r2);
        const fi = G * bj.mass * invR3;
        const fj = G * bi.mass * invR3;
        ax[i] += fi * dx;
        ay[i] += fi * dy;
        ax[j] -= fj * dx;
        ay[j] -= fj * dy;
      }
    }
    for (let i = 0; i < n; i++) {
      const b = bodies[i];
      b.vx += ax[i] * h;
      b.vy += ay[i] * h;
      b.x += b.vx * h;
      b.y += b.vy * h;
    }
  }
}

export function totalEnergy(bodies: Body[], G: number): number {
  let ke = 0;
  let pe = 0;
  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i];
    ke += 0.5 * b.mass * (b.vx * b.vx + b.vy * b.vy);
    for (let j = i + 1; j < bodies.length; j++) {
      const o = bodies[j];
      const dx = o.x - b.x;
      const dy = o.y - b.y;
      const r = Math.sqrt(dx * dx + dy * dy + 1e-9);
      pe -= (G * b.mass * o.mass) / r;
    }
  }
  return ke + pe;
}
