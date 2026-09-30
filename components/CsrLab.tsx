"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LabShell } from "./LabShell";
import { getInitialState, normalizeScenario } from "@/lib/scenarios";
import type { SimState } from "@/lib/types";

/**
 * CSR — Representación del lado del cliente.
 * El navegador recibe el armazón y la simulación se inicia
 * POR COMPLETO en el cliente: escenario → estado inicial → WASM → 3D.
 * La página se pinta primero y la simulación aparece tras la hidratación.
 */
function CsrInner() {
  const search = useSearchParams();
  const scenario = normalizeScenario(search.get("scenario"));
  const [ready, setReady] = useState(false);
  const [clientAt, setClientAt] = useState("");

  useEffect(() => {
    const t = requestAnimationFrame(() => {
      setClientAt(new Date().toLocaleTimeString("es-ES", { hour12: false }));
      setReady(true);
    });
    return () => cancelAnimationFrame(t);
  }, []);

  const initial: SimState = useMemo(
    () => getInitialState(scenario),
    [scenario]
  );

  if (!ready) {
    return (
      <main className="page">
        <div className="loading">
          Cargando Gravity Lab (CSR)… iniciando WASM en el cliente.
        </div>
      </main>
    );
  }

  return (
    <LabShell
      mode="CSR"
      scenario={scenario}
      initial={initial}
      generatedAt={`${clientAt} (cliente)`}
      note="CSR: el servidor/CDN entrega un armazón vacío y la simulación se inicia por completo en el navegador."
    />
  );
}

export function CsrLab() {
  return (
    <Suspense
      fallback={
        <main className="page">
          <div className="loading">Cargando…</div>
        </main>
      }
    >
      <CsrInner />
    </Suspense>
  );
}
