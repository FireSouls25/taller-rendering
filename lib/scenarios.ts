import type { Body, ScenarioSlug, SimState } from "./types";

export const SCENARIO_META: {
  slug: ScenarioSlug;
  name: string;
  icon: string;
  description: string;
  defaultSeed: number;
}[] = [
  {
    slug: "solar-system",
    name: "Sistema Solar",
    icon: "☀️",
    description: "Movimiento orbital estable. Una estrella + 8 planetas en órbitas circulares.",
    defaultSeed: 42191,
  },
  {
    slug: "binary-star",
    name: "Estrella Binaria",
    icon: "⭐",
    description: "Dos estrellas masivas que se orbitan entre sí, con 6 cuerpos pequeños alrededor.",
    defaultSeed: 777,
  },
  {
    slug: "three-body",
    name: "Tres Cuerpos",
    icon: "🌀",
    description: "Tres masas iguales. Cambios mínimos → trayectorias radicalmente distintas.",
    defaultSeed: 1234,
  },
  {
    slug: "chaos",
    name: "Caos",
    icon: "💥",
    description: "50 cuerpos aleatorios a partir de una semilla. Demo determinista y de rendimiento WASM.",
    defaultSeed: 182739,
  },
  {
    slug: "sandbox",
    name: "Arenero",
    icon: "🧪",
    description: "Lienzo casi vacío. Añade, arrastra e impulsa cuerpos a tu gusto.",
    defaultSeed: 999,
  },
];

export const SCENARIO_SLUGS = SCENARIO_META.map((s) => s.slug);

export function isScenarioSlug(v: unknown): v is ScenarioSlug {
  return (
    typeof v === "string" &&
    (SCENARIO_SLUGS as string[]).includes(v)
  );
}

export function normalizeScenario(v: unknown, fallback: ScenarioSlug = "solar-system"): ScenarioSlug {
  return isScenarioSlug(v) ? v : fallback;
}

/** Deterministic PRNG (mulberry32) so server + client agree given the same seed. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const G_DEFAULT = 40;
const DT_DEFAULT = 1 / 60;

let nextId = 1;
function makeBody(
  x: number,
  y: number,
  vx: number,
  vy: number,
  mass: number,
  color: string,
  name?: string
): Body {
  const radius = Math.cbrt(mass) * 1.6 + 2;
  return { id: nextId++, x, y, vx, vy, mass, radius, color, name };
}

function circularOrbitVelocity(centralMass: number, r: number, G: number) {
  return Math.sqrt((G * centralMass) / Math.max(r, 1e-6));
}

function solarSystem(seed: number): SimState {
  nextId = 1;
  const G = G_DEFAULT;
  const sunMass = 1200;
  const bodies: Body[] = [
    makeBody(0, 0, 0, 0, sunMass, "#fbbf24", "Sol"),
  ];
  const planets: { r: number; mass: number; color: string; name: string }[] = [
    { r: 70, mass: 2, color: "#9ca3af", name: "M1" },
    { r: 100, mass: 5, color: "#f59e0b", name: "M2" },
    { r: 135, mass: 6, color: "#38bdf8", name: "Terra" },
    { r: 170, mass: 4, color: "#f87171", name: "M4" },
    { r: 225, mass: 40, color: "#fdba74", name: "M5" },
    { r: 280, mass: 32, color: "#fde68a", name: "M6" },
    { r: 330, mass: 14, color: "#67e8f9", name: "M7" },
    { r: 375, mass: 13, color: "#818cf8", name: "M8" },
  ];
  const rand = mulberry32(seed);
  for (const p of planets) {
    const angle = rand() * Math.PI * 2;
    const x = Math.cos(angle) * p.r;
    const y = Math.sin(angle) * p.r;
    const v = circularOrbitVelocity(sunMass, p.r, G);
    // tangential velocity (counter-clockwise)
    const vx = -Math.sin(angle) * v;
    const vy = Math.cos(angle) * v;
    bodies.push(makeBody(x, y, vx, vy, p.mass, p.color, p.name));
  }
  return { scenario: "solar-system", seed, bodies, G, dt: DT_DEFAULT, time: 0 };
}

function binaryStar(seed: number): SimState {
  nextId = 1;
  const G = G_DEFAULT;
  const starMass = 500;
  const d = 90;
  // Two stars in circular orbit around barycenter.
  const vStar = Math.sqrt((G * starMass) / (4 * d));
  const bodies: Body[] = [
    makeBody(-d, 0, 0, -vStar, starMass, "#fbbf24", "A"),
    makeBody(d, 0, 0, vStar, starMass, "#fb923c", "B"),
  ];
  const rand = mulberry32(seed);
  const colors = ["#38bdf8", "#a78bfa", "#34d399", "#f472b6", "#facc15", "#94a3b8"];
  for (let i = 0; i < 6; i++) {
    const angle = rand() * Math.PI * 2;
    const r = 220 + rand() * 140;
    const x = Math.cos(angle) * r;
    const y = Math.sin(angle) * r;
    const v = circularOrbitVelocity(starMass * 2, r, G);
    bodies.push(
      makeBody(
        x, y,
        -Math.sin(angle) * v, Math.cos(angle) * v,
        1 + rand() * 3, colors[i % colors.length]
      )
    );
  }
  return { scenario: "binary-star", seed, bodies, G, dt: DT_DEFAULT, time: 0 };
}

function threeBody(seed: number): SimState {
  nextId = 1;
  const G = G_DEFAULT;
  void seed;
  const bodies: Body[] = [
    makeBody(-80, 0, 12, 18, 120, "#38bdf8", "Alpha"),
    makeBody(80, 0, -12, -18, 120, "#f472b6", "Beta"),
    makeBody(0, 90, 26, 0, 120, "#a3e635", "Gamma"),
  ];
  return { scenario: "three-body", seed, bodies, G, dt: DT_DEFAULT, time: 0 };
}

function chaos(seed: number, n = 50): SimState {
  nextId = 1;
  const G = G_DEFAULT;
  const rand = mulberry32(seed);
  const palette = ["#38bdf8", "#a78bfa", "#34d399", "#f472b6", "#facc15", "#fb923c", "#94a3b8"];
  const bodies: Body[] = [];
  for (let i = 0; i < n; i++) {
    const angle = rand() * Math.PI * 2;
    const r = 40 + rand() * 340;
    const x = Math.cos(angle) * r;
    const y = Math.sin(angle) * r;
    bodies.push(
      makeBody(
        x, y,
        (rand() - 0.5) * 60, (rand() - 0.5) * 60,
        2 + rand() * 22,
        palette[i % palette.length]
      )
    );
  }
  return { scenario: "chaos", seed, bodies, G, dt: DT_DEFAULT, time: 0 };
}

function sandbox(seed: number): SimState {
  nextId = 1;
  const G = G_DEFAULT;
  const bodies: Body[] = [
    makeBody(0, 0, 0, 0, 900, "#fbbf24", "Sol"),
    makeBody(160, 0, 0, 52, 8, "#38bdf8", "Probe"),
    makeBody(-200, 40, 6, -40, 5, "#f472b6"),
  ];
  return { scenario: "sandbox", seed, bodies, G, dt: DT_DEFAULT, time: 0 };
}

/**
 * Single source of truth for "initial simulation state".
 * The SAME function runs on the server (SSR/SSG/ISR) and on the client (CSR).
 * Only *when/where* it runs changes per rendering strategy.
 */
export function getInitialState(
  scenario: ScenarioSlug,
  seed?: number
): SimState {
  const meta = SCENARIO_META.find((m) => m.slug === scenario);
  const s = seed ?? meta?.defaultSeed ?? 1;
  switch (scenario) {
    case "solar-system":
      return solarSystem(s);
    case "binary-star":
      return binaryStar(s);
    case "three-body":
      return threeBody(s);
    case "chaos":
      return chaos(s);
    case "sandbox":
      return sandbox(s);
  }
}
