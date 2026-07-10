import { readStore, writeStore } from "./store";
import { getOrganigrama } from "./organigrama-store";
import { nodoDeEmail, caminoAlRaiz } from "./organigrama";
import { esRol, type Rol } from "./roles";

// Auto-asignación de rol al entrar: cuando alguien entra con Google, se busca su
// casillero en el ORGANIGRAMA por email, se arma el "contexto" (su cargo + toda su
// línea de reporte hacia arriba) y se aplica la primera REGLA que matchee. Así el
// puesto define el acceso solo, sin cargar cada usuario a mano. Sin match -> pendiente.

const KEY = "reglas_auto";

export interface ReglaAuto {
  id: string;
  contiene: string;   // texto (área/cargo). Matchea si aparece en la línea de reporte.
  rol: Rol;
  nav?: string[];     // pantallas propias (opcional; si falta, usa las del rol)
}

// Reglas por defecto (editables desde Usuarios). Se aplican de arriba hacia abajo:
// la primera que matchea gana, así lo más específico va primero.
const SEED: ReglaAuto[] = [
  { id: "sistemas", contiene: "sistemas", rol: "admin" },
  { id: "direccion", contiene: "dirección", rol: "gerencia" },
  { id: "gerencia", contiene: "gerencia", rol: "gerencia" },
  { id: "finanzas", contiene: "finanzas", rol: "gerencia" },
  { id: "administracion", contiene: "administración", rol: "gerencia" },
  { id: "operaciones", contiene: "operaciones", rol: "operaciones" },
  { id: "auditor", contiene: "auditor", rol: "operaciones" },
  { id: "encargado", contiene: "encargado", rol: "local" },
];

export async function getReglasAuto(): Promise<ReglaAuto[]> {
  const saved = await readStore<ReglaAuto[] | null>(KEY, null);
  return Array.isArray(saved) ? saved : SEED;
}

export async function setReglasAuto(reglas: ReglaAuto[]): Promise<ReglaAuto[]> {
  const limpio = reglas
    .filter((r) => r && typeof r.contiene === "string" && r.contiene.trim() && esRol(r.rol))
    .map((r) => ({
      id: String(r.id || r.contiene).trim(),
      contiene: r.contiene.trim(),
      rol: r.rol,
      ...(Array.isArray(r.nav) ? { nav: r.nav } : {}),
    }));
  await writeStore(KEY, limpio);
  return limpio;
}

/**
 * Resuelve rol+nav para un email según el organigrama y las reglas. Devuelve null
 * si el email no está en el organigrama o ninguna regla matchea (=> queda pendiente).
 */
export async function resolverRolAuto(email: string): Promise<{ rol: Rol; nav?: string[]; cargo: string } | null> {
  const [nodos, reglas] = await Promise.all([getOrganigrama(), getReglasAuto()]);
  const nodo = nodoDeEmail(nodos, email);
  if (!nodo) return null;
  // Contexto = cargo del nodo + cargos de toda su línea de reporte hacia la raíz.
  const linea = caminoAlRaiz(nodos, nodo.id);
  const contexto = linea.map((n) => n.cargo).join(" · ").toLowerCase();
  for (const r of reglas) {
    if (contexto.includes(r.contiene.toLowerCase())) {
      return { rol: r.rol, nav: r.nav, cargo: nodo.cargo };
    }
  }
  return null;
}
