"use client";

import { Component, useEffect, useState, type ReactNode } from "react";
import type { RenderingMode, SimState } from "@/lib/types";
import { GravityCanvas3D } from "./GravityCanvas3D";
import { GravityCanvas2D } from "./GravityCanvas2D";

interface Props {
  initial: SimState;
  mode: RenderingMode;
  generatedAt: string;
  nextRegenAt?: string;
}

/** Comprueba si el navegador puede crear un contexto WebGL real. */
function isWebglAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    const gl =
      c.getContext("webgl2", { failIfMajorPerformanceCaveat: false }) ??
      c.getContext("webgl", { failIfMajorPerformanceCaveat: false });
    if (!gl) return false;
    // Cede el contexto de prueba por cortesía.
    const lose = (gl as WebGLRenderingContext).getExtension(
      "WEBGL_lose_context"
    );
    lose?.loseContext();
    return true;
  } catch {
    return false;
  }
}

function FallbackBanner() {
  return (
    <div
      role="status"
      style={{
        fontSize: 13,
        color: "#fcd34d",
        background: "rgba(120, 53, 15, 0.35)",
        border: "1px solid rgba(252, 211, 77, 0.4)",
        borderRadius: 10,
        padding: "8px 12px",
        marginBottom: 10,
      }}
    >
      ⚠️ WebGL no disponible en este navegador — reserva 2D activa. Activa la
      aceleración por hardware (o usa Chrome/Edge con SwiftShader) para ver los
      modelos 3D.
    </div>
  );
}

class WebglErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * Elige 3D (WebGL) o 2D (Canvas) según el navegador.
 * Si la creación del contexto falla —p. ej. sandbox sin GPU—,
 * la simulación sigue funcionando en 2D en lugar de quedarse en negro.
 */
export function GravityCanvas(props: Props) {
  const [use3d, setUse3d] = useState<boolean | null>(null);

  useEffect(() => {
    setUse3d(isWebglAvailable());
  }, []);

  if (use3d === null) {
    return (
      <main className="page">
        <div className="loading">Comprobando WebGL…</div>
      </main>
    );
  }

  if (!use3d) {
    return (
      <>
        <FallbackBanner />
        <GravityCanvas2D {...props} />
      </>
    );
  }

  const fallback = (
    <>
      <FallbackBanner />
      <GravityCanvas2D {...props} />
    </>
  );

  return (
    <WebglErrorBoundary fallback={fallback}>
      <GravityCanvas3D {...props} onWebglFail={() => setUse3d(false)} />
    </WebglErrorBoundary>
  );
}
