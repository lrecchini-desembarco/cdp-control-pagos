// Cuentas Corrientes de Franquicias. Toma el export del estado de cuenta (una fila
// por factura pendiente) y RECALCULA todo lo derivado (días de mora, tasa, punitorios,
// saldo, neto) con parámetros CONTROLABLES — así el usuario decide qué se suma y cómo,
// en vez de confiar en las columnas ya calculadas del Excel. Verificado contra el
// archivo real: las fórmulas reproducen los valores del Excel al peso.
//
// Fórmulas (validadas 561/561 filas):
//   saldo       = importe − cobrado
//   díasMora    = fechaCorte − vencimiento   (0 si no venció)
//   tasa%       = baseAnual + diaria × díasMora
//   punitorios  = baseCalc × (tasa/100) / divisor × díasMora
//   neto        = saldo + punitorios

export interface FacturaCC {
  clienteId: string;   // "2003"
  cliente: string;     // "NADA PUEDE MALIR SAL SRL"
  vencimiento: string; // ISO YYYY-MM-DD
  tipo: string;        // "FAC"
  nro: string;
  importe: number;     // Importe pendiente (CTE) — original de la deuda
  cobrado: number;     // Cobrado aplicado
  empresa: string;     // marca, canónica
  local: string;
  detalle: string;     // CDP / REGALIAS FAC / INCOBRABLES / TANGO Y GESTIÓN DE APPS / ...
  contacto: string;    // gestión de cobranza (editable en la app, ver Gestion)
  obs: string;
  mes: string;
  promesa?: string;    // fecha de promesa de pago (gestión en la app), ISO
  estado?: string;     // estado de cobranza puesto A MANO (ver ESTADOS_CC); "" = automático
  manual?: boolean;    // factura cargada a mano (no vino del estado de cuenta)
}

// Estados de cobranza que se ponen a mano (además del automático Vencida/Por vencer).
export const ESTADOS_CC = ["En gestión", "Prometido", "Cobrada", "Refinanciada", "Incobrable", "En reclamo"];
// Estado a nivel FRANQUICIADO (etiqueta de situación del cliente, manual).
export const ESTADOS_FRANQ = ["Al día", "En gestión", "Moroso", "Plan de pago", "En reclamo", "Incobrable"];
export interface ClienteCC { estado?: string; nota?: string; telefono?: string; email?: string; cuit?: string }
export const esCobradaEstado = (estado: string) => /cobrad/i.test(estado || "");         // marcada cobrada
export const esIncobrableEstado = (estado: string) => /incobrable/i.test(estado || "");

const norm = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
// Clave ESTABLE del franquiciado = nombre normalizado (sin acentos/casing/espacios de más).
// Unifica al mismo franquiciado aunque venga con varios N° de cliente o casing distinto,
// y no depende del N° (que en el Excel a veces falta o se repite entre clientes distintos).
export const claveFranq = (nombre: string) => norm(nombre).replace(/\s+/g, " ") || "(sin dato)";

// Registro de COBROS: cada pago que ingresa se registra acá (contra una factura) y
// baja su saldo, sin tener que re-subir el estado de cuenta. Se guarda aparte.
export interface CobroCC { id: string; fecha: string; nroFactura: string; importe: number; cliente?: string; local?: string; empresa?: string; nota?: string }

/** Superpone los cobros registrados: suma al "cobrado" de la factura (por comprobante),
 *  topeado al importe (nunca saldo negativo). Es aditivo al cobrado del estado de cuenta. */
export function aplicarCobros(facturas: FacturaCC[], cobros: CobroCC[]): FacturaCC[] {
  if (!cobros?.length) return facturas;
  const porNro = new Map<string, number>();
  for (const c of cobros) if (c.nroFactura) porNro.set(c.nroFactura, (porNro.get(c.nroFactura) ?? 0) + (Number(c.importe) || 0));
  return facturas.map((f) => {
    const add = porNro.get(f.nro);
    return add ? { ...f, cobrado: Math.min(f.importe, f.cobrado + add) } : f;
  });
}

// Capa de GESTIÓN de cobranza — se edita en la app y se guarda APARTE de las facturas
// (keyed por comprobante), así sobrevive a re-subir el estado de cuenta. Se superpone.
export interface Gestion { contacto?: string; promesa?: string; nota?: string; estado?: string }
export const gestionKey = (f: { clienteId: string; nro: string }) => (f.nro ? `${f.clienteId}|${f.nro}` : "");

/** Superpone la gestión guardada (por comprobante) sobre las facturas del snapshot. */
export function aplicarGestion(facturas: FacturaCC[], g: Record<string, Gestion>): FacturaCC[] {
  if (!g || !Object.keys(g).length) return facturas;
  return facturas.map((f) => {
    const o = g[gestionKey(f)];
    if (!o) return f;
    return { ...f, contacto: o.contacto ?? f.contacto, promesa: o.promesa ?? f.promesa, obs: o.nota ?? f.obs, estado: o.estado ?? f.estado };
  });
}

export interface ParamsCC {
  fechaCorte: string;                 // ISO — al día de: recalcula mora/punitorios
  baseAnual: number;                  // % base de la tasa (default 2)
  diaria: number;                     // % por día de mora (default 0.07)
  divisor: number;                    // días del año para prorratear (default 365)
  baseCalc: "importe" | "saldo";      // sobre qué se calculan los punitorios (default importe)
  incluirIncobrables: boolean;        // sumar los "INCOBRABLES" al cobrable (default false)
}

export const PARAMS_DEFAULT: ParamsCC = {
  fechaCorte: "", baseAnual: 2, diaria: 0.07, divisor: 365, baseCalc: "importe", incluirIncobrables: false,
};

export interface FacturaCosteada extends FacturaCC {
  saldo: number;
  diasMora: number;    // días de atraso (0 si no venció)
  diasMoraRaw: number; // corte − vencimiento SIN recortar: negativo = faltan N días para vencer
  tasa: number;        // %
  punitorios: number;
  neto: number;
  vencida: boolean;
  incobrable: boolean; // por concepto "INCOBRABLES" o estado a mano "Incobrable"
  cobradaManual: boolean; // marcada "Cobrada" a mano -> ya no es cobrable
}

// "INCOBRABLES" = deuda dada por perdida; por default NO cuenta como cobrable.
export const esIncobrable = (detalle: string) => /incobrable/i.test(detalle || "");
// Gestionado = ya se lo contactó (Contactado / Contactado sin respuesta). Sin gestionar
// = vacío o "Sin contacto" -> es a quién hay que perseguir primero.
export const gestionado = (contacto: string) => /contactad/i.test(contacto || "");

const DIA = 86400000;
/** Suma n días a una fecha ISO y devuelve ISO (para armar ventanas de semanas). */
export function sumarDias(iso: string, n: number): string {
  const t = Date.parse(iso + "T00:00:00Z");
  if (!Number.isFinite(t)) return iso;
  return new Date(t + n * DIA).toISOString().slice(0, 10);
}
export function diasEntre(desdeISO: string, hastaISO: string): number {
  if (!desdeISO || !hastaISO) return 0;
  const a = Date.parse(hastaISO + "T00:00:00Z"), b = Date.parse(desdeISO + "T00:00:00Z");
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((a - b) / DIA);
}

/** Recalcula los derivados de una factura con los parámetros dados. */
export function costear(f: FacturaCC, p: ParamsCC): FacturaCosteada {
  const saldo = f.importe - f.cobrado;
  const diasMoraRaw = diasEntre(f.vencimiento, p.fechaCorte);
  const diasMora = Math.max(0, diasMoraRaw);
  const tasa = diasMora > 0 ? p.baseAnual + p.diaria * diasMora : 0;
  const base = p.baseCalc === "saldo" ? saldo : f.importe;
  const punitorios = diasMora > 0 && p.divisor > 0 ? base * (tasa / 100) / p.divisor * diasMora : 0;
  return {
    ...f, saldo, diasMora, diasMoraRaw, tasa, punitorios,
    neto: saldo + punitorios,
    vencida: diasMora > 0,
    incobrable: esIncobrable(f.detalle) || esIncobrableEstado(f.estado ?? ""),
    cobradaManual: esCobradaEstado(f.estado ?? ""),
  };
}

export interface GrupoCC { k: string; n: number; saldo: number; punitorios: number; neto: number; vencido: number; maxMora: number; netoSinGestion: number }
export interface AgingBucket { bucket: string; n: number; neto: number }
export interface ResumenCC {
  fechaCorte: string;
  nFacturas: number;
  totalImporte: number;
  totalCobrado: number;
  totalSaldo: number;
  totalPunitorios: number;
  totalNeto: number;         // saldo + punitorios de TODO
  cobrable: number;          // neto SIN incobrables (o con, según params)
  incobrable: number;        // neto de los INCOBRABLES
  vencido: number;           // neto de lo vencido (díasMora>0)
  porVencer: number;         // neto de lo no vencido
  nVencidas: number;
  aging: AgingBucket[];
  porEmpresa: GrupoCC[];
  porDetalle: GrupoCC[];
  porFranquiciado: (GrupoCC & { clienteId: string; clave: string; nombre: string })[];
  porLocal: GrupoCC[];
  porContacto: GrupoCC[];
}

const bucketDe = (d: number) => d <= 0 ? "Por vencer" : d <= 30 ? "1–30 días" : d <= 60 ? "31–60 días" : d <= 90 ? "61–90 días" : "+90 días";
export const AGING_ORDEN = ["Por vencer", "1–30 días", "31–60 días", "61–90 días", "+90 días"];

export function resumir(facturas: FacturaCC[], p: ParamsCC): ResumenCC {
  const cs = facturas.map((f) => costear(f, p));
  const agg = (key: (c: FacturaCosteada) => string) => {
    const m = new Map<string, GrupoCC>();
    for (const c of cs) {
      const k = key(c) || "(sin dato)";
      const a = m.get(k) ?? { k, n: 0, saldo: 0, punitorios: 0, neto: 0, vencido: 0, maxMora: 0, netoSinGestion: 0 };
      a.n++; a.saldo += c.saldo; a.punitorios += c.punitorios; a.neto += c.neto;
      if (c.vencida) a.vencido += c.neto;
      if (c.diasMora > a.maxMora) a.maxMora = c.diasMora;
      if (c.vencida && !gestionado(c.contacto) && !c.cobradaManual && !c.incobrable) a.netoSinGestion += c.neto; // vencido REAL a perseguir
      m.set(k, a);
    }
    return Array.from(m.values()).sort((x, y) => y.neto - x.neto);
  };

  // Franquiciado: se agrupa por CLAVE ESTABLE (nombre normalizado) para unificar los
  // mismos aunque cambie el N° o el casing. Se muestra un nombre representativo (el más
  // frecuente) y el 1er N° no vacío; el estado se guarda por esta clave.
  const franqMap = new Map<string, GrupoCC & { clienteId: string; clave: string; nombre: string; nombres: Map<string, number> }>();
  for (const c of cs) {
    const clave = claveFranq(c.cliente);
    let a = franqMap.get(clave);
    if (!a) { a = { k: clave, clave, nombre: c.cliente, clienteId: c.clienteId || "", n: 0, saldo: 0, punitorios: 0, neto: 0, vencido: 0, maxMora: 0, netoSinGestion: 0, nombres: new Map() }; franqMap.set(clave, a); }
    a.n++; a.saldo += c.saldo; a.punitorios += c.punitorios; a.neto += c.neto;
    if (c.vencida) a.vencido += c.neto;
    if (c.diasMora > a.maxMora) a.maxMora = c.diasMora;
    if (c.vencida && !gestionado(c.contacto) && !c.cobradaManual && !c.incobrable) a.netoSinGestion += c.neto;
    if (!a.clienteId && c.clienteId) a.clienteId = c.clienteId;
    a.nombres.set(c.cliente, (a.nombres.get(c.cliente) ?? 0) + 1);
  }
  const porFranquiciado = Array.from(franqMap.values()).map((a) => {
    const nombre = Array.from(a.nombres.entries()).sort((x, y) => y[1] - x[1] || y[0].length - x[0].length)[0]?.[0] ?? a.nombre;
    const { nombres, ...rest } = a; void nombres;
    return { ...rest, nombre };
  }).sort((x, y) => y.neto - x.neto);

  const suma = (pred: (c: FacturaCosteada) => boolean) => cs.filter(pred).reduce((s, c) => s + c.neto, 0);
  const agingMap = new Map<string, AgingBucket>();
  for (const b of AGING_ORDEN) agingMap.set(b, { bucket: b, n: 0, neto: 0 });
  for (const c of cs) { const b = bucketDe(c.diasMora); const a = agingMap.get(b)!; a.n++; a.neto += c.neto; }

  return {
    fechaCorte: p.fechaCorte,
    nFacturas: cs.length,
    totalImporte: cs.reduce((s, c) => s + c.importe, 0),
    totalCobrado: cs.reduce((s, c) => s + c.cobrado, 0),
    totalSaldo: cs.reduce((s, c) => s + c.saldo, 0),
    totalPunitorios: cs.reduce((s, c) => s + c.punitorios, 0),
    totalNeto: cs.reduce((s, c) => s + c.neto, 0),
    cobrable: suma((c) => !c.cobradaManual && (p.incluirIncobrables || !c.incobrable)),
    incobrable: suma((c) => c.incobrable),
    vencido: suma((c) => c.vencida),
    porVencer: suma((c) => !c.vencida),
    nVencidas: cs.filter((c) => c.vencida).length,
    aging: AGING_ORDEN.map((b) => agingMap.get(b)!),
    porEmpresa: agg((c) => c.empresa),
    porDetalle: agg((c) => c.detalle),
    porFranquiciado,
    porLocal: agg((c) => c.local),
    porContacto: agg((c) => c.contacto),
  };
}

// ── Maestro de clientes (hoja "Auxiliar" del Excel) ───────────────────────────
// Ficha por franquiciado derivada de las facturas (código/locales/empresas/saldo)
// + datos maestros editables en la app (CUIT/teléfono/email/estado) guardados por clave.
export interface MaestroCliente {
  clave: string; nombre: string; codigo: string;
  locales: string[]; empresas: string[];
  nFacturas: number; saldo: number; neto: number;
}
function nombreRep(nombres: Map<string, number>, fallback: string): string {
  return Array.from(nombres.entries()).sort((x, y) => y[1] - x[1] || y[0].length - x[0].length)[0]?.[0] ?? fallback;
}
export function maestro(facturas: FacturaCC[], p: ParamsCC): MaestroCliente[] {
  const cs = facturas.map((f) => costear(f, p));
  const m = new Map<string, { clave: string; nombres: Map<string, number>; codigo: string; locales: Set<string>; empresas: Set<string>; n: number; saldo: number; neto: number }>();
  for (const c of cs) {
    const clave = claveFranq(c.cliente);
    let a = m.get(clave);
    if (!a) { a = { clave, nombres: new Map(), codigo: c.clienteId || "", locales: new Set(), empresas: new Set(), n: 0, saldo: 0, neto: 0 }; m.set(clave, a); }
    a.n++; a.saldo += c.saldo; a.neto += c.neto;
    if (c.local) a.locales.add(c.local);
    if (c.empresa) a.empresas.add(c.empresa);
    if (!a.codigo && c.clienteId) a.codigo = c.clienteId;
    a.nombres.set(c.cliente, (a.nombres.get(c.cliente) ?? 0) + 1);
  }
  return Array.from(m.values()).map((a) => ({
    clave: a.clave, nombre: nombreRep(a.nombres, a.clave), codigo: a.codigo,
    locales: Array.from(a.locales).sort(), empresas: Array.from(a.empresas).sort(),
    nFacturas: a.n, saldo: a.saldo, neto: a.neto,
  })).sort((x, y) => x.nombre.localeCompare(y.nombre, "es"));
}

// ── Cobranza semanal/diaria (proyección de cash-flow) ─────────────────────────
// Cada factura cobrable se ubica en el tiempo por su fecha esperada de cobro =
// promesa de pago si la hay, si no el vencimiento. Lo que ya venció cae en "Atrasado
// (a cobrar ya)"; el resto se agrupa por semana desde la fecha de corte.
export interface CobranzaBucket { clave: string; desde: string; hasta: string; n: number; monto: number; tipo: "atrasado" | "semana" | "masalla" | "sinfecha" }
export interface ProyeccionCobranza { corte: string; buckets: CobranzaBucket[]; total: number; atrasado: number; futuro: number; sinFecha: number }
export function proyeccionCobranza(facturas: FacturaCC[], p: ParamsCC, semanas = 8): ProyeccionCobranza {
  const corte = p.fechaCorte || new Date().toISOString().slice(0, 10);
  const cs = facturas.map((f) => costear(f, p)).filter((c) => c.saldo > 1 && !c.cobradaManual && !c.incobrable);
  const atrasado: CobranzaBucket = { clave: "atrasado", desde: "", hasta: corte, n: 0, monto: 0, tipo: "atrasado" };
  const sinFecha: CobranzaBucket = { clave: "sinfecha", desde: "", hasta: "", n: 0, monto: 0, tipo: "sinfecha" };
  const finVentana = sumarDias(corte, semanas * 7);
  const masAlla: CobranzaBucket = { clave: "masalla", desde: finVentana, hasta: "", n: 0, monto: 0, tipo: "masalla" };
  const semanaB: CobranzaBucket[] = [];
  for (let i = 0; i < semanas; i++) semanaB.push({ clave: `w${i}`, desde: sumarDias(corte, i * 7), hasta: sumarDias(corte, i * 7 + 6), n: 0, monto: 0, tipo: "semana" });
  for (const c of cs) {
    const fecha = c.promesa || c.vencimiento;
    const monto = c.neto; // a cobrar con punitorios a la fecha de corte
    if (!fecha) { sinFecha.n++; sinFecha.monto += monto; continue; }
    if (fecha < corte) { atrasado.n++; atrasado.monto += monto; continue; }
    const wi = Math.floor(diasEntre(corte, fecha) / 7);
    if (wi >= 0 && wi < semanas) { semanaB[wi].n++; semanaB[wi].monto += monto; }
    else { masAlla.n++; masAlla.monto += monto; }
  }
  const buckets = [atrasado, ...semanaB, masAlla, sinFecha];
  const total = buckets.reduce((s, b) => s + b.monto, 0);
  return { corte, buckets, total, atrasado: atrasado.monto, futuro: semanaB.reduce((s, b) => s + b.monto, 0) + masAlla.monto, sinFecha: sinFecha.monto };
}

// ── Morosidad: días promedio de mora (DSO) + score de riesgo (hoja Calculo_Aux) ─
// DSO por franquiciado = promedio de días de mora PONDERADO por saldo. El score (0–100,
// más alto = peor) combina: % del neto vencido, DSO, la peor mora y si tiene incobrables.
export type NivelMora = "Bajo" | "Medio" | "Alto" | "Crítico";
export const nivelMora = (score: number): NivelMora => score >= 75 ? "Crítico" : score >= 50 ? "Alto" : score >= 20 ? "Medio" : "Bajo";
export interface MorosidadFranq {
  clave: string; nombre: string; codigo: string; nFacturas: number;
  neto: number; vencido: number; saldo: number; incobrable: number;
  dso: number; maxMora: number; score: number; nivel: NivelMora;
}
export function morosidad(facturas: FacturaCC[], p: ParamsCC): MorosidadFranq[] {
  const cs = facturas.map((f) => costear(f, p));
  const m = new Map<string, { clave: string; nombres: Map<string, number>; codigo: string; neto: number; vencido: number; saldo: number; incobrable: number; n: number; maxMora: number; wMora: number; wBase: number }>();
  for (const c of cs) {
    const clave = claveFranq(c.cliente);
    let a = m.get(clave);
    if (!a) { a = { clave, nombres: new Map(), codigo: c.clienteId || "", neto: 0, vencido: 0, saldo: 0, incobrable: 0, n: 0, maxMora: 0, wMora: 0, wBase: 0 }; m.set(clave, a); }
    a.n++; a.neto += c.neto; a.saldo += c.saldo;
    if (c.vencida) a.vencido += c.neto;
    if (c.incobrable) a.incobrable += c.neto;
    if (c.diasMora > a.maxMora) a.maxMora = c.diasMora;
    if (c.saldo > 0) { a.wMora += c.diasMora * c.saldo; a.wBase += c.saldo; }
    if (!a.codigo && c.clienteId) a.codigo = c.clienteId;
    a.nombres.set(c.cliente, (a.nombres.get(c.cliente) ?? 0) + 1);
  }
  return Array.from(m.values()).map((a) => {
    const dso = a.wBase > 0 ? a.wMora / a.wBase : 0;
    const pctVencido = a.neto > 0 ? a.vencido / a.neto : 0;
    const score = Math.min(100, Math.round(40 * pctVencido + 30 * Math.min(1, dso / 90) + 20 * Math.min(1, a.maxMora / 180) + 10 * (a.incobrable > 0 ? 1 : 0)));
    return {
      clave: a.clave, nombre: nombreRep(a.nombres, a.clave), codigo: a.codigo, nFacturas: a.n,
      neto: a.neto, vencido: a.vencido, saldo: a.saldo, incobrable: a.incobrable,
      dso, maxMora: a.maxMora, score, nivel: nivelMora(score),
    };
  }).sort((x, y) => y.score - x.score || y.neto - x.neto);
}

// ── Parsing del CSV/Excel (tolerante a columnas) ──────────────────────────────

// Empresas: canonicaliza casing/espacios para no fragmentar sumas (Mr Tasty = MR Tasty).
const EMP_ALIAS: Record<string, string> = { "mr tasty": "Mr Tasty", "desembarco": "Desembarco", "el desembarco": "Desembarco", "mila & go": "Mila & Go", "mila y go": "Mila & Go" };
export function canonicalEmpresa(s: string): string {
  const k = norm(s);
  return EMP_ALIAS[k] ?? (s || "").trim();
}

function parseNum(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  let t = String(v ?? "").replace(/[^0-9.,\-]/g, "").trim();
  if (!t) return 0;
  const c = t.lastIndexOf(","), d = t.lastIndexOf(".");
  if (c >= 0 && d >= 0) t = c > d ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  else if (c >= 0) t = t.replace(/\./g, "").replace(",", "."); // AR: coma decimal, punto miles
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : 0;
}
function isoFecha(s: unknown): string {
  const str = String(s ?? "").trim();
  let m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = str.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
  if (m) { let [, d, mo, y] = m; if (y.length === 2) y = "20" + y; return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`; }
  return "";
}

/** CSV -> matriz (maneja campos entre comillas con comas y saltos de línea). */
export function csvAMatriz(txt: string): string[][] {
  txt = txt.replace(/^﻿/, "");
  const rows: string[][] = []; let row: string[] = [], cur = "", q = false;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (q) { if (c === '"') { if (txt[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\r") { /* skip */ }
    else if (c === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
    else cur += c;
  }
  if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

const SINONIMOS: Record<keyof Omit<FacturaCC, "clienteId" | "importe" | "cobrado" | "promesa" | "estado" | "manual">, RegExp> & { importe: RegExp; cobrado: RegExp } = {
  cliente: /cliente|razon social|franquicia/,
  vencimiento: /vencimiento|vto|fecha.*venc/,
  tipo: /tipo.*comprob|tipo comp/,
  nro: /nro|n[°º]|numero.*comp/,
  importe: /importe pendiente|pendiente|importe$|deuda/,
  cobrado: /cobrado|aplicado|cobranza/,
  empresa: /empresa|marca/,
  local: /local|sucursal|boca/,
  detalle: /detalle|concepto|rubro/,
  contacto: /contacto|gestion/,
  obs: /observ|nota/,
  mes: /^mes$/,
};

export interface ResultadoParse {
  facturas: FacturaCC[];
  filas: number;        // filas de datos no vacías
  descartadas: number;  // sin cliente o sin importe válido
  columnas: Record<string, string>; // campo -> encabezado detectado
  error?: string;
}

export const parseFranquiciasCSV = (txt: string): ResultadoParse => parseFranquiciasMatriz(csvAMatriz(txt));

/** Parser principal: matriz de filas (viene de CSV o de Excel vía SheetJS). */
export function parseFranquiciasMatriz(matriz: string[][]): ResultadoParse {
  const rows = matriz.filter((r) => r.some((c) => String(c).trim() !== ""));
  if (!rows.length) return { facturas: [], filas: 0, descartadas: 0, columnas: {}, error: "archivo vacío" };
  // Encabezado: la fila con más coincidencias de sinónimos (primeras 10).
  let hi = 0, best = -1;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const h = rows[i].map(norm);
    let score = 0;
    for (const re of Object.values(SINONIMOS)) if (h.some((x) => re.test(x))) score++;
    if (score > best) { best = score; hi = i; }
  }
  const head = rows[hi].map(norm);
  const idx: Partial<Record<string, number>> = {};
  const columnas: Record<string, string> = {};
  const usados = new Set<number>(); // una columna se asigna a un solo campo (evita colisiones)
  for (const [campo, re] of Object.entries(SINONIMOS)) {
    const i = head.findIndex((x, j) => !usados.has(j) && re.test(x));
    if (i >= 0) { idx[campo] = i; columnas[campo] = rows[hi][i]; usados.add(i); }
  }
  if (idx.cliente == null || idx.importe == null) {
    return { facturas: [], filas: 0, descartadas: 0, columnas, error: "no encontré las columnas mínimas (Cliente e Importe pendiente). Revisá los encabezados." };
  }
  const G = (r: string[], k: string) => (idx[k] != null ? r[idx[k]!] : "");
  const facturas: FacturaCC[] = [];
  let filas = 0, descartadas = 0;
  for (let r = hi + 1; r < rows.length; r++) {
    const row = rows[r];
    const clienteRaw = String(G(row, "cliente") ?? "").trim();
    const importe = parseNum(G(row, "importe"));
    if (!clienteRaw && !importe) continue; // fila espaciadora vacía: no cuenta
    filas++;
    if (!clienteRaw || !(importe || parseNum(G(row, "cobrado")))) { descartadas++; continue; }
    const mCli = clienteRaw.match(/^(\d+)\s*[-–]\s*(.+)$/); // "2003 - NOMBRE"
    const venc = isoFecha(G(row, "vencimiento"));
    facturas.push({
      clienteId: mCli ? mCli[1] : "",
      cliente: mCli ? mCli[2].trim() : clienteRaw,
      vencimiento: venc,
      tipo: String(G(row, "tipo") ?? "").trim() || "FAC",
      nro: String(G(row, "nro") ?? "").trim(),
      importe,
      cobrado: parseNum(G(row, "cobrado")),
      empresa: canonicalEmpresa(String(G(row, "empresa") ?? "")),
      local: String(G(row, "local") ?? "").trim(),
      detalle: String(G(row, "detalle") ?? "").trim(),
      contacto: String(G(row, "contacto") ?? "").trim(),
      obs: String(G(row, "obs") ?? "").trim(),
      mes: String(G(row, "mes") ?? "").trim() || (venc ? venc.slice(0, 7) : ""),
    });
  }
  return facturas.length
    ? { facturas, filas, descartadas, columnas }
    : { facturas: [], filas, descartadas, columnas, error: "encontré las columnas pero ninguna fila con cliente + importe" };
}
