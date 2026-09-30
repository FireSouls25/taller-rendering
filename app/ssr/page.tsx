import { LabShell } from "@/components/LabShell";
import { getInitialState, normalizeScenario } from "@/lib/scenarios";

// SSR — Representación del lado del servidor: HTML + estado inicial frescos en CADA petición.
export const dynamic = "force-dynamic";

export default async function SsrPage({
  searchParams,
}: {
  searchParams: Promise<{ scenario?: string; seed?: string }>;
}) {
  const params = await searchParams;
  const scenario = normalizeScenario(params.scenario);
  const seed = params.seed ? Number(params.seed) : undefined;
  const initial = getInitialState(
    scenario,
    Number.isFinite(seed) ? seed : undefined
  );
  const generatedAt = new Date().toLocaleTimeString("es-ES", { hour12: false });

  return (
    <LabShell
      mode="SSR"
      scenario={scenario}
      initial={initial}
      generatedAt={`${generatedAt} (servidor, por petición)`}
      note="SSR: el servidor generó este estado inicial bajo demanda; el navegador hidrata y WASM toma el control."
    />
  );
}
