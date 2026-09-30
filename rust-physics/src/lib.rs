use wasm_bindgen::prelude::*;

/// N-body step with semi-implicit (symplectic) Euler + softening.
/// Mirrors `lib/physics.ts::stepBodies` so CSR/SSR/SSG/ISR stay identical
/// regardless of backend. Operates on flat SoA slices for cheap JS↔WASM copies.
#[wasm_bindgen]
pub fn step_bodies(
    xs: &mut [f64],
    ys: &mut [f64],
    vxs: &mut [f64],
    vys: &mut [f64],
    masses: &[f64],
    dt: f64,
    g: f64,
) {
    let n = xs.len();
    debug_assert_eq!(ys.len(), n);
    debug_assert_eq!(vxs.len(), n);
    debug_assert_eq!(vys.len(), n);
    debug_assert_eq!(masses.len(), n);

    const EPS2: f64 = 4.0;
    // O(n²) direct summation. Fine for workshop sizes (≤ ~200 bodies).
    for i in 0..n {
        let mut ax = 0.0;
        let mut ay = 0.0;
        let xi = xs[i];
        let yi = ys[i];
        for j in 0..n {
            if i == j {
                continue;
            }
            let dx = xs[j] - xi;
            let dy = ys[j] - yi;
            let r2 = dx * dx + dy * dy + EPS2;
            let inv_r3 = 1.0 / (r2.sqrt() * r2);
            let f = g * masses[j] * inv_r3;
            ax += f * dx;
            ay += f * dy;
        }
        vxs[i] += ax * dt;
        vys[i] += ay * dt;
    }
    for i in 0..n {
        xs[i] += vxs[i] * dt;
        ys[i] += vys[i] * dt;
    }
}

/// Optional stateful world for future extensions (kept minimal for the workshop).
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
