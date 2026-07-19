import { readStore, writeStore } from "./store";
import { precioUnidadDe, type Insumo } from "./insumos";
import seed from "./insumos-seed.json";

// Persistencia del maestro de insumos. KV en prod; si está vacío, siembra con la
// hoja INS_L1 del Excel (lib/insumos-seed.json, 149 insumos reales). Clave = cód.

const KEY = "insumos";
const SEED = seed as Insumo[];

export async function getInsumos(): Promise<Insumo[]> {
  const guardado = await readStore<Insumo[] | null>(KEY, null);
  const base = guardado && guardado.length ? guardado : SEED;
  return [...base].sort((a, b) => a.descripcion.localeCompare(b.descripcion, "es"));
}

function saneo(input: Partial<Insumo>, prev?: Insumo): Insumo {
  const precioBulto = Number(input.precioBulto ?? prev?.precioBulto ?? 0) || 0;
  const factor = Number(input.factor ?? prev?.factor ?? 1) || 1;
  // El precio por unidad se recalcula del bulto/factor (fuente de verdad del costo).
  const precioUnidad = precioUnidadDe(precioBulto, factor);
  return {
    cod: String(input.cod ?? prev?.cod ?? "").trim(),
    codTango: (input.codTango ?? prev?.codTango) || null,
    donde: input.donde ?? prev?.donde ?? "Ambas",
    descripcion: String(input.descripcion ?? prev?.descripcion ?? "").trim(),
    marca: String(input.marca ?? prev?.marca ?? "").trim(),
    proveedor: String(input.proveedor ?? prev?.proveedor ?? "").trim(),
    presentacion: String(input.presentacion ?? prev?.presentacion ?? "").trim(),
    precioBulto,
    factor,
    precioUnidad,
    ivaPct: Number(input.ivaPct ?? prev?.ivaPct ?? 21),
    iiPct: Number(input.iiPct ?? prev?.iiPct ?? 0),
    actualizado: input.actualizado ?? prev?.actualizado ?? new Date().toISOString().slice(0, 10),
    estado: input.estado ?? prev?.estado ?? "",
    obs: input.obs ?? prev?.obs ?? "",
  };
}

/** Alta o edición de un insumo (clave = cod). Si cambia el precio, marca la fecha de hoy. */
export async function upsertInsumo(input: Partial<Insumo>): Promise<Insumo[]> {
  const cod = String(input.cod ?? "").trim();
  if (!cod) throw new Error("El código del insumo es obligatorio.");
  // Partimos del guardado, o del seed si es la primera edición (para no perder el maestro).
  const lista = (await readStore<Insumo[] | null>(KEY, null)) ?? [...SEED];
  const i = lista.findIndex((x) => x.cod === cod);
  const prev = i >= 0 ? lista[i] : undefined;
  const next = saneo({ ...input, cod }, prev);
  // Si cambió el costo (precio de bulto o factor), sellamos la fecha de HOY. Antes esto
  // se condicionaba a `!input.actualizado`, pero el form reenvía el `actualizado` viejo
  // del insumo -> nunca se refrescaba. Ahora el cambio de costo manda siempre.
  if (prev && (prev.precioBulto !== next.precioBulto || prev.factor !== next.factor)) {
    next.actualizado = new Date().toISOString().slice(0, 10);
  }
  if (i >= 0) lista[i] = next;
  else lista.push(next);
  await writeStore(KEY, lista);
  return getInsumos();
}

export async function removeInsumo(cod: string): Promise<Insumo[]> {
  const lista = (await readStore<Insumo[] | null>(KEY, null)) ?? [...SEED];
  await writeStore(KEY, lista.filter((x) => x.cod !== cod));
  return getInsumos();
}
