import { readStore, writeStore } from "./store";
import type { Lista } from "./listas";
import seed from "./listas-seed.json";

// Persistencia de listas de precios. KV en prod; si está vacío, siembra con las
// hojas L1S/L2S/L3K/LP_MG del Excel. Clave = id de lista.

const KEY = "listas";
const SEED = (seed as unknown as { listas: Lista[] }).listas;

export async function getListas(): Promise<Lista[]> {
  const guardado = await readStore<Lista[] | null>(KEY, null);
  return guardado && guardado.length ? guardado : SEED;
}

async function persistir(listas: Lista[]): Promise<Lista[]> {
  await writeStore(KEY, listas);
  return getListas();
}

/** Edita los parámetros de una lista (regalías, publicidad, IIBB, locales, nombre). */
export async function updateLista(id: string, patch: Partial<Lista>): Promise<Lista[]> {
  const listas = (await readStore<Lista[] | null>(KEY, null)) ?? SEED.map((l) => ({ ...l }));
  const i = listas.findIndex((l) => l.id === id);
  if (i < 0) throw new Error("Lista no encontrada.");
  const { precios, id: _omit, ...campos } = patch; // los precios se editan por separado
  listas[i] = { ...listas[i], ...campos };
  return persistir(listas);
}

/** Setea el precio de venta de un producto en una lista. */
export async function setPrecio(id: string, skuTango: string, precio: number): Promise<Lista[]> {
  const listas = (await readStore<Lista[] | null>(KEY, null)) ?? SEED.map((l) => ({ ...l }));
  const i = listas.findIndex((l) => l.id === id);
  if (i < 0) throw new Error("Lista no encontrada.");
  const sku = String(skuTango).trim();
  if (!sku) throw new Error("Falta el SKU.");
  const precios = { ...listas[i].precios };
  const p = Math.round(Number(precio) || 0);
  if (p > 0) precios[sku] = p;
  else delete precios[sku];
  listas[i] = { ...listas[i], precios };
  return persistir(listas);
}
