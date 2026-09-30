"use client";

import { useRouter } from "next/navigation";
import type { RenderingMode, ScenarioSlug, SimState } from "@/lib/types";
import { SCENARIO_META } from "@/lib/scenarios";
import { ModeToggle, ScenarioSelect } from "./ModeToggle";
import { GravityCanvas } from "./GravityCanvas";

export function LabShell({
  mode,
  scenario,
  initial,
  generatedAt,
  nextRegenAt,
  note,
}: {
  mode: RenderingMode;
  scenario: ScenarioSlug;
  initial: SimState;
  generatedAt: string;
  nextRegenAt?: string;
  note: string;
}) {
  const router = useRouter();
  const meta = SCENARIO_META.find((s) => s.slug === scenario);

  const handleScenario = (s: ScenarioSlug) => {
    if (mode === "CSR") router.push(`/csr?scenario=${s}`);
    else if (mode === "SSR") router.push(`/ssr?scenario=${s}`);
    else if (mode === "SSG") router.push(`/ssg/${s}`);
    else router.push(`/isr/${s}`);
  };

  return (
    <main className="page">
      <header className="hero">
        <div>
          <h1>
            GRAVITY LAB <span className="sub">· {mode}</span>
          </h1>
          <p className="tagline">{note}</p>
          {meta && (
            <p className="scenario-desc">
              {meta.icon} <strong>{meta.name}</strong> — {meta.description}
            </p>
          )}
        </div>
        <div className="hero-controls">
          <ModeToggle active={mode} scenario={scenario} />
          <ScenarioSelect value={scenario} onChange={handleScenario} mode={mode} />
        </div>
      </header>

      <GravityCanvas
        initial={initial}
        mode={mode}
        generatedAt={generatedAt}
        nextRegenAt={nextRegenAt}
      />

      <footer className="foot">
        <span>
          Una simulación, un motor de física, cuatro estrategias de
          representación.
        </span>
        <span className="dim">
          TS ↔ Rust/WASM · 3D (WebGL) · semilla {initial.seed}
        </span>
      </footer>
    </main>
  );
}
