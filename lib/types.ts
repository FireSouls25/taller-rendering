export interface Body {
  id: number;
  x: number; // unidades de mundo, origen en el centro
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  mass: number;
  radius: number;
  color: string;
  name?: string;
  /** Multiplicador de influencia gravitatoria: cuánto atrae a los demás (1 = normal). */
  gMul: number;
}

export type ScenarioSlug =
  | "solar-system"
  | "binary-star"
  | "three-body"
  | "chaos"
  | "sandbox";

export interface SimState {
  scenario: ScenarioSlug;
  seed: number;
  bodies: Body[];
  /** gravitational constant in sim units */
  G: number;
  /** fixed physics dt per substep (seconds of sim-time) */
  dt: number;
  time: number;
}

export type RenderingMode = "CSR" | "SSR" | "SSG" | "ISR";

export type ViewMode = "3d" | "2d";

export type CollisionMode = "merge" | "bounce" | "off";

export interface EngineStatus {
  backend: "WASM" | "TypeScript (fallback)";
  wasmReady: boolean;
}
