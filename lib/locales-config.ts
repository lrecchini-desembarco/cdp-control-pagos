import { readStore, writeStore } from "./store";
import { esPropio } from "./propios";

// Overrides manuales de clasificación por local (editables por admin/operaciones):
//  - tipo: fuerza propio/franquicia (para los que el maestro oficial no clasifica)
//  - operativo: marcar un local como NO operativo (cerrado / fuera de análisis)
// Clave = nombre normalizado (sin sacar "mrt", así no se mezclan marcas).
// Es aparte del maestro de reseñas (lib/locales-store.ts).

export interface LocalOverride {
  tipo?: "propio" | "franquicia";
  operativo?: boolean;
}
export type Overrides = Record<string, LocalOverride>;

const KEY = "locales_config";

export const normLocal = (s: string) =>
  (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

export async function getOverrides(): Promise<Overrides> {
  return (await readStore<Overrides | null>(KEY, null)) ?? {};
}

export async function setOverride(nombre: string, patch: LocalOverride): Promise<Overrides> {
  const ov = await getOverrides();
  const k = normLocal(nombre);
  const next: LocalOverride = { ...(ov[k] ?? {}), ...patch };
  if (next.tipo === undefined) delete next.tipo;
  if (next.operativo === undefined) delete next.operativo;
  if (Object.keys(next).length === 0) delete ov[k];
  else ov[k] = next;
  await writeStore(KEY, ov);
  return ov;
}

/** Tipo efectivo: override manual > lista oficial de propios > franquicia. */
export function tipoEfectivo(nombre: string, ov: Overrides): "propio" | "franquicia" {
  return ov[normLocal(nombre)]?.tipo ?? (esPropio(nombre) ? "propio" : "franquicia");
}

/** Operativo efectivo: por defecto true; el override lo puede apagar. */
export function operativoEfectivo(nombre: string, ov: Overrides): boolean {
  return ov[normLocal(nombre)]?.operativo ?? true;
}
