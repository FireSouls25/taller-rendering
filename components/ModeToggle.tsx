"use client";

import Link from "next/link";
import type { RenderingMode, ScenarioSlug } from "@/lib/types";
import { SCENARIO_META } from "@/lib/scenarios";

const MODES: { mode: RenderingMode; href: (scenario: ScenarioSlug) => string; blurb: string }[] = [
  { mode: "CSR", href: (s) => `/csr?scenario=${s}`, blurb: "solo cliente" },
  { mode: "SSR", href: (s) => `/ssr?scenario=${s}`, blurb: "por petición" },
  { mode: "SSG", href: (s) => `/ssg/${s}`, blurb: "en compilación" },
  { mode: "ISR", href: (s) => `/isr/${s}`, blurb: "refresco 30s" },
];

export function ModeToggle({
  active,
  scenario,
}: {
  active: RenderingMode;
  scenario: ScenarioSlug;
}) {
  return (
    <div>
      <div className="label">Representación</div>
      <div className="seg" role="tablist" aria-label="Modo de representación">
        {MODES.map((m) => (
          <Link
            key={m.mode}
            href={m.href(scenario)}
            role="tab"
            aria-selected={m.mode === active}
            className={`seg-btn${m.mode === active ? " active" : ""}`}
            title={`${m.mode} — ${m.blurb}`}
          >
            {m.mode}
          </Link>
        ))}
      </div>
      <div className="mode-hint">
        {MODES.find((m) => m.mode === active)?.blurb} · misma simulación,
        distinto renderizado inicial
      </div>
    </div>
  );
}

export function ScenarioSelect({
  value,
  onChange,
  mode,
}: {
  value: ScenarioSlug;
  onChange: (s: ScenarioSlug) => void;
  mode: RenderingMode;
}) {
  // CSR/SSR conservan el escenario en ?scenario= (navegación cliente).
  // SSG/ISR usan rutas /[scenario].
  if (mode === "SSG" || mode === "ISR") {
    const base = mode === "SSG" ? "/ssg" : "/isr";
    return (
      <div>
        <div className="label">Escenario</div>
        <div className="scenario-row">
          <select
            className="select"
            value={value}
            onChange={(e) => onChange(e.target.value as ScenarioSlug)}
            aria-label="Escenario"
          >
            {SCENARIO_META.map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.icon} {s.name}
              </option>
            ))}
          </select>
          <Link className="btn small" href={`${base}/${value}`}>
            Cargar
          </Link>
        </div>
      </div>
    );
  }
  return (
    <div>
      <div className="label">Escenario</div>
      <select
        className="select"
        value={value}
        onChange={(e) => onChange(e.target.value as ScenarioSlug)}
        aria-label="Escenario"
      >
        {SCENARIO_META.map((s) => (
          <option key={s.slug} value={s.slug}>
            {s.icon} {s.name}
          </option>
        ))}
      </select>
    </div>
  );
}
