import { readStore, writeStore } from "./store";
import type { Componente, Receta } from "./recetas";
import seed from "./recetas-seed.json";

// Persistencia de recetas. KV en prod; si está vacío, siembra con R_MT + R_MG del
// Excel (lib/recetas-seed.json, 106 recetas). Clave = SKU de Tango. Cada edición
// agrega una versión (no se pisa la anterior).

const KEY = "recetas";

interface SeedReceta { skuTango: string; descripcion: string; marca: string; componentes: Componente[]; }

// El seed viene plano (una lista de componentes); lo envolvemos en la versión 1.
const SEED: Receta[] = (seed as SeedReceta[]).map((r) => ({
  skuTango: String(r.skuTango),
  descripcion: r.descripcion,
  marca: r.marca,
  versiones: [{ version: 1, fecha: "2026-07-01", componentes: r.componentes }],
}));

export async function getRecetas(): Promise<Receta[]> {
  const guardado = await readStore<Receta[] | null>(KEY, null);
  const base = guardado && guardado.length ? guardado : SEED;
  return [...base].sort((a, b) => a.descripcion.localeCompare(b.descripcion, "es"));
}

export async function getReceta(skuTango: string): Promise<Receta | null> {
  return (await getRecetas()).find((r) => r.skuTango === skuTango) ?? null;
}

/** Guarda una receta: si existe, agrega una versión nueva; si no, la crea. */
export async function saveReceta(
  input: { skuTango: string; descripcion?: string; marca?: string; componentes: Componente[]; autor?: string }
): Promise<Receta[]> {
  const sku = String(input.skuTango ?? "").trim();
  if (!sku) throw new Error("Falta el SKU de Tango.");
  const comps = (input.componentes ?? [])
    .map((c) => ({ insumoCod: String(c.insumoCod ?? "").trim(), cant: Number(c.cant) || 0 }))
    .filter((c) => c.insumoCod && c.cant > 0);
  if (!comps.length) throw new Error("La receta necesita al menos un componente.");

  const lista = (await readStore<Receta[] | null>(KEY, null)) ?? SEED.map((r) => ({ ...r }));
  const i = lista.findIndex((r) => r.skuTango === sku);
  const fecha = new Date().toISOString().slice(0, 10);

  if (i >= 0) {
    const prev = lista[i];
    const nextVer = (prev.versiones.at(-1)?.version ?? 0) + 1;
    lista[i] = {
      ...prev,
      descripcion: input.descripcion ?? prev.descripcion,
      marca: input.marca ?? prev.marca,
      versiones: [...prev.versiones, { version: nextVer, fecha, autor: input.autor, componentes: comps }],
    };
  } else {
    lista.push({
      skuTango: sku,
      descripcion: input.descripcion ?? sku,
      marca: input.marca ?? "Mr. Tasty",
      versiones: [{ version: 1, fecha, autor: input.autor, componentes: comps }],
    });
  }
  await writeStore(KEY, lista);
  return getRecetas();
}
