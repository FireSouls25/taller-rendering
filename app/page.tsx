import { CsrLab } from "@/components/CsrLab";

/**
 * La raíz ES el laboratorio: entra directo a la simulación (CSR por defecto).
 * El conmutador [CSR][SSR][SSG][ISR] vive dentro de la página.
 */
export default function Home() {
  return <CsrLab />;
}
