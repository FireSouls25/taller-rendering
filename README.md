# Gravity Lab — Taller de Patrones de Renderizado

Observatorio gravitatorio 3D. La misma simulación bajo cuatro estrategias de renderizado de Next.js.

```
Next.js (CSR/SSR/SSG/ISR)
  → estado inicial de la simulación
  → TypeScript
  → motor de física 3D Rust/WASM
  → Three.js / WebGL (reserva Canvas 2D)
  → simulación interactiva
```

## Inicio rápido

```bash
npm install
npm run dev
# → http://localhost:3000  (entra directo al laboratorio)
```

La app funciona de inmediato con el motor TypeScript de reserva.
Para activar el backend Rust/WASM:

```bash
npm run wasm:install   # una vez: target wasm + wasm-bindgen-cli
npm run wasm:build     # genera public/wasm/gravity_physics.*
npm run dev
```

El HUD muestra `✓ WASM` cuando el motor Rust está activo, `TS` si no.
Si el navegador no ofrece WebGL, la vista 3D se desactiva y todo funciona en 2D.

## Rutas

| Modo | Ruta | Cuándo se produce el estado inicial |
|------|-------|--------------------------------------|
| CSR  | `/csr?scenario=solar-system` | en el navegador, tras la carga |
| SSR  | `/ssr?scenario=solar-system` | servidor, en cada petición (`force-dynamic`) |
| SSG  | `/ssg/solar-system` | en compilación (`force-static` + `generateStaticParams`) |
| ISR  | `/isr/solar-system` | estático, refrescado cada 30s (`revalidate = 30`) |

La raíz `/` es el laboratorio en modo CSR. El conmutador `[CSR][SSR][SSG][ISR]`
vive en la barra superior y conserva el escenario.

Escenarios: `solar-system`, `binary-star`, `three-body`, `chaos`, `sandbox`.
API: `GET /api/state?scenario=chaos&seed=123` devuelve el mismo estado inicial en JSON.

## La simulación

- **Física 3D real**: los cuerpos se mueven en x, y, z (Euler simpléctico + suavizado).
- **Colisiones** (tras cada paso gravitatorio, igual con WASM o TS):
  `Fusión` (se conserva el momento) · `Rebote` (elástico, e=0.9) · `Ninguna`.
- **Vista 3D / 2D**: conmutador en el riel izquierdo. Pasar a 2D proyecta al plano (z = 0).
- **Playground**: disparar asteroides (☄️) o lluvia (☄️×10), añadir cuerpos con masa a
  elegir, semilla aleatoria, pausa, velocidad 0.1–4×, estelas, gravedad global 0–2.5×.
- **Inspector** (clic en un cuerpo): masa, velocidades vx/vy/vz y **gravedad propia**
  (cuánto atrae a los demás), eliminar. Arrastrar mueve · soltar con impulso lanza.
  En 3D el arrastre usa un plano orientado a la cámara: movimiento libre en 3 ejes.

## Puntos del taller

- Estrategia de renderizado ≠ motor de simulación. Cambia CSR→SSR→SSG→ISR sin tocar la física.
- CSR: la página se pinta primero, la simulación aparece tras iniciar WASM.
- SSR: `Generado: <hora servidor> (servidor, por petición)` cambia en cada recarga.
- SSG: `Generado: <hora compilación>` queda congelado hasta la próxima build.
- ISR: el indicador `Próx. regen` demuestra la regeneración en segundo plano.
- `chaos` + semilla fija = simulación determinista en 3D.

## Estructura

```
app/
  page.tsx              la raíz ES el laboratorio (CSR por defecto)
  csr/page.tsx          solo cliente ('use client', esqueleto → sim)
  ssr/page.tsx          componente de servidor force-dynamic
  ssg/[scenario]/page.tsx  force-static + generateStaticParams
  isr/[scenario]/page.tsx  revalidate=30 + generateStaticParams
  api/state/route.ts    estado inicial compartido en JSON
components/
  LabShell.tsx          UI mínima de observatorio (riel + escenario + dock + inspector)
  CsrLab.tsx            laboratorio CSR reutilizado por / y /csr
  views/View3D.tsx      render Three.js (esferas, halos, estelas 3D, órbita cámara)
  views/View2D.tsx      render Canvas 2D (proyección XY)
lib/
  use-simulation.ts     estado compartido + bucle maestro + acciones del playground
  scenarios.ts          única fuente de verdad del estado inicial (servidor+cliente)
  physics.ts            N-cuerpos 3D + colisiones (también reserva sin WASM)
  wasm-loader.ts        prefiere /wasm/*.js (firma 3D), usa TS como reserva
rust-physics/
  src/lib.rs            paso N-cuerpos 3D step_bodies (wasm-bindgen, cortes SoA)
```
