import * as XLSX from "xlsx";

// Normalizador de extractos bancarios. Come CSV/xls/xlsx crudos de los distintos
// bancos (Galicia, Ciudad, Macro, Provincia, Santander, Mercado Pago) y devuelve
// movimientos unificados. Reusable en cliente (BancosView parsea el archivo subido)
// y server (/api/bancos guarda/lee). Detecta el banco por el CONTENIDO (firmas de
// encabezado) y la entidad/local por la ruta relativa (cuando se sube una carpeta).

export interface MovBanco {
  fecha: string;    // ISO YYYY-MM-DD
  mes: string;      // YYYY-MM
  banco: string;
  local: string;    // entidad/local (de la carpeta) o "General"
  concepto: string;
  ingreso: number;
  egreso: number;
  categoria: string;
  cuit?: string;    // CUIT de la contraparte si aparece en el concepto (11 díg)
}

// CUIT de la contraparte: primer CUIT válido en el texto (formato 30-12345678-9 o
// 30123456789). Sirve para cruzar con las bases de proveedores/clientes.
export function extraerCuit(s: string): string | undefined {
  const m = String(s || "").match(/\b(20|23|24|27|30|33|34)[-.]?\d{8}[-.]?\d\b/);
  return m ? m[0].replace(/[-.]/g, "") : undefined;
}

const CAP = 5e10; // ningún movimiento real supera ~50 mil M -> arriba = lectura corrupta

export function parseNumBanco(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  let t = String(v ?? "").replace(/[^0-9.,-]/g, "").trim();
  if (!t) return 0;
  const neg = t.startsWith("-");
  t = t.replace(/-/g, "");
  const c = t.lastIndexOf(","), d = t.lastIndexOf(".");
  if (c >= 0 && d >= 0) t = c > d ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  else if (c >= 0) { const n = (t.match(/,/g) || []).length; t = n > 1 ? t.replace(/,/g, "") : t.replace(",", "."); }
  else if (d >= 0) { const p = t.split("."); if (p.length > 2 || p[p.length - 1].length === 3) t = t.replace(/\./g, ""); }
  const n = parseFloat(t);
  return Number.isFinite(n) ? (neg ? -n : n) : 0;
}

function isoDe(s: unknown): string {
  const str = String(s || "").trim();
  let m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = str.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
  if (m) { let [, d, mo, y] = m; if (y.length === 2) y = "20" + y; return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`; }
  return "";
}
const norm = (s: unknown) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// Filas (matriz) de un archivo, desde su contenido binario.
export function filasDeArchivo(nombre: string, data: ArrayBuffer | Uint8Array): string[][] {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (/\.csv$/i.test(nombre)) {
    let txt = new TextDecoder("utf-8").decode(bytes);
    if (txt.includes("�")) txt = new TextDecoder("latin1").decode(bytes); // Ciudad viene Latin-1
    txt = txt.replace(/^﻿/, "");
    const first = txt.split(/\r?\n/)[0] || "";
    const delim = first.split(";").length > first.split(",").length ? ";" : ",";
    return txt.split(/\r?\n/).filter((l) => l.trim() !== "").map((l) => l.split(delim));
  }
  const wb = XLSX.read(bytes, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, raw: false, defval: "" });
}

// Banco por firma de contenido (robusto aunque el archivo se suba suelto), con la
// ruta/nombre como respaldo.
export function detectarBanco(rows: string[][], nombre: string, ruta = ""): string {
  const cab = rows.slice(0, 12).map((r) => r.map(norm).join(" ")).join(" | ");
  if (/initial_balance|release_date|transaction_net|mercado ?pago/.test(cab + " " + norm(ruta))) return "Mercado Pago";
  if (/grupo de conceptos|debitos.*creditos|numero de terminal/.test(cab)) return "Galicia";
  if (/cuit cuenta|n. de comprobante/.test(cab)) return "Ciudad";
  if (/causal.*concepto|nro. de referencia/.test(cab)) return "Macro";
  if (/numero secuencia|nombre comercio/.test(cab)) return "Provincia";
  if (/suc. origen|importe pesos/.test(cab)) return "Santander";
  if (/icbc|industrial and commercial/.test(cab)) return "ICBC";
  if (/supervielle/.test(cab)) return "Supervielle";
  const s = norm(nombre + " " + ruta);
  return /galicia/.test(s) ? "Galicia" : /ciudad|bee_reporte/.test(s) ? "Ciudad" : /macro/.test(s) ? "Macro"
    : /provincia/.test(s) ? "Provincia" : /santander|descargaultimos/.test(s) ? "Santander" : /mercado ?pago/.test(s) ? "Mercado Pago"
    : /icbc/.test(s) ? "ICBC" : /supervielle/.test(s) ? "Supervielle" : "Otro";
}

// Entidad/local desde la ruta relativa (cuando se sube la carpeta). Ej:
// "Extractos Bancarios/DDR/Ciudad/archivo.csv" -> "DDR".
export function entidadDeRuta(ruta: string): string {
  const segs = (ruta || "").split(/[\\/]/).filter(Boolean);
  // ÚLTIMO segmento tipo "Extractos Bancarios" (la carpeta puede venir anidada y/o con
  // sufijo de descarga, ej. "Extractos Bancarios-2026.../Extractos Bancarios/DDR/...").
  let i = -1;
  for (let k = 0; k < segs.length; k++) if (/extractos bancarios/i.test(segs[k])) i = k;
  let e = i >= 0 ? segs[i + 1] : segs.length > 1 ? segs[0] : "";
  // Saltear carpetas contenedoras que no son la entidad.
  while (/estudio contable|extractos bancarios/i.test(e || "")) {
    i += 1; e = segs[i + 1] || "";
    if (i > segs.length) break;
  }
  return e || "General";
}

function mapear(rows: string[][]): { start: number; fecha: number; imp: number; deb: number; cred: number; concepto: number } | null {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const h = rows[i].map(norm);
    const fecha = h.findIndex((x) => /^fecha|release_date/.test(x));
    const imp = h.findIndex((x) => /^importe|^monto|net_amount|transaction_net|importe pesos/.test(x));
    const deb = h.findIndex((x) => /^debito/.test(x));
    const cred = h.findIndex((x) => /^credito/.test(x));
    if (fecha >= 0 && (imp >= 0 || (deb >= 0 && cred >= 0))) {
      return { start: i + 1, fecha, imp, deb, cred, concepto: h.findIndex((x) => /concepto|descrip|transaction_type|causal/.test(x)) };
    }
  }
  return null;
}

const CATS: [string, RegExp][] = [
  ["Acreditación tarjeta", /acredit|vta con tarj|venta con tarj|nave|liquidacion de diner|cobranza|com fv/i],
  ["Transferencia", /transferencia|debin|transf/i],
  ["Impuestos", /impuesto|iibb|ing.*bruto|ley 25413|sircreb|sellos|percep|retenc|iva/i],
  ["Gastos bancarios", /comision|arancel|gasto|mantenim|cargo|servicio de cuenta/i],
  ["Préstamo/Echeq", /prestamo|cuota|echeq|cheque/i],
  ["Rendimientos", /rendimiento/i],
];
export function categoriaDe(concepto: string): string {
  const c = norm(concepto);
  for (const [lbl, re] of CATS) if (re.test(c)) return lbl;
  return "Otros";
}

// Parsea un archivo -> movimientos unificados (+ descartados por corruptos).
export function parseArchivoBanco(nombre: string, ruta: string, data: ArrayBuffer | Uint8Array): { movs: MovBanco[]; descartados: number; error?: string } {
  let rows: string[][];
  try { rows = filasDeArchivo(nombre, data); } catch (e) { return { movs: [], descartados: 0, error: e instanceof Error ? e.message : "no se pudo leer" }; }
  const m = mapear(rows);
  if (!m) return { movs: [], descartados: 0, error: "no encontré encabezado (fecha + importe/débito-crédito)" };
  const banco = detectarBanco(rows, nombre, ruta);
  const local = entidadDeRuta(ruta || nombre);
  const movs: MovBanco[] = [];
  let descartados = 0;
  for (let r = m.start; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.every((c) => String(c).trim() === "")) continue;
    const fecha = isoDe(row[m.fecha]);
    if (!fecha) continue;
    let ingreso = 0, egreso = 0;
    if (m.deb >= 0 && m.cred >= 0) { egreso = Math.abs(parseNumBanco(row[m.deb])); ingreso = Math.abs(parseNumBanco(row[m.cred])); }
    else { const v = parseNumBanco(row[m.imp]); if (v >= 0) ingreso = v; else egreso = -v; }
    if (ingreso === 0 && egreso === 0) continue;
    if (ingreso > CAP || egreso > CAP) { descartados++; continue; }
    const conceptoFull = String(m.concepto >= 0 ? row[m.concepto] : "").trim();
    const concepto = conceptoFull.slice(0, 80);
    // CUIT: del texto COMPLETO (no del truncado). Solo de la columna de descripción,
    // NO de toda la fila: columnas como "CUIT Cuenta" traen el CUIT PROPIO, no el de la contraparte.
    movs.push({ fecha, mes: fecha.slice(0, 7), banco, local, concepto, ingreso, egreso, categoria: categoriaDe(concepto), cuit: extraerCuit(conceptoFull) });
  }
  return { movs, descartados };
}

// ── PDFs ────────────────────────────────────────────────────────────────────
// El texto del PDF lo extrae el cliente con pdfjs (así pdfjs no entra al bundle
// del server) y nos pasa los items {s,x,y} por página. Acá parseamos por DELTA DE
// SALDO: cada fila trae su saldo; el movimiento es (saldo − saldo anterior). Es
// header-independiente (funciona aunque el encabezado venga fragmentado) y se
// auto-valida. Verificado contra Galicia/Macro/Ciudad: |delta| == monto de la fila.
export interface PdfItem { s: string; x: number; y: number }

// Un token es un importe si termina en 2 decimales (con , o . como separador),
// tolerando "$" pegado y signo (Macro trae "$ -673,17"; Provincia usa punto "-397.51").
const esNum = (s: string) => /^\$?\s*-?\d[\d.,]*[.,]\d{2}-?\s*$/.test(s.trim());
const MES3: Record<string, string> = { ene: "01", feb: "02", mar: "03", abr: "04", may: "05", jun: "06", jul: "07", ago: "08", sep: "09", oct: "10", nov: "11", dic: "12" };
function fechaPdf(s: string): string {
  let m = s.match(/^(\d{2})\/(\d{2})\/(\d{2,4})$/);
  if (m) { let y = m[3]; if (y.length === 2) y = "20" + y; return `${y}-${m[2]}-${m[1]}`; }
  m = s.match(/^(\d{2})-([A-Za-z]{3})-(\d{4})$/);
  if (m) { const mo = MES3[m[2].toLowerCase()]; return mo ? `${m[3]}-${mo}-${m[1]}` : ""; }
  return "";
}
function detectarBancoPdf(texto: string, ruta: string): string {
  const tr = norm(texto) + " " + norm(ruta); // texto del PDF + ruta (respaldo cuando el texto no nombra al banco)
  if (/mercado ?pago|release_date/.test(tr)) return "Mercado Pago";
  if (/banco galicia|resumen de cuenta corriente|galicia/.test(tr)) return "Galicia";
  if (/banco macro|macro/.test(tr)) return "Macro";
  if (/banco ciudad|ciudad|cid campeador/.test(tr)) return "Ciudad";
  if (/santander/.test(tr)) return "Santander";
  if (/provincia/.test(tr)) return "Provincia";
  if (/icbc|industrial and commercial/.test(tr)) return "ICBC";
  if (/supervielle/.test(tr)) return "Supervielle";
  return "Otro";
}

interface FilaPdf { ancla?: number; fecha?: string; concepto?: string; mov?: number | null; saldo?: number }

/** Parsea los items de texto de un PDF (por página) a movimientos.
 * Cada fila trae un IMPORTE (columna) y un SALDO corrido. Dos casos:
 *  - Banco que FIRMA el importe (hay negativos, ej. Macro/Galicia/Provincia) -> el
 *    signo da ingreso/egreso (funciona en cualquier orden de filas).
 *  - Banco que NO firma (ej. Ciudad) -> se deduce del delta del saldo (asume ascendente).
 * La validación es order-agnostic: |importe| debe coincidir con |saldo − vecino|
 * (arriba o abajo). Si no cuadra en >30% de las filas, se rechaza (tarjeta/escaneado). */
export function parsePdfItems(pags: PdfItem[][], nombre: string, ruta: string): { movs: MovBanco[]; descartados: number; error?: string } {
  const lineasTxt: string[] = [];
  const filas: FilaPdf[] = [];
  for (const items of pags) {
    const byY = new Map<number, PdfItem[]>();
    for (const i of items) { if (!i.s.trim()) continue; const a = byY.get(i.y) ?? []; a.push(i); byY.set(i.y, a); }
    for (const y of Array.from(byY.keys()).sort((a, b) => b - a)) {
      const ln = (byY.get(y) as PdfItem[]).sort((a, b) => a.x - b.x);
      const txt = ln.map((i) => i.s).join(" ");
      lineasTxt.push(txt);
      const ant = txt.match(/SALDO\s+(?:ANTERIOR|ULTIMO EXTRACTO)[^0-9-]*(-?[\d.]+,\d{2}-?)/i);
      if (ant) { filas.push({ ancla: parseNumBanco(ant[1]) }); continue; }
      const fecha = fechaPdf(ln[0]?.s || "");
      if (!fecha) continue;
      const nums = ln.filter((i) => esNum(i.s));
      if (!nums.length) continue;
      const saldo = parseNumBanco(nums[nums.length - 1].s); // el más a la derecha = saldo
      const mov = nums.length >= 2 ? parseNumBanco(nums[nums.length - 2].s) : null;
      const concepto = ln.slice(1).filter((i) => !esNum(i.s) && !fechaPdf(i.s)).map((i) => i.s).join(" ").trim().slice(0, 80);
      filas.push({ fecha, concepto, mov, saldo });
    }
  }
  const datos = filas.filter((f) => f.fecha);
  if (!datos.length) return { movs: [], descartados: 0, error: "no reconocí movimientos (¿PDF escaneado o formato nuevo?)" };
  // ¿el banco firma los importes? (algún importe negativo en la columna de movimiento)
  const firmado = datos.some((f) => f.mov != null && f.mov < 0);
  // Validación order-agnostic: |importe| cuadra con el salto de saldo contra un vecino.
  let desconf = 0, evaluadas = 0;
  for (let i = 0; i < datos.length; i++) {
    const f = datos[i]; if (f.mov == null) continue; evaluadas++;
    const m = Math.abs(f.mov);
    const okPrev = datos[i - 1]?.saldo != null && Math.abs(Math.abs((f.saldo as number) - (datos[i - 1].saldo as number)) - m) < 2;
    const okNext = datos[i + 1]?.saldo != null && Math.abs(Math.abs((f.saldo as number) - (datos[i + 1].saldo as number)) - m) < 2;
    if (!okPrev && !okNext) desconf++;
  }
  if (evaluadas && desconf / evaluadas > 0.3) return { movs: [], descartados: desconf, error: "formato no reconocido (los importes no cuadran con el saldo — ¿resumen de tarjeta o escaneado?)" };
  // Armar movimientos.
  const movs: MovBanco[] = [];
  let saldoPrev: number | null = null;
  for (const f of filas) {
    if (f.ancla != null) { saldoPrev = f.ancla; continue; }
    if (!f.fecha) continue;
    let ingreso = 0, egreso = 0;
    if (firmado && f.mov != null) {
      ingreso = f.mov > 0 ? f.mov : 0; egreso = f.mov < 0 ? -f.mov : 0;
    } else {
      if (saldoPrev == null) { saldoPrev = f.saldo as number; continue; }
      const delta = (f.saldo as number) - saldoPrev;
      ingreso = delta > 0 ? delta : 0; egreso = delta < 0 ? -delta : 0;
    }
    saldoPrev = f.saldo as number;
    if (ingreso === 0 && egreso === 0) continue;
    const concepto = f.concepto ?? "";
    movs.push({ fecha: f.fecha, mes: f.fecha.slice(0, 7), banco: "", local: "", concepto, ingreso, egreso, categoria: categoriaDe(concepto), cuit: extraerCuit(concepto) });
  }
  if (!movs.length) return { movs: [], descartados: desconf, error: "no reconocí movimientos (¿PDF escaneado o formato nuevo?)" };
  const banco = detectarBancoPdf(lineasTxt.slice(0, 40).join(" "), ruta);
  const local = entidadDeRuta(ruta || nombre);
  for (const m of movs) { m.banco = banco; m.local = local; }
  return { movs, descartados: desconf };
}

// ¿Es un CUIT/CUIL con forma real? 11 dígitos, prefijo válido (persona/empresa) y
// no todos el mismo dígito -> descarta placeholders tipo 11111111111 / 00000000000
// que ensucian las bases (aparecerían como una contraparte fantasma en el cruce).
export function cuitValido(cuit: string): boolean {
  const d = String(cuit).replace(/[^0-9]/g, "");
  if (d.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(d)) return false; // todos iguales (11111111111, 00000000000…)
  return /^(20|23|24|27|30|33|34)/.test(d); // prefijos reales de CUIT/CUIL
}

export interface ResultadoBase {
  entries: { cuit: string; nombre: string; tipo: TipoContraparte }[];
  filas: number;       // filas de datos con contenido
  invalidas: number;   // descartadas por CUIT inválido (placeholder/prefijo/longitud) o sin nombre
  duplicadas: number;  // filas con un CUIT ya visto en este archivo
  error?: string;
}

// Parsea una planilla de clientes/proveedores (export de Tango u otra) -> entradas
// CUIT+nombre (deduplicadas por CUIT). Auto-detecta las columnas CUIT y Razón Social/Nombre.
export function parseBaseArchivo(nombre: string, data: ArrayBuffer | Uint8Array, tipo: TipoContraparte): ResultadoBase {
  let rows: string[][];
  try { rows = filasDeArchivo(nombre, data); } catch { return { entries: [], filas: 0, invalidas: 0, duplicadas: 0, error: "no se pudo leer el archivo" }; }
  let hi = -1, iCuit = -1, iNom = -1;
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const h = rows[i].map(norm);
    const c = h.findIndex((x) => /cuit|c\.?u\.?i\.?t|cuil|documento|nro.*doc|n.*documento/.test(x));
    const n = h.findIndex((x) => /raz[oó]?n social|nombre|denominaci|apellido|cliente|proveedor/.test(x));
    if (c >= 0 && n >= 0) { hi = i; iCuit = c; iNom = n; break; }
  }
  if (hi < 0) return { entries: [], filas: 0, invalidas: 0, duplicadas: 0, error: "no encontré columnas de CUIT y Nombre/Razón Social. Revisá los encabezados." };
  const entries: { cuit: string; nombre: string; tipo: TipoContraparte }[] = [];
  const vistos = new Set<string>();
  let filas = 0, invalidas = 0, duplicadas = 0;
  for (let r = hi + 1; r < rows.length; r++) {
    const cuit = String(rows[r]?.[iCuit] ?? "").replace(/[^0-9]/g, "");
    const nom = String(rows[r]?.[iNom] ?? "").trim();
    if (!cuit && !nom) continue; // fila vacía: no la cuento
    filas++;
    if (!cuitValido(cuit) || !nom) { invalidas++; continue; }
    if (vistos.has(cuit)) { duplicadas++; continue; }
    vistos.add(cuit);
    entries.push({ cuit, nombre: nom, tipo });
  }
  return entries.length
    ? { entries, filas, invalidas, duplicadas }
    : { entries: [], filas, invalidas, duplicadas, error: "encontré las columnas pero ninguna fila con CUIT válido (11 díg) + nombre" };
}

// Clave de origen: re-subir un (banco+local+mes) reemplaza esos movimientos.
export const claveOrigen = (m: MovBanco) => `${m.banco}|${m.local}|${m.mes}`;

export interface ResumenBancos {
  total: number; ingresos: number; egresos: number; neto: number;
  desde: string; hasta: string;
  porBanco: GrupoBanco[]; porLocal: GrupoBanco[]; porMes: GrupoBanco[]; porCategoria: GrupoBanco[];
}
export interface GrupoBanco { k: string; n: number; ingresos: number; egresos: number }
export interface GrupoCuit { cuit: string; n: number; monto: number; nombre?: string; tipo?: string }

// CUITs PROPIOS del grupo (razón social) — de "Locales por sociedad". Los movimientos
// hacia/desde estos CUIT son traspasos INTERNOS, no proveedores/clientes.
export const PROPIAS: Record<string, string> = {
  "30719082579": "Desembarco Nuñez S.A.",
  "30719043948": "Desembarco Mataderos S.A.",
  "30717136795": "Desembarco del Rey S.R.L.",
  "30719051630": "Desembarco Ramos Mejía S.A.",
  "33719043769": "Desembarco Laferrere S.A.",
  "30719071348": "Desembarco Villa Urquiza S.A.",
  "30719071356": "Desembarco Colegiales S.A.",
  "30717521958": "Daga Gourmet S.R.L.",
  "30718981421": "Desembarco Donado S.A.",
  "30716747200": "Burconi SAS",
  "30718511034": "Cloud Management Capital S.R.L.",
  "30719201012": "Wiñaypaq S.R.L.",
};
export type TipoContraparte = "propia" | "cliente" | "proveedor" | "ambos";
export interface BaseEntry { nombre: string; tipo: TipoContraparte }

/** Base completa CUIT→{nombre,tipo}: propias (seed) + lo cargado (clientes/proveedores). */
export function baseCompleta(cargadas: Record<string, BaseEntry> = {}): Record<string, BaseEntry> {
  const base: Record<string, BaseEntry> = {};
  for (const [cuit, e] of Object.entries(cargadas)) base[cuit] = e;                       // clientes/proveedores cargados
  for (const [cuit, nombre] of Object.entries(PROPIAS)) base[cuit] = { nombre, tipo: "propia" }; // los PROPIOS siempre ganan (inter-empresa = interno)
  return base;
}
/** Enriquece los grupos por CUIT con nombre y tipo desde la base. */
export function aplicarBase(grupos: GrupoCuit[], base: Record<string, BaseEntry>): GrupoCuit[] {
  return grupos.map((g) => { const b = base[g.cuit]; return b ? { ...g, nombre: b.nombre, tipo: b.tipo } : g; });
}

// Desglose por CUIT de contraparte (solo movimientos que traen CUIT), para ingresos
// o egresos. Base para cruzar con proveedores/clientes.
export function porCuit(movs: MovBanco[], tipo: "ingreso" | "egreso"): GrupoCuit[] {
  const mp = new Map<string, GrupoCuit>();
  for (const m of movs) {
    const v = tipo === "ingreso" ? m.ingreso : m.egreso;
    if (v <= 0 || !m.cuit) continue;
    const a = mp.get(m.cuit) ?? { cuit: m.cuit, n: 0, monto: 0 };
    a.n++; a.monto += v; mp.set(m.cuit, a);
  }
  return Array.from(mp.values()).sort((a, b) => b.monto - a.monto);
}

// Catálogo de contrapartes (CUITs presentes en los movimientos) con su razón social y
// tipo, para el filtro general "por razón social". Ordenado por plata movida (desc).
export interface Contraparte { cuit: string; nombre?: string; tipo?: string; n: number; monto: number }
export function listaContrapartes(movs: MovBanco[], base: Record<string, BaseEntry>): Contraparte[] {
  const mp = new Map<string, Contraparte>();
  for (const m of movs) {
    if (!m.cuit) continue;
    const a = mp.get(m.cuit) ?? { cuit: m.cuit, n: 0, monto: 0 };
    a.n++; a.monto += (m.ingreso || 0) + (m.egreso || 0);
    mp.set(m.cuit, a);
  }
  return Array.from(mp.values())
    .map((c) => { const e = base[c.cuit]; return e ? { ...c, nombre: e.nombre, tipo: e.tipo } : c; })
    .sort((a, b) => b.monto - a.monto);
}

// Intercompany: movimientos cuya CONTRAPARTE es una empresa PROPIA del grupo (cuit en
// PROPIAS / tipo "propia"). Es la plata que se mueve entre tus propias cuentas — sin
// terceros (Rappi, PedidosYa, clientes, proveedores). Agrupado por empresa propia.
export interface EmpresaIntercompany { cuit: string; nombre: string; ingreso: number; egreso: number; neto: number; n: number }
export interface ResumenIntercompany { total: number; ingresos: number; egresos: number; n: number; porEmpresa: EmpresaIntercompany[] }
export function resumirIntercompany(movs: MovBanco[], base: Record<string, BaseEntry>): ResumenIntercompany {
  const mp = new Map<string, { ingreso: number; egreso: number; n: number; nombre: string }>();
  let ingresos = 0, egresos = 0, n = 0;
  for (const m of movs) {
    if (!m.cuit) continue;
    const e = base[m.cuit];
    if (!e || e.tipo !== "propia") continue; // solo contrapartes propias
    const a = mp.get(m.cuit) ?? { ingreso: 0, egreso: 0, n: 0, nombre: e.nombre };
    a.ingreso += m.ingreso; a.egreso += m.egreso; a.n += 1; mp.set(m.cuit, a);
    ingresos += m.ingreso; egresos += m.egreso; n += 1;
  }
  const porEmpresa = Array.from(mp.entries())
    .map(([cuit, v]) => ({ cuit, nombre: v.nombre, ingreso: v.ingreso, egreso: v.egreso, neto: v.ingreso - v.egreso, n: v.n }))
    .sort((a, b) => (b.ingreso + b.egreso) - (a.ingreso + a.egreso));
  return { total: ingresos + egresos, ingresos, egresos, n, porEmpresa };
}

export function resumirBancos(movs: MovBanco[]): ResumenBancos {
  const grp = (key: (m: MovBanco) => string): GrupoBanco[] => {
    const mp = new Map<string, GrupoBanco>();
    for (const x of movs) { const k = key(x) || "(s/d)"; const a = mp.get(k) ?? { k, n: 0, ingresos: 0, egresos: 0 }; a.n++; a.ingresos += x.ingreso; a.egresos += x.egreso; mp.set(k, a); }
    return Array.from(mp.values());
  };
  const fechas = movs.map((m) => m.fecha).sort();
  return {
    total: movs.length,
    ingresos: movs.reduce((s, x) => s + x.ingreso, 0),
    egresos: movs.reduce((s, x) => s + x.egreso, 0),
    neto: movs.reduce((s, x) => s + x.ingreso - x.egreso, 0),
    desde: fechas[0] ?? "", hasta: fechas[fechas.length - 1] ?? "",
    porBanco: grp((m) => m.banco).sort((a, b) => b.ingresos + b.egresos - a.ingresos - a.egresos),
    porLocal: grp((m) => m.local).sort((a, b) => b.ingresos + b.egresos - a.ingresos - a.egresos),
    porMes: grp((m) => m.mes).sort((a, b) => a.k.localeCompare(b.k)),
    porCategoria: grp((m) => m.categoria).sort((a, b) => b.ingresos + b.egresos - a.ingresos - a.egresos),
  };
}
