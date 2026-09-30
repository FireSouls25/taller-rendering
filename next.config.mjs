/** @type {import('next').NextConfig} */
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectDir = path.dirname(fileURLToPath(import.meta.url));

const nextConfig = {
  reactStrictMode: true,
  // Fija la raíz de trazado al proyecto (evita que Next infiera un
  // workspace superior si hay lockfiles en carpetas padre; rompe el
  // despliegue en Vercel en ese caso).
  outputFileTracingRoot: projectDir,
  // Allow async WebAssembly so the Rust physics engine can load client-side.
  webpack(config) {
    config.experiments = { ...config.experiments, asyncWebAssembly: true };
    return config;
  },
};

export default nextConfig;
