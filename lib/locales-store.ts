import { readStore, writeStore } from "./store";
import { getMapeos } from "./mapeos-store";

/**
 * Locales para Reseñas. Cada uno con su link de "dejar reseña en Google"
 * (opcional). Se siembran con las sucursales activas y se pueden agregar/editar
 * desde la consola de reseñas (admin).
 */
export interface Local {
  nombre: string;
  googleUrl?: string;
}

function semilla(): Local[] {
  return getMapeos()
    .sucursales.filter((s) => s.activa)
    .map((s) => ({ nombre: s.nombre }));
}

// Soporta el formato viejo (string[]) y el nuevo (Local[]).
function normalizar(raw: unknown): Local[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  return raw.map((x) => (typeof x === "string" ? { nombre: x } : (x as Local)));
}

export function getLocales(): Local[] {
  const base = normalizar(readStore<unknown>("locales", null)) ?? semilla();
  return [...base].sort((a, b) => a.nombre.localeCompare(b.nombre));
}

export function findLocal(nombre: string): Local | undefined {
  const n = nombre.trim().toLowerCase();
  return getLocales().find((l) => l.nombre.toLowerCase() === n);
}

export function upsertLocal(nombre: string, googleUrl?: string): Local[] {
  const n = nombre.trim();
  if (!n) throw new Error("Nombre vacío.");
  const otros = getLocales().filter((l) => l.nombre.toLowerCase() !== n.toLowerCase());
  const previo = findLocal(n);
  const local: Local = { nombre: n, googleUrl: googleUrl !== undefined ? googleUrl.trim() : previo?.googleUrl };
  if (!local.googleUrl) delete local.googleUrl;
  const nuevos = [...otros, local];
  writeStore("locales", nuevos);
  return getLocales();
}

export function removeLocal(nombre: string): Local[] {
  const nuevos = getLocales().filter((l) => l.nombre.toLowerCase() !== nombre.trim().toLowerCase());
  writeStore("locales", nuevos);
  return nuevos;
}
