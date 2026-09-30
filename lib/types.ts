export interface Body {
  id: number;
  x: number; // world units, origin at center
  y: number;
  vx: number;
  vy: number;
  mass: number;
  radius: number;
  color: string;
  name?: string;
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

export interface EngineStatus {
  backend: "WASM" | "TypeScript (fallback)";
  wasmReady: boolean;
}
