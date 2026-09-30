import { notFound } from "next/navigation";
import { LabShell } from "@/components/LabShell";
import {
  SCENARIO_SLUGS,
  getInitialState,
  isScenarioSlug,
} from "@/lib/scenarios";

// ISR — Incremental Static Regeneration: static, but refreshed every 30s.
export const revalidate = 30;

export function generateStaticParams() {
  return SCENARIO_SLUGS.map((scenario) => ({ scenario }));
}

export default async function IsrScenarioPage({
  params,
}: {
  params: Promise<{ scenario: string }>;
}) {
  const { scenario: raw } = await params;
  if (!isScenarioSlug(raw)) notFound();
  const scenario = raw;

  const initial = getInitialState(scenario);
  const generated = new Date();
  const generatedAt = generated.toLocaleTimeString("es-ES", { hour12: false });
  const nextRegenAt = new Date(generated.getTime() + 30_000).toLocaleTimeString(
    "es-ES",
    { hour12: false }
  );

  return (
    <LabShell
      mode="ISR"
      scenario={scenario}
      initial={initial}
      generatedAt={`${generatedAt} (ISR)`}
      nextRegenAt={`${nextRegenAt}`}
      note="ISR: estático como SSG, pero esta página se regenera en segundo plano cada 30 s."
    />
  );
}
