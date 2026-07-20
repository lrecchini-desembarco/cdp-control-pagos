// Nuevos ingresos (onboarding): alta de un empleado que entra, con sus datos de
// acceso, para imprimir/entregar una tarjeta de bienvenida. La clave es la inicial
// (el empleado la cambia en su primer ingreso), por eso se guarda tal cual para poder
// reimprimirla o copiarla.

export interface NuevoIngreso {
  id: string;
  nombre: string;        // nombre y apellido
  email: string;
  clave: string;         // clave inicial asignada
  puesto?: string;       // puesto o área (opcional)
  fechaIngreso?: string; // ISO YYYY-MM-DD (opcional)
  creado: string;        // ISO timestamp del alta
}

// Texto de la tarjeta, editable desde la propia pantalla.
export interface BienvenidaConfig {
  empresa: string;
  texto: string;
}

export const CONFIG_DEFAULT: BienvenidaConfig = {
  empresa: "El Desembarco",
  texto:
    "Nos alegra que formes parte del equipo. A continuación encontrás tus datos de acceso al sistema. " +
    "Te pedimos conservarlos en un lugar seguro y cambiar la clave en tu primer ingreso.",
};

// ¿Email con forma válida? (validación suave, no exhaustiva)
export function emailValido(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email ?? "").trim());
}

// Normaliza y valida. Devuelve null si falta email o clave (obligatorios).
export function limpiarIngreso(input: Partial<NuevoIngreso>, id: string): NuevoIngreso | null {
  const email = String(input.email ?? "").trim();
  const clave = String(input.clave ?? "").trim();
  if (!email || !clave) return null;
  return {
    id,
    nombre: String(input.nombre ?? "").trim(),
    email,
    clave,
    puesto: String(input.puesto ?? "").trim() || undefined,
    fechaIngreso: String(input.fechaIngreso ?? "").trim() || undefined,
    creado: String(input.creado ?? "").trim() || new Date().toISOString(),
  };
}
