use wasm_bindgen::prelude::*;

/// Paso N-cuerpos 3D con Euler simpléctico (semi-implícito) + suavizado.
/// Espeja `lib/physics.ts::stepBodies` para que CSR/SSR/SSG/ISR sean idénticos
/// sin importar el backend. Trabaja sobre cortes SoA para copias baratas JS↔WASM.
///
/// `gmuls[j]` = influencia gravitatoria del cuerpo j (cuánto atrae a los demás).
/// Las colisiones se resuelven en TypeScript tras este paso gravitatorio.
#[wasm_bindgen]
pub fn step_bodies(
    xs: &mut [f64],
    ys: &mut [f64],
    zs: &mut [f64],
    vxs: &mut [f64],
    vys: &mut [f64],
    vzs: &mut [f64],
    masses: &[f64],
    gmuls: &[f64],
    dt: f64,
    g: f64,
) {
    let n = xs.len();
    debug_assert_eq!(ys.len(), n);
    debug_assert_eq!(zs.len(), n);
    debug_assert_eq!(vxs.len(), n);
    debug_assert_eq!(vys.len(), n);
    debug_assert_eq!(vzs.len(), n);
    debug_assert_eq!(masses.len(), n);
    debug_assert_eq!(gmuls.len(), n);

    const EPS2: f64 = 4.0;
    // Suma directa O(n²). Suficiente para el taller (≤ ~200 cuerpos).
    for i in 0..n {
        let mut ax = 0.0;
        let mut ay = 0.0;
        let mut az = 0.0;
        let xi = xs[i];
        let yi = ys[i];
        let zi = zs[i];
        for j in 0..n {
            if i == j {
                continue;
            }
            let dx = xs[j] - xi;
            let dy = ys[j] - yi;
            let dz = zs[j] - zi;
            let r2 = dx * dx + dy * dy + dz * dz + EPS2;
            let inv_r3 = 1.0 / (r2.sqrt() * r2);
            let f = g * gmuls[j] * masses[j] * inv_r3;
            ax += f * dx;
            ay += f * dy;
            az += f * dz;
        }
        vxs[i] += ax * dt;
        vys[i] += ay * dt;
        vzs[i] += az * dt;
    }
    for i in 0..n {
        xs[i] += vxs[i] * dt;
        ys[i] += vys[i] * dt;
        zs[i] += vzs[i] * dt;
    }
}

/// Mundo con estado opcional para futuras extensiones (mínimo para el taller).
#[wasm_bindgen]
pub struct PhysicsWorld {
    g: f64,
}

#[wasm_bindgen]
impl PhysicsWorld {
    #[wasm_bindgen(constructor)]
    pub fn new(g: f64) -> PhysicsWorld {
        PhysicsWorld { g }
    }

    pub fn g(&self) -> f64 {
        self.g
    }

    pub fn set_g(&mut self, g: f64) {
        self.g = g;
    }
}
