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

/** Importación masiva de recetas (ej. hoja R_DS). Un solo read+write. Para cada SKU:
 *  nuevo -> crea v1; existente -> actualiza desc/marca/canales y agrega versión SOLO si
 *  los componentes cambiaron (no versiona al pedo al re-importar). Conserva grupo/orden. */
export async function importarRecetas(
  items: { skuTango: string; descripcion?: string; marca?: string; canales?: CanalVenta[]; componentes: Componente[] }[],
  autor?: string
): Promise<{ recetas: Receta[]; creados: number; actualizados: number; versionados: number }> {
  const lista = await leerLista();
  const byId = new Map(lista.map((r) => [r.skuTango, r]));
  const fecha = new Date().toISOString().slice(0, 10);
  let creados = 0, actualizados = 0, versionados = 0;
  for (const it of items) {
    const sku = String(it.skuTango ?? "").trim();
    if (!sku) continue;
    const comps = (it.componentes ?? [])
      .map((c) => ({ insumoCod: String(c.insumoCod ?? "").trim(), cant: Number(c.cant) || 0 }))
      .filter((c) => c.insumoCod && c.cant > 0);
    const canales = saneaCanales(it.canales);
    const prev = byId.get(sku);
    if (!prev) {
      const r: Receta = {
        skuTango: sku, descripcion: it.descripcion ?? sku, marca: it.marca ?? "El Desembarco",
        canales, versiones: comps.length ? [{ version: 1, fecha, autor, componentes: comps }] : [],
      };
      lista.push(r); byId.set(sku, r); creados++;
    } else {
      if (it.descripcion) prev.descripcion = it.descripcion;
      if (it.marca) prev.marca = it.marca;
      if (canales !== undefined) prev.canales = canales;
      const ultima = prev.versiones.at(-1);
      const cambio = comps.length && JSON.stringify(ultima?.componentes ?? []) !== JSON.stringify(comps);
      if (cambio) { prev.versiones.push({ version: (ultima?.version ?? 0) + 1, fecha, autor, componentes: comps }); versionados++; }
      actualizados++;
    }
  }
  await writeStore(KEY, lista);
  return { recetas: await getRecetas(), creados, actualizados, versionados };
}

/** Aplica metadata masiva a productos (grupo/orden/descripción, ej. desde las hojas
 *  de precios DS por Sección). Agrupa y ordena los que existen; crea con nombre los que
 *  faltan (sin receta). Un solo read+write. No toca recetas ni versiones. */
export async function aplicarMetaProductos(
  items: { skuTango: string; descripcion?: string; grupo?: string; orden?: number }[]
): Promise<{ creados: number; actualizados: number }> {
  const lista = await leerLista();
  const byId = new Map(lista.map((r) => [r.skuTango, r]));
  let creados = 0, actualizados = 0;
  for (const it of items) {
    const sku = String(it.skuTango ?? "").trim();
    if (!sku) continue;
    const prev = byId.get(sku);
    if (prev) {
      if (it.grupo !== undefined) prev.grupo = it.grupo ? String(it.grupo).trim() : undefined;
      if (it.orden !== undefined && Number.isFinite(it.orden)) prev.orden = it.orden;
      // La descripción solo se completa si el producto NO tiene receta (para no pisar el nombre real de la receta).
      if (it.descripcion && (!prev.versiones.length || !prev.descripcion || prev.descripcion === sku)) prev.descripcion = it.descripcion;
      actualizados++;
    } else {
      const r: Receta = { skuTango: sku, descripcion: it.descripcion || sku, marca: "El Desembarco", grupo: it.grupo ? String(it.grupo).trim() : undefined, orden: it.orden, canales: [], versiones: [] };
      lista.push(r); byId.set(sku, r); creados++;
    }
  }
  await writeStore(KEY, lista);
  return { creados, actualizados };
}

/** Agrega grupos nuevos al final, preservando el orden de los ya existentes (merge). */
export async function mergeGrupos(nuevos: string[]): Promise<string[]> {
  const actuales = await getGrupos();
  const set = new Set(actuales);
  const merged = [...actuales];
  for (const g of nuevos) { const n = String(g).trim(); if (n && !set.has(n)) { merged.push(n); set.add(n); } }
  return setGrupos(merged);
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
