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
  const s = norm(nombre + " " + ruta);
  return /galicia/.test(s) ? "Galicia" : /ciudad|bee_reporte/.test(s) ? "Ciudad" : /macro/.test(s) ? "Macro"
    : /provincia/.test(s) ? "Provincia" : /santander|descargaultimos/.test(s) ? "Santander" : /mercado ?pago/.test(s) ? "Mercado Pago" : "Otro";
}

// Entidad/local desde la ruta relativa (cuando se sube la carpeta). Ej:
// "Extractos Bancarios/DDR/Ciudad/archivo.csv" -> "DDR".
export function entidadDeRuta(ruta: string): string {
  const segs = (ruta || "").split(/[\\/]/).filter(Boolean);
  const i = segs.findIndex((x) => /extractos bancarios/i.test(x));
  let e = i >= 0 ? segs[i + 1] : segs.length > 1 ? segs[0] : "";
  if (/estudio contable/i.test(e || "")) e = (i >= 0 ? segs[i + 2] : segs[1]) || e;
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
  ["Impuestos", /impuesto|iibb|ing.*bruto|ley 25413|sircreb|sellos/i],
  ["Comisiones/gastos", /comision|arancel|gasto|mantenim|cargo/i],
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
    const concepto = String(m.concepto >= 0 ? row[m.concepto] : "").trim().slice(0, 80);
    movs.push({ fecha, mes: fecha.slice(0, 7), banco, local, concepto, ingreso, egreso, categoria: categoriaDe(concepto) });
  }
  return { movs, descartados };
}

// Clave de origen: re-subir un (banco+local+mes) reemplaza esos movimientos.
export const claveOrigen = (m: MovBanco) => `${m.banco}|${m.local}|${m.mes}`;

export interface ResumenBancos {
  total: number; ingresos: number; egresos: number; neto: number;
  desde: string; hasta: string;
  porBanco: GrupoBanco[]; porLocal: GrupoBanco[]; porMes: GrupoBanco[]; porCategoria: GrupoBanco[];
}
export interface GrupoBanco { k: string; n: number; ingresos: number; egresos: number }

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
