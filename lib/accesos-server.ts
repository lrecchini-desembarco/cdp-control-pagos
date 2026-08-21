import { GRUPOS_ACCESOS, type Acceso, type AccesoPublico, type GrupoAccesos } from "./accesos";

// Resolución de los valores de los accesos. SERVER-ONLY: este módulo toca
// process.env y nunca debe importarse desde un componente cliente.
//
// El valor de un secreto sale de la primera env declarada en el catálogo que
// exista. No hay fallback ni valor por defecto: si no está cargada, el acceso
// figura como "no cargado" (mejor un hueco honesto que un placeholder que
// parezca real). Los valores no se loguean nunca.

const valorDe = (a: Acceso): string | null => {
  for (const nombre of a.envs ?? []) {
    const v = process.env[nombre]?.trim();
    if (v) return v;
  }
  return null;
};

const sinEnvs = ({ envs, ...resto }: Acceso): Omit<Acceso, "envs"> => resto;

/** Catálogo para la UI: estructura completa, sin un solo valor secreto. */
export function getAccesosPublicos(): (Omit<GrupoAccesos, "items"> & { items: AccesoPublico[] })[] {
  return GRUPOS_ACCESOS.map((g) => ({
    ...g,
    items: g.items.map((a) => ({
      ...sinEnvs(a),
      ...(a.tipo === "secreto" ? { disponible: valorDe(a) !== null } : {}),
    })),
  }));
}

/** Busca un acceso por id en todos los grupos. */
export const buscarAcceso = (id: string): Acceso | undefined =>
  GRUPOS_ACCESOS.flatMap((g) => g.items).find((a) => a.id === id);

/**
 * El valor en claro de UN acceso. Se pide de a uno, explícitamente.
 * Devuelve null si el acceso no es un secreto o si no hay env cargada.
 */
export function revelarAcceso(id: string): string | null {
  const a = buscarAcceso(id);
  if (!a || a.tipo !== "secreto") return null;
  return valorDe(a);
}
