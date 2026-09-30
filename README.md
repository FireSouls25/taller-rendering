# Gravity Lab — Taller de Patrones de Renderizado

Patio interactivo de simulación N-body en 3D. La misma simulación bajo cuatro estrategias de renderizado de Next.js.

```
Next.js (CSR/SSR/SSG/ISR)
  → estado inicial de la simulación
  → TypeScript
  → motor de física Rust/WASM
  → Three.js / WebGL
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

El HUD muestra `✓ WASM` cuando el motor Rust está activo, `TS (reserva)` si no.

## Rutas

| Modo | Ruta | Cuándo se produce el estado inicial |
|------|-------|--------------------------------------|
| CSR  | `/csr?scenario=solar-system` | en el navegador, tras la carga |
| SSR  | `/ssr?scenario=solar-system` | servidor, en cada petición (`force-dynamic`) |
| SSG  | `/ssg/solar-system` | en compilación (`force-static` + `generateStaticParams`) |
| ISR  | `/isr/solar-system` | estático, refrescado cada 30s (`revalidate = 30`) |

La raíz `/` es el laboratorio en modo CSR. El conmutador `[CSR][SSR][SSG][ISR]`
vive dentro de la página y conserva el escenario.

Escenarios: `solar-system`, `binary-star`, `three-body`, `chaos`, `sandbox`.
API: `GET /api/state?scenario=chaos&seed=123` devuelve el mismo estado inicial en JSON.

## Controles 3D

- Clic en un cuerpo para seleccionar · arrástralo para mover · lánzalo para impulsarlo
- Arrastra el fondo para orbitar la cámara · rueda para zoom
- 🎥 Centrar cámara · Estelas · Velocidad · Pausar/Reanudar

## Puntos del taller

- Estrategia de renderizado ≠ motor de simulación. Cambia CSR→SSR→SSG→ISR sin tocar la física.
- CSR: la página se pinta primero, la simulación aparece tras iniciar WASM (ver esqueleto).
- SSR: `Generado: <hora servidor> (servidor, por petición)` cambia en cada recarga.
- SSG: `Generado: <hora compilación>` queda congelado hasta la próxima build.
- ISR: el indicador `Próx. regen` demuestra la regeneración en segundo plano.
- `chaos` + semilla fija = simulación determinista; la misma semilla → mismo inicio en cada estrategia.
- Arrastra cuerpos para moverlos, lánzalos para impulsarlos, cambia la masa, pausa/velocidad/estelas.

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
  GravityCanvas.tsx     bucle: física (WASM preferido) + Three.js, arrastre/impulso
  CsrLab.tsx            laboratorio CSR reutilizado por / y /csr
  ModeToggle.tsx        conmutador [CSR][SSR][SSG][ISR] + selector de escenario
  LabShell.tsx          encabezado + lienzo + pie
lib/
  scenarios.ts          única fuente de verdad del estado inicial (servidor+cliente)
  physics.ts            espejo TS del motor Rust (reserva)
  wasm-loader.ts        prefiere /wasm/*.js, usa TS como reserva
rust-physics/
  src/lib.rs            paso N-body step_bodies (wasm-bindgen, cortes SoA)
```
