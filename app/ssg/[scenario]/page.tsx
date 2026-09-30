import { notFound } from "next/navigation";
import { LabShell } from "@/components/LabShell";
import {
  SCENARIO_SLUGS,
  getInitialState,
  isScenarioSlug,
} from "@/lib/scenarios";

// SSG — Static Site Generation: scenarios pre-rendered at BUILD time.
export const dynamic = "force-static";

export function generateStaticParams() {
  return SCENARIO_SLUGS.map((scenario) => ({ scenario }));
}

export default async function SsgScenarioPage({
  params,
}: {
  params: Promise<{ scenario: string }>;
}) {
  const { scenario: raw } = await params;
  if (!isScenarioSlug(raw)) notFound();
  const scenario = raw;

  const initial = getInitialState(scenario);
  // Se evalúa una vez en compilación → mismo valor hasta la próxima build.
  const generatedAt = new Date().toLocaleTimeString("es-ES", { hour12: false });

  return (
    <LabShell
      mode="SSG"
      scenario={scenario}
      initial={initial}
      generatedAt={`${generatedAt} (compilación)`}
      note="SSG: el HTML de este escenario se generó en compilación y se sirve estático."
    />
  );
}
