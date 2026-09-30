"use client";

import { useState } from "react";
import Link from "next/link";
import type { CollisionMode, RenderingMode, ScenarioSlug, SimState } from "@/lib/types";
import { SCENARIO_META } from "@/lib/scenarios";
import { useSimulation } from "@/lib/use-simulation";
import { View3D } from "./views/View3D";
import { View2D } from "./views/View2D";

const MODE_HREF: Record<RenderingMode, (s: ScenarioSlug) => string> = {
  CSR: (s) => `/csr?scenario=${s}`,
  SSR: (s) => `/ssr?scenario=${s}`,
  SSG: (s) => `/ssg/${s}`,
  ISR: (s) => `/isr/${s}`,
};

const COLLISION_OPTS: { v: CollisionMode; label: string }[] = [
  { v: "merge", label: "Fusión" },
  { v: "bounce", label: "Rebote" },
  { v: "off", label: "Ninguna" },
];

function Inspector({
  sim,
}: {
  sim: ReturnType<typeof useSimulation>;
}) {
  const sel = sim.selected;
  const [draft, setDraft] = useState({
    mass: String(sel?.mass.toFixed(1) ?? ""),
    vx: String(sel?.vx.toFixed(1) ?? ""),
    vy: String(sel?.vy.toFixed(1) ?? ""),
    vz: String(sel?.vz.toFixed(1) ?? ""),
  });

  if (!sel) {
    return (
      <div className="rail-section">
        <div className="label">Inspector</div>
        <p className="dim-text">
          Clic en un cuerpo para inspeccionarlo: masa, velocidad y gravedad
          propia.
        </p>
        <p className="dim-text">
          Arrastra para mover · suelta con impulso para lanzar. En 3D, arrastra
          el fondo para orbitar y usa la rueda para el zoom.
        </p>
      </div>
    );
  }

  const num = (s: string, fallback: number) => {
    const v = Number(s);
    return Number.isFinite(v) ? v : fallback;
  };
  const commit = () =>
    sim.updateSelected({
      mass: Math.max(0.1, num(draft.mass, sel.mass)),
      vx: num(draft.vx, sel.vx),
      vy: num(draft.vy, sel.vy),
      vz: num(draft.vz, sel.vz),
    });

  return (
    <div className="rail-section" key={sel.id}>
      <div className="label">Cuerpo #{sel.id}</div>
      <div className="sel-head">
        <span className="dot" style={{ background: sel.color }} />
        <span className="sel-name">{sel.name ?? "sin nombre"}</span>
      </div>

      <label className="field">
        <span>
          Masa <em>{sel.mass.toFixed(1)}</em>
        </span>
        <input
          type="range"
          min={0.5}
          max={600}
          step={0.5}
          value={Math.min(600, Math.max(0.5, num(draft.mass, sel.mass)))}
          onChange={(e) => {
            const v = e.target.value;
            setDraft((d) => ({ ...d, mass: v }));
            sim.updateSelected({ mass: Math.max(0.1, Number(v)) });
          }}
        />
      </label>

      <div className="vel-grid">
        {(["vx", "vy", "vz"] as const).map((k) => (
          <label key={k} className="field">
            <span>{k}</span>
            <input
              className="input"
              inputMode="decimal"
              value={draft[k]}
              onChange={(e) =>
                setDraft((d) => ({ ...d, [k]: e.target.value }))
              }
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
            />
          </label>
        ))}
      </div>

      <label className="field">
        <span>
          Gravedad propia <em>{sel.gMul.toFixed(1)}×</em>
        </span>
        <input
          type="range"
          min={0}
          max={3}
          step={0.1}
          value={sel.gMul}
          onChange={(e) => sim.updateSelected({ gMul: Number(e.target.value) })}
        />
      </label>

      <button className="btn small danger" onClick={sim.deleteSelected}>
        Eliminar cuerpo
      </button>
    </div>
  );
}

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
  const sim = useSimulation({ initial, mode });
  const [newMass, setNewMass] = useState("10");
  const meta = SCENARIO_META.find((s) => s.slug === scenario);

  return (
    <div className="obs">
      <header className="obs-top">
        <div className="brand">
          GRAVITY&nbsp;LAB <span>· {mode}</span>
        </div>
        <nav className="seg" aria-label="Modo de representación">
          {(Object.keys(MODE_HREF) as RenderingMode[]).map((m) => (
            <Link
              key={m}
              href={MODE_HREF[m](scenario)}
              aria-current={m === mode ? "true" : undefined}
              className={`seg-btn${m === mode ? " active" : ""}`}
            >
              {m}
            </Link>
          ))}
        </nav>
        <div className="topstats">
          <span title="Fotogramas por segundo">{sim.fps} fps</span>
          <span title="Cuerpos en la simulación">{sim.bodies.length} cuerpos</span>
          <span title="Tiempo simulado">t {sim.time.toFixed(1)}s</span>
          <span className="pill" title="Motor de física activo">
            {sim.backend === "WASM" ? "✓ WASM" : sim.backend}
          </span>
        </div>
      </header>

      <div className="obs-main">
        <aside className="rail">
          <div className="rail-section">
            <div className="label">Escenario</div>
            <div className="sc-list">
              {SCENARIO_META.map((s) => (
                <button
                  key={s.slug}
                  className={`sc-btn${s.slug === scenario ? " active" : ""}`}
                  onClick={() => sim.gotoScenario(s.slug)}
                  title={s.description}
                >
                  <span>{s.icon}</span> {s.name}
                </button>
              ))}
            </div>
            {meta && <p className="dim-text">{meta.description}</p>}
          </div>

          <div className="rail-section">
            <div className="label">Vista</div>
            <div className="seg">
              <button
                className={`seg-btn${sim.view === "3d" ? " active" : ""}`}
                disabled={sim.webglOk === false}
                title={
                  sim.webglOk === false
                    ? "WebGL no disponible en este navegador"
                    : "Simulación y render 3D"
                }
                onClick={() => sim.changeView("3d")}
              >
                3D
              </button>
              <button
                className={`seg-btn${sim.view === "2d" ? " active" : ""}`}
                title="Proyección al plano (fija z = 0)"
                onClick={() => sim.changeView("2d")}
              >
                2D
              </button>
            </div>
          </div>

          <div className="rail-section">
            <div className="label">Colisiones</div>
            <div className="seg col3">
              {COLLISION_OPTS.map((o) => (
                <button
                  key={o.v}
                  className={`seg-btn${sim.collisions === o.v ? " active" : ""}`}
                  onClick={() => sim.changeCollisions(o.v)}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div className="rail-section">
            <div className="label">
              Gravedad <em>{sim.gravityMul.toFixed(2)}×</em>
            </div>
            <input
              type="range"
              min={0}
              max={2.5}
              step={0.05}
              value={sim.gravityMul}
              onChange={(e) => sim.changeGravityMul(Number(e.target.value))}
            />
          </div>

          <div className="rail-foot">
            <span title={note}>Generado: {generatedAt}</span>
            {nextRegenAt && <span>Próx. regen: {nextRegenAt}</span>}
            <span>Semilla {initial.seed}</span>
          </div>
        </aside>

        <section className="stage">
          {sim.webglOk === false && (
            <div className="webgl-banner" role="status">
              ⚠️ WebGL no disponible — vista 2D. Activa la aceleración por
              hardware para el 3D.
            </div>
          )}
          {sim.view === "3d" && sim.webglOk !== false ? (
            <View3D sim={sim.views} />
          ) : (
            <View2D sim={sim.views} />
          )}

          <div className="dock">
            <button
              className="dock-btn"
              onClick={sim.togglePaused}
              title={sim.paused ? "Reanudar" : "Pausar"}
            >
              {sim.paused ? "▶" : "⏸"}
            </button>
            <button className="dock-btn" onClick={sim.reset} title="Reiniciar">
              ↺
            </button>
            <span className="dock-sep" />
            <input
              className="dock-mass"
              value={newMass}
              onChange={(e) => setNewMass(e.target.value)}
              inputMode="decimal"
              title="Masa del cuerpo nuevo"
            />
            <button
              className="dock-btn wide"
              onClick={() => sim.addBody(Number(newMass) || 10)}
              title="Añadir cuerpo"
            >
              + Cuerpo
            </button>
            <button
              className="dock-btn"
              onClick={sim.randomize}
              title="Aleatorio (nueva semilla)"
            >
              🎲
            </button>
            <button
              className="dock-btn"
              onClick={() => sim.shootAsteroid(1)}
              title="Disparar asteroide hacia el centro"
            >
              ☄️
            </button>
            <button
              className="dock-btn"
              onClick={() => sim.shootAsteroid(10)}
              title="Lluvia de 10 asteroides"
            >
              ☄️×10
            </button>
            <span className="dock-sep" />
            <label className="dock-slider" title="Velocidad de simulación">
              {sim.speed.toFixed(1)}×
              <input
                type="range"
                min={0.1}
                max={4}
                step={0.1}
                value={sim.speed}
                onChange={(e) => sim.changeSpeed(Number(e.target.value))}
              />
            </label>
            <button
              className={`dock-btn toggle${sim.trails ? " on" : ""}`}
              onClick={() => sim.changeTrails(!sim.trails)}
              title="Estelas"
            >
              ~
            </button>
            {sim.view === "3d" && (
              <button
                className="dock-btn"
                onClick={sim.focusCamera}
                title="Centrar cámara"
              >
                🎥
              </button>
            )}
          </div>
        </section>

        <aside className="rail">
          <Inspector sim={sim} />
        </aside>
      </div>
    </div>
  );
}
