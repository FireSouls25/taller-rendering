import type { Body, CollisionMode } from "./types";

/**
 * Espejo TypeScript del motor Rust (rust-physics/src/lib.rs).
 * N-cuerpos 3D con Euler simpléctico + suavizado. O(n²), bien hasta ~200 cuerpos.
 * Reserva instantánea hasta que WASM carga, y cuando WASM no está disponible.
 *
 * `gMul` = influencia gravitatoria: cuánto atrae el cuerpo j a los demás.
 */
export function stepBodies(
  bodies: Body[],
  dt: number,
  G: number,
  substeps = 1
): void {
  const h = dt / substeps;
  const eps2 = 4; // suavizado² para evitar singularidades
  for (let s = 0; s < substeps; s++) {
    const n = bodies.length;
    const ax = new Float64Array(n);
    const ay = new Float64Array(n);
    const az = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const bi = bodies[i];
      for (let j = i + 1; j < n; j++) {
        const bj = bodies[j];
        const dx = bj.x - bi.x;
        const dy = bj.y - bi.y;
        const dz = bj.z - bi.z;
        const r2 = dx * dx + dy * dy + dz * dz + eps2;
        const invR3 = 1 / (Math.sqrt(r2) * r2);
        const fi = G * bj.gMul * bj.mass * invR3;
        const fj = G * bi.gMul * bi.mass * invR3;
        ax[i] += fi * dx;
        ay[i] += fi * dy;
        az[i] += fi * dz;
        ax[j] -= fj * dx;
        ay[j] -= fj * dy;
        az[j] -= fj * dz;
      }
    }
    for (let i = 0; i < n; i++) {
      const b = bodies[i];
      b.vx += ax[i] * h;
      b.vy += ay[i] * h;
      b.vz += az[i] * h;
      b.x += b.vx * h;
      b.y += b.vy * h;
      b.z += b.vz * h;
    }
  }
}

export function bodyRadius(mass: number): number {
  return Math.cbrt(Math.max(mass, 0.01)) * 1.6 + 2;
}

/**
 * Colisiones (se aplica tras el paso gravitatorio, igual con WASM o TS).
 * - merge: el más masivo absorbe al otro (se conserva el momento lineal).
 * - bounce: rebote elástico con restitución 0.9 + separación posicional.
 * - off: los cuerpos se atraviesan.
 */
export function applyCollisions(bodies: Body[], mode: CollisionMode): void {
  if (mode === "off" || bodies.length < 2) return;
  if (mode === "merge") {
    const dead = new Set<number>();
    for (let i = 0; i < bodies.length; i++) {
      const a = bodies[i];
      if (dead.has(a.id)) continue;
      for (let j = i + 1; j < bodies.length; j++) {
        const b = bodies[j];
        if (dead.has(b.id)) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dz = b.z - a.z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < (a.radius + b.radius) * 0.75) {
          const big = a.mass >= b.mass ? a : b;
          const small = big === a ? b : a;
          const M = big.mass + small.mass;
          // Centro de masas + momento lineal conservado.
          big.x = (big.x * big.mass + small.x * small.mass) / M;
          big.y = (big.y * big.mass + small.y * small.mass) / M;
          big.z = (big.z * big.mass + small.z * small.mass) / M;
          big.vx = (big.vx * big.mass + small.vx * small.mass) / M;
          big.vy = (big.vy * big.mass + small.vy * small.mass) / M;
          big.vz = (big.vz * big.mass + small.vz * small.mass) / M;
          big.mass = M;
          big.radius = bodyRadius(M);
          dead.add(small.id);
        }
      }
    }
    if (dead.size > 0) {
      const kept = bodies.filter((b) => !dead.has(b.id));
      bodies.length = 0;
      bodies.push(...kept);
    }
    return;
  }
  // bounce
  const e = 0.9;
  for (let i = 0; i < bodies.length; i++) {
    const a = bodies[i];
    for (let j = i + 1; j < bodies.length; j++) {
      const b = bodies[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dz = b.z - a.z;
      const minD = a.radius + b.radius;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= minD * minD || d2 < 1e-12) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d;
      const ny = dy / d;
      const nz = dz / d;
      // Separación posicional proporcional a la masa inversa.
      const overlap = minD - d;
      const tm = a.mass + b.mass;
      a.x -= nx * overlap * (b.mass / tm);
      a.y -= ny * overlap * (b.mass / tm);
      a.z -= nz * overlap * (b.mass / tm);
      b.x += nx * overlap * (a.mass / tm);
      b.y += ny * overlap * (a.mass / tm);
      b.z += nz * overlap * (a.mass / tm);
      // Impulso elástico a lo largo de la normal.
      const rvx = b.vx - a.vx;
      const rvy = b.vy - a.vy;
      const rvz = b.vz - a.vz;
      const vn = rvx * nx + rvy * ny + rvz * nz;
      if (vn >= 0) continue;
      const impulse = (-(1 + e) * vn) / (1 / a.mass + 1 / b.mass);
      a.vx -= (impulse / a.mass) * nx;
      a.vy -= (impulse / a.mass) * ny;
      a.vz -= (impulse / a.mass) * nz;
      b.vx += (impulse / b.mass) * nx;
      b.vy += (impulse / b.mass) * ny;
      b.vz += (impulse / b.mass) * nz;
    }
  }
}

export function totalEnergy(bodies: Body[], G: number): number {
  let ke = 0;
  let pe = 0;
  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i];
    ke += 0.5 * b.mass * (b.vx * b.vx + b.vy * b.vy + b.vz * b.vz);
    for (let j = i + 1; j < bodies.length; j++) {
      const o = bodies[j];
      const dx = o.x - b.x;
      const dy = o.y - b.y;
      const dz = o.z - b.z;
      const r = Math.sqrt(dx * dx + dy * dy + dz * dz + 1e-9);
      pe -= (G * b.gMul * b.mass * o.gMul * o.mass) / r;
    }
  }
  return ke + pe;
}
