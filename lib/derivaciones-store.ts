import { randomUUID } from "crypto";
import { readStore, writeStore } from "./store";

/**
 * Derivación: cada vez que un consumidor toca "Calificar en Google" lo
 * registramos (local + momento). No guardamos la reseña en sí (esa queda en
 * Google); esto mide el embudo: cuántos derivamos a Google por local.
 */
export interface Derivacion {
  id: string;
  creadoEn: string; // ISO datetime
  local: string;
}

export function getDerivaciones(local?: string): Derivacion[] {
  const todas = readStore<Derivacion[]>("derivaciones", []);
  const orden = [...todas].sort((a, b) => (a.creadoEn < b.creadoEn ? 1 : -1));
  return local ? orden.filter((d) => d.local === local) : orden;
}

export function addDerivacion(local: string): Derivacion {
  const todas = readStore<Derivacion[]>("derivaciones", []);
  const nueva: Derivacion = { id: randomUUID(), creadoEn: new Date().toISOString(), local: String(local).trim() };
  todas.push(nueva);
  writeStore("derivaciones", todas);
  return nueva;
}

export interface ResumenDerivaciones {
  total: number;
  porLocal: { local: string; cantidad: number }[];
}

export function resumenDerivaciones(d: Derivacion[]): ResumenDerivaciones {
  const m = new Map<string, number>();
  for (const x of d) m.set(x.local, (m.get(x.local) ?? 0) + 1);
  const porLocal = Array.from(m, ([local, cantidad]) => ({ local, cantidad })).sort((a, b) => b.cantidad - a.cantidad);
  return { total: d.length, porLocal };
}
