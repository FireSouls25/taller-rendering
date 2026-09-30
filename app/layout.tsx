import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gravity Lab — Taller de Patrones de Renderizado",
  description:
    "Una simulación, un motor de física, cuatro estrategias de representación: CSR, SSR, SSG, ISR. Next.js + Rust/WASM + 3D.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
