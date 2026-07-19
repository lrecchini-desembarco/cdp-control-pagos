import type { CanalVenta, Componente } from "./recetas";
import type { Insumo } from "./insumos";
import { precioUnidadDe } from "./insumos";
import type { Lista } from "./listas";

// Importador de recetas/insumos desde el Excel de costos (hoja R_DS de "DS BA Costos
// y Precios" y su maestro de insumos C_INS_BA). Formato LARGO: una fila por componente.
// Puro (recibe filas ya leídas por SheetJS) para poder testear y reusar en cliente.

export interface RecetaImport {
  skuTango: string;
  descripcion: string;
  marca: string;
  canales: CanalVenta[];
  componentes: Componente[];
}

const norm = (s: unknown) => String(s ?? "").trim();
const bajo = (s: unknown) => norm(s).toLowerCase();

// El "Tipo" de la fila (Salón / Todos / Delivery / Mostrador) -> canales de venta.
export function canalesDeTipo(tipo: string): CanalVenta[] {
  const t = bajo(tipo);
  if (t.includes("todos")) return ["salon", "mostrador", "delivery"];
  const out: CanalVenta[] = [];
  if (t.includes("sal")) out.push("salon");       // salón / salon
  if (t.includes("most")) out.push("mostrador");
  if (t.includes("deliv")) out.push("delivery");
  return out;
}

// Fecha de Excel (serial) o texto -> ISO YYYY-MM-DD.
function fechaExcel(v: unknown): string {
  if (typeof v === "number" && v > 20000 && v < 80000) {
    const ms = Math.round((v - 25569) * 86400 * 1000); // 25569 = días 1899-12-30 -> 1970-01-01
    return new Date(ms).toISOString().slice(0, 10);
  }
  const s = norm(v);
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (m) { let y = m[3]; if (y.length === 2) y = "20" + y; return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`; }
  return "";
}

/** Parsea la hoja R_DS (filas crudas, con encabezado en la fila 0).
 *  Columnas: 0 SKU Tango · 1 cód interno · 2 Tipo · 3 Descripción producto ·
 *  4 cód ins Tango · 5 Cód Insumo · 6 desc insumo · 7 Cant · 8 precio unit · 9 importe */
export function parseRDS(filas: unknown[][], marca = "El Desembarco"): RecetaImport[] {
  const prods = new Map<string, RecetaImport>();
  for (const r of filas.slice(1)) {
    const sku = norm(r[0]);
    if (!sku || bajo(r[0]) === "cód. art. tango") continue;
    let p = prods.get(sku);
    if (!p) { p = { skuTango: sku, descripcion: norm(r[3]), marca, canales: canalesDeTipo(norm(r[2])), componentes: [] }; prods.set(sku, p); }
    const insumoCod = norm(r[5]);
    const cant = Number(r[7]) || 0;
    if (insumoCod && cant > 0) p.componentes.push({ insumoCod, cant });
  }
  return Array.from(prods.values());
}

/** Parsea la hoja C_INS_BA (maestro de insumos DS) a Insumo[].
 *  Columnas: 0 cód interno · 1 cód Tango · 2 Dónde · 3 Descripción · 4 Marca ·
 *  5 Proveedor · 6 Presentación · 7 Precio x bulto · 8 Factor UMC · 9 Precio UM ·
 *  10 Fecha · 11 Días · 12 Estado · 13 Obs. (no trae IVA/II -> default 21/0). */
export function parseCInsBA(filas: unknown[][]): Insumo[] {
  const out: Insumo[] = [];
  for (const r of filas.slice(1)) {
    const cod = norm(r[0]);
    if (!cod || bajo(r[0]) === "cod. interno") continue;
    const precioBulto = Number(r[7]) || 0;
    const factor = Number(r[8]) || 1;
    out.push({
      cod,
      codTango: norm(r[1]) || null,
      donde: norm(r[2]) || "DS",
      descripcion: norm(r[3]),
      marca: norm(r[4]),
      proveedor: norm(r[5]),
      presentacion: norm(r[6]),
      precioBulto,
      factor,
      precioUnidad: precioUnidadDe(precioBulto, factor),
      ivaPct: 21,
      iiPct: 0,
      actualizado: fechaExcel(r[10]) || null,
      estado: norm(r[12]),
      obs: norm(r[13]),
    });
  }
  return out;
}

// SKU -> precio desde una hoja de lista (col SKU y col precio, filas con SKU numérico).
function preciosDeHoja(filas: unknown[][], colSku: number, colPrecio: number): Record<string, number> {
  const p: Record<string, number> = {};
  for (const r of filas) {
    const sku = norm(r[colSku]);
    if (!sku || !/^\d/.test(sku)) continue; // saltea encabezados (SKU es numérico)
    const precio = Math.round(Number(r[colPrecio]) || 0);
    if (precio > 0) p[sku] = precio;
  }
  return p;
}

/** Parsea las listas de precios DS del Excel: LP_DS_BA_S (salón, precio col 7) y
 *  LP_DSBA_A (apps, precio col 5). SKU en col 2. DS usa regalías 4% (no 6%). */
export function parseListasDS(rowsSalon: unknown[][] | null, rowsApps: unknown[][] | null): Lista[] {
  const out: Lista[] = [];
  if (rowsSalon) {
    const precios = preciosDeHoja(rowsSalon, 2, 7);
    if (Object.keys(precios).length) out.push({ id: "DS-S", nombre: "El Desembarco · Salón", marca: "El Desembarco", tipo: "salon", regaliasPct: 4, iibbPct: 3, publicidadPct: 0, locales: [], precios });
  }
  if (rowsApps) {
    const precios = preciosDeHoja(rowsApps, 2, 5);
    if (Object.keys(precios).length) out.push({ id: "DS-A", nombre: "El Desembarco · Apps", marca: "El Desembarco", tipo: "apps", regaliasPct: 4, iibbPct: 3, publicidadPct: 0, locales: [], precios });
  }
  return out;
}

export interface PreviaImport {
  recetas: RecetaImport[];
  insumosFaltantes: Insumo[];   // insumos que usan las recetas y NO están en el maestro actual
  codigosSinInsumo: string[];   // insumos usados que no están ni en el maestro ni en C_INS_BA
  skusNuevos: number;
  skusExistentes: number;
  skusOtraMarca: string[];      // SKUs que ya existen con OTRA marca (se van a re-marcar)
}

/** Arma la vista previa cruzando lo parseado contra el estado actual (maestro de
 *  insumos y recetas existentes). No escribe nada. */
export function previaImportacion(
  recetas: RecetaImport[], insumosDS: Insumo[],
  maestroCods: Set<string>, recetasExistentes: { skuTango: string; marca: string }[]
): PreviaImport {
  const codsDS = new Map(insumosDS.map((i) => [i.cod.toLowerCase(), i]));
  const usados = new Set<string>();
  for (const r of recetas) for (const c of r.componentes) usados.add(c.insumoCod.toLowerCase());
  const faltantesCods = Array.from(usados).filter((c) => !maestroCods.has(c));
  const insumosFaltantes: Insumo[] = [];
  const codigosSinInsumo: string[] = [];
  for (const c of faltantesCods) {
    const ins = codsDS.get(c);
    if (ins) insumosFaltantes.push(ins); else codigosSinInsumo.push(c);
  }
  const existMap = new Map(recetasExistentes.map((r) => [r.skuTango, r.marca]));
  let nuevos = 0, existentes = 0; const otraMarca: string[] = [];
  for (const r of recetas) {
    if (existMap.has(r.skuTango)) { existentes++; if (existMap.get(r.skuTango) !== r.marca) otraMarca.push(r.skuTango); }
    else nuevos++;
  }
  return { recetas, insumosFaltantes, codigosSinInsumo, skusNuevos: nuevos, skusExistentes: existentes, skusOtraMarca: otraMarca };
}
