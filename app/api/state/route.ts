import { NextResponse } from "next/server";
import { getInitialState, normalizeScenario } from "@/lib/scenarios";

/**
 * Shared "generate initial state" endpoint. Demonstrates the teaching point:
 * SSR/SSG/ISR all call the SAME getInitialState() — only when/where differs.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const scenario = normalizeScenario(url.searchParams.get("scenario"));
  const seedParam = url.searchParams.get("seed");
  const seed = seedParam ? Number(seedParam) : undefined;
  const state = getInitialState(
    scenario,
    Number.isFinite(seed) ? seed : undefined
  );
  return NextResponse.json({
    ...state,
    generatedAt: new Date().toISOString(),
  });
}
