import { readStore, writeStore } from "./store";
import type { CanalVenta, Componente, Receta } from "./recetas";
import seed from "./recetas-seed.json";

// Persistencia de recetas / maestro de productos. KV en prod; si está vacío, siembra
// con R_MT + R_MG del Excel (lib/recetas-seed.json). Clave = SKU de Tango. Cada
// edición de receta agrega una versión (no se pisa). Los productos pueden existir SIN
// receta (maestro) y tienen grupo, orden y canales de venta.

const KEY = "recetas";
const KEY_GRUPOS = "recetas-grupos"; // orden/lista de grupos de productos

interface SeedReceta { skuTango: string; descripcion: string; marca: string; componentes: Componente[]; }

// El seed viene plano (una lista de componentes); lo envolvemos en la versión 1.
const SEED: Receta[] = (seed as SeedReceta[]).map((r) => ({
  skuTango: String(r.skuTango),
  descripcion: r.descripcion,
  marca: r.marca,
  versiones: [{ version: 1, fecha: "2026-07-01", componentes: r.componentes }],
}));

async function leerLista(): Promise<Receta[]> {
  return (await readStore<Receta[] | null>(KEY, null)) ?? SEED.map((r) => ({ ...r }));
}

// Orden de presentación del maestro: por grupo (según el orden de grupos), luego por
// `orden` manual dentro del grupo, y como desempate la descripción. Los productos sin
// grupo van al final.
function ordenarMaestro(lista: Receta[], grupos: string[]): Receta[] {
  const gi = new Map(grupos.map((g, i) => [g, i]));
  return [...lista].sort((a, b) => {
    const ga = a.grupo ? gi.get(a.grupo) ?? 9998 : 9999;
    const gb = b.grupo ? gi.get(b.grupo) ?? 9998 : 9999;
    if (ga !== gb) return ga - gb;
    const oa = a.orden ?? 1e9, ob = b.orden ?? 1e9;
    if (oa !== ob) return oa - ob;
    return a.descripcion.localeCompare(b.descripcion, "es");
  });
}

export async function getGrupos(): Promise<string[]> {
  return (await readStore<string[] | null>(KEY_GRUPOS, null)) ?? [];
}

/** Reemplaza la lista/orden de grupos. Sirve para crear, renombrar y reordenar. */
export async function setGrupos(grupos: string[]): Promise<string[]> {
  const limpio = grupos.map((g) => String(g).trim()).filter(Boolean);
  const dedup = Array.from(new Set(limpio));
  await writeStore(KEY_GRUPOS, dedup);
  return dedup;
}

/** Registra un grupo en la lista si es nuevo (para que aparezca aunque se cree
 *  asignándolo a un producto). Devuelve la lista vigente. */
async function asegurarGrupo(nombre?: string): Promise<void> {
  const g = String(nombre ?? "").trim();
  if (!g) return;
  const grupos = await getGrupos();
  if (!grupos.includes(g)) await writeStore(KEY_GRUPOS, [...grupos, g]);
}

export async function getRecetas(): Promise<Receta[]> {
  const [lista, grupos] = await Promise.all([leerLista(), getGrupos()]);
  return ordenarMaestro(lista, grupos);
}

export async function getReceta(skuTango: string): Promise<Receta | null> {
  return (await leerLista()).find((r) => r.skuTango === skuTango) ?? null;
}

function saneaCanales(c: unknown): CanalVenta[] | undefined {
  if (!Array.isArray(c)) return undefined;
  const ok = new Set<CanalVenta>(["salon", "mostrador", "delivery"]);
  const out = c.filter((x): x is CanalVenta => ok.has(x as CanalVenta));
  return out.length ? Array.from(new Set(out)) : [];
}

/** Guarda una receta (crea versión nueva). Requiere al menos un componente. */
export async function saveReceta(
  input: { skuTango: string; descripcion?: string; marca?: string; grupo?: string; canales?: CanalVenta[]; componentes: Componente[]; autor?: string }
): Promise<Receta[]> {
  const sku = String(input.skuTango ?? "").trim();
  if (!sku) throw new Error("Falta el SKU de Tango.");
  const comps = (input.componentes ?? [])
    .map((c) => ({ insumoCod: String(c.insumoCod ?? "").trim(), cant: Number(c.cant) || 0 }))
    .filter((c) => c.insumoCod && c.cant > 0);
  if (!comps.length) throw new Error("La receta necesita al menos un componente. Para crear el producto sin receta, usá 'Nuevo producto'.");

  const lista = await leerLista();
  const i = lista.findIndex((r) => r.skuTango === sku);
  const fecha = new Date().toISOString().slice(0, 10);
  const canales = saneaCanales(input.canales);

  if (i >= 0) {
    const prev = lista[i];
    const nextVer = (prev.versiones.at(-1)?.version ?? 0) + 1;
    lista[i] = {
      ...prev,
      descripcion: input.descripcion ?? prev.descripcion,
      marca: input.marca ?? prev.marca,
      grupo: input.grupo !== undefined ? (input.grupo || undefined) : prev.grupo,
      canales: canales !== undefined ? canales : prev.canales,
      versiones: [...prev.versiones, { version: nextVer, fecha, autor: input.autor, componentes: comps }],
    };
  } else {
    lista.push({
      skuTango: sku,
      descripcion: input.descripcion ?? sku,
      marca: input.marca ?? "Mr. Tasty",
      grupo: input.grupo || undefined,
      canales,
      versiones: [{ version: 1, fecha, autor: input.autor, componentes: comps }],
    });
  }
  await writeStore(KEY, lista);
  await asegurarGrupo(input.grupo);
  return getRecetas();
}

/** Crea/actualiza un PRODUCTO del maestro sin tocar la receta (sin crear versión).
 *  Sirve para el maestro (producto sin receta) y para editar grupo/orden/canales. */
export async function guardarProducto(
  input: { skuTango: string; descripcion?: string; marca?: string; grupo?: string; orden?: number; canales?: CanalVenta[] }
): Promise<Receta[]> {
  const sku = String(input.skuTango ?? "").trim();
  if (!sku) throw new Error("Falta el SKU de Tango.");
  const lista = await leerLista();
  const i = lista.findIndex((r) => r.skuTango === sku);
  const canales = saneaCanales(input.canales);
  const patch: Partial<Receta> = {};
  if (input.descripcion !== undefined) patch.descripcion = String(input.descripcion).trim();
  if (input.marca !== undefined) patch.marca = String(input.marca).trim();
  if (input.grupo !== undefined) patch.grupo = input.grupo ? String(input.grupo).trim() : undefined;
  if (input.orden !== undefined) patch.orden = Number.isFinite(input.orden) ? input.orden : undefined;
  if (canales !== undefined) patch.canales = canales;

  if (i >= 0) {
    lista[i] = { ...lista[i], ...patch };
  } else {
    lista.push({
      skuTango: sku,
      descripcion: patch.descripcion ?? sku,
      marca: patch.marca ?? "Mr. Tasty",
      grupo: patch.grupo,
      orden: patch.orden,
      canales: patch.canales,
      versiones: [], // producto del maestro todavía sin receta
    });
  }
  await writeStore(KEY, lista);
  await asegurarGrupo(patch.grupo);
  return getRecetas();
}

/** Renombra un grupo: en la lista de grupos y en todos los productos que lo usan. */
export async function renombrarGrupo(de: string, a: string): Promise<Receta[]> {
  const nombre = String(a ?? "").trim();
  const viejo = String(de ?? "").trim();
  if (!nombre) throw new Error("El nombre del grupo no puede estar vacío.");
  const grupos = await getGrupos();
  await setGrupos(grupos.map((g) => (g === viejo ? nombre : g)));
  const lista = await leerLista();
  for (const r of lista) if (r.grupo === viejo) r.grupo = nombre;
  await writeStore(KEY, lista);
  return getRecetas();
}

/** Elimina un grupo de la lista y deja sin grupo a los productos que lo tenían. */
export async function eliminarGrupo(nombre: string): Promise<Receta[]> {
  const g = String(nombre ?? "").trim();
  const grupos = await getGrupos();
  await setGrupos(grupos.filter((x) => x !== g));
  const lista = await leerLista();
  for (const r of lista) if (r.grupo === g) r.grupo = undefined;
  await writeStore(KEY, lista);
  return getRecetas();
}

/** Reordena productos: fija el `orden` de cada SKU (y opcionalmente su grupo). */
export async function reordenarProductos(items: { skuTango: string; orden: number; grupo?: string }[]): Promise<Receta[]> {
  const lista = await leerLista();
  const byId = new Map(lista.map((r) => [r.skuTango, r]));
  for (const it of items) {
    const r = byId.get(String(it.skuTango));
    if (!r) continue;
    r.orden = Number(it.orden);
    if (it.grupo !== undefined) r.grupo = it.grupo ? String(it.grupo).trim() : undefined;
  }
  await writeStore(KEY, lista);
  return getRecetas();
}
