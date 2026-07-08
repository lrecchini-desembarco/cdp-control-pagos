import { readStore, writeStore } from "./store";
import type { Promo } from "./promos";
import seed from "./promos-seed.json";

// Persistencia de promociones. KV en prod; si está vacío, siembra 2 promos de
// ejemplo reales (Independencia salón + Almuerzos MeLi apps). Clave = id.

const KEY = "promos";
const SEED = seed as Promo[];
const nuevoId = () => "promo-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export async function getPromos(): Promise<Promo[]> {
  const g = await readStore<Promo[] | null>(KEY, null);
  const base = g && g.length ? g : SEED;
  return [...base].sort((a, b) => (b.fechaInicio || "").localeCompare(a.fechaInicio || ""));
}

async function baseActual(): Promise<Promo[]> {
  return (await readStore<Promo[] | null>(KEY, null)) ?? SEED.map((p) => ({ ...p }));
}

/** Alta (sin id) o edición (con id) de una promo. */
export async function savePromo(input: Partial<Promo>): Promise<Promo[]> {
  const lista = await baseActual();
  const productos = (input.productos ?? []).filter((p) => p.skuTango);
  if (input.id) {
    const i = lista.findIndex((p) => p.id === input.id);
    if (i >= 0) lista[i] = { ...lista[i], ...input, id: lista[i].id, productos } as Promo;
  } else {
    if (!input.nombre?.trim()) throw new Error("La promo necesita un nombre.");
    lista.push({
      id: nuevoId(),
      nombre: input.nombre.trim(),
      descripcion: input.descripcion ?? "",
      tipo: input.tipo ?? "salon",
      listaId: input.listaId ?? "",
      marca: input.marca ?? "",
      canal: input.canal,
      fechaInicio: input.fechaInicio ?? new Date().toISOString().slice(0, 10),
      fechaFin: input.fechaFin ?? new Date().toISOString().slice(0, 10),
      pisoPct: input.pisoPct,
      aprobada: false,
      productos,
    });
  }
  await writeStore(KEY, lista);
  return getPromos();
}

export async function setAprobada(id: string, aprobada: boolean): Promise<Promo[]> {
  const lista = await baseActual();
  const i = lista.findIndex((p) => p.id === id);
  if (i >= 0) { lista[i] = { ...lista[i], aprobada }; await writeStore(KEY, lista); }
  return getPromos();
}

export async function removePromo(id: string): Promise<Promo[]> {
  const lista = (await baseActual()).filter((p) => p.id !== id);
  await writeStore(KEY, lista);
  return getPromos();
}
