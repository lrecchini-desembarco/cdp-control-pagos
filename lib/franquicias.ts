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
  bloqueo?: string;    // "SI" | "NO" | "" — si el local está bloqueado (gestión en la app)
  emision?: string;    // fecha de emisión del comprobante (ISO); "" si no vino del origen
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
export interface Gestion { contacto?: string; promesa?: string; nota?: string; estado?: string; bloqueo?: string }
export const gestionKey = (f: { clienteId: string; nro: string }) => (f.nro ? `${f.clienteId}|${f.nro}` : "");

/** Superpone la gestión guardada (por comprobante) sobre las facturas del snapshot. */
export function aplicarGestion(facturas: FacturaCC[], g: Record<string, Gestion>): FacturaCC[] {
  if (!g || !Object.keys(g).length) return facturas;
  return facturas.map((f) => {
    const o = g[gestionKey(f)];
    if (!o) return f;
    return { ...f, contacto: o.contacto ?? f.contacto, promesa: o.promesa ?? f.promesa, obs: o.nota ?? f.obs, estado: o.estado ?? f.estado, bloqueo: o.bloqueo ?? f.bloqueo };
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
  tomaLocal: boolean;  // concepto "DEUDA TOMA LOCAL" -> tampoco es cobrable (como el Excel)
  cobrable: boolean;   // cuenta para la cobranza real (no incobrable, no toma local, no cobrada)
  cobradaManual: boolean; // marcada "Cobrada" a mano -> ya no es cobrable
}

// "INCOBRABLES" = deuda dada por perdida; por default NO cuenta como cobrable.
export const esIncobrable = (detalle: string) => /incobrable/i.test(detalle || "");
// "DEUDA TOMA LOCAL" = deuda por la toma de un local; el Excel la EXCLUYE del cobrable
// (igual que incobrables). No es plata que Cobranzas persigue en la cta cte normal.
export const esTomaLocal = (detalle: string) => /toma\s+local/i.test(detalle || "");
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
  const incobrable = esIncobrable(f.detalle) || esIncobrableEstado(f.estado ?? "");
  const tomaLocal = esTomaLocal(f.detalle);
  const cobradaManual = esCobradaEstado(f.estado ?? "");
  return {
    ...f, saldo, diasMora, diasMoraRaw, tasa, punitorios,
    neto: saldo + punitorios,
    vencida: diasMora > 0,
    incobrable, tomaLocal, cobradaManual,
    // Cobrable = plata que Cobranzas persigue: excluye incobrables, deuda toma local
    // y lo marcado cobrado a mano (igual que el Excel excluye INCOBRABLES + TOMA LOCAL).
    cobrable: !incobrable && !tomaLocal && !cobradaManual,
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
  totalNeto: number;         // saldo + punitorios de TODO (incl. incobrables y toma local)
  cobrable: number;          // neto COBRABLE: excl INCOBRABLES + DEUDA TOMA LOCAL + cobradas
  incobrable: number;        // neto de los INCOBRABLES (memo)
  tomaLocal: number;         // neto de la DEUDA TOMA LOCAL (memo)
  vencido: number;           // neto vencido, scope COBRABLE (suma a cobrable con porVencer)
  porVencer: number;         // neto no vencido, scope COBRABLE
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
  // Scope COBRABLE: lo que Cobranzas persigue. Excluye DEUDA TOMA LOCAL y las cobradas;
  // los INCOBRABLES quedan afuera salvo que el usuario los incluya con el param.
  const enCobrable = (c: FacturaCosteada) => !c.tomaLocal && !c.cobradaManual && (p.incluirIncobrables || !c.incobrable);
  // agg({soloCobrable}): los cortes-resumen (empresa/local) se calculan en scope cobrable
  // como el Excel; el corte por concepto usa TODO (así muestra INCOBRABLES/TOMA LOCAL).
  const agg = (key: (c: FacturaCosteada) => string, soloCobrable = false) => {
    const m = new Map<string, GrupoCC>();
    for (const c of cs) {
      if (soloCobrable && !enCobrable(c)) continue;
      const k = key(c) || "(sin dato)";
      const a = m.get(k) ?? { k, n: 0, saldo: 0, punitorios: 0, neto: 0, vencido: 0, maxMora: 0, netoSinGestion: 0 };
      a.n++; a.saldo += c.saldo; a.punitorios += c.punitorios; a.neto += c.neto;
      if (c.vencida) a.vencido += c.neto;
      if (c.diasMora > a.maxMora) a.maxMora = c.diasMora;
      if (c.vencida && !gestionado(c.contacto) && c.cobrable) a.netoSinGestion += c.neto; // vencido REAL a perseguir
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
    if (c.vencida && !gestionado(c.contacto) && c.cobrable) a.netoSinGestion += c.neto;
    if (!a.clienteId && c.clienteId) a.clienteId = c.clienteId;
    a.nombres.set(c.cliente, (a.nombres.get(c.cliente) ?? 0) + 1);
  }
  const porFranquiciado = Array.from(franqMap.values()).map((a) => {
    const nombre = Array.from(a.nombres.entries()).sort((x, y) => y[1] - x[1] || y[0].length - x[0].length)[0]?.[0] ?? a.nombre;
    const { nombres, ...rest } = a; void nombres;
    return { ...rest, nombre };
  }).sort((x, y) => y.neto - x.neto);

  const suma = (pred: (c: FacturaCosteada) => boolean) => cs.filter(pred).reduce((s, c) => s + c.neto, 0);
  // Aging en scope COBRABLE (como los resúmenes del Excel): suma al cobrable.
  const agingMap = new Map<string, AgingBucket>();
  for (const b of AGING_ORDEN) agingMap.set(b, { bucket: b, n: 0, neto: 0 });
  for (const c of cs) { if (!enCobrable(c)) continue; const b = bucketDe(c.diasMora); const a = agingMap.get(b)!; a.n++; a.neto += c.neto; }

  return {
    fechaCorte: p.fechaCorte,
    nFacturas: cs.length,
    totalImporte: cs.reduce((s, c) => s + c.importe, 0),
    totalCobrado: cs.reduce((s, c) => s + c.cobrado, 0),
    totalSaldo: cs.reduce((s, c) => s + c.saldo, 0),
    totalPunitorios: cs.reduce((s, c) => s + c.punitorios, 0),
    totalNeto: cs.reduce((s, c) => s + c.neto, 0),
    cobrable: suma(enCobrable),
    incobrable: suma((c) => c.incobrable),
    tomaLocal: suma((c) => c.tomaLocal),
    vencido: suma((c) => enCobrable(c) && c.vencida),
    porVencer: suma((c) => enCobrable(c) && !c.vencida),
    nVencidas: cs.filter((c) => enCobrable(c) && c.vencida).length,
    aging: AGING_ORDEN.map((b) => agingMap.get(b)!),
    porEmpresa: agg((c) => c.empresa, true),
    porDetalle: agg((c) => c.detalle),
    porFranquiciado,
    porLocal: agg((c) => canonicalLocal(c.local), true),
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
  const cs = facturas.map((f) => costear(f, p)).filter((c) => c.saldo > 1 && c.cobrable);
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

// ── Cobranza por vencimiento (hojas "Cobranza Semanal" y "Cobranza por Día") ──
// Ubica cada factura cobrable por su SEMANA o DÍA de vencimiento (no la promesa), con el
// neto abierto por empresa y un estado según el corte: pasada = "Cobrada", la del corte
// = "En curso", futura = "Próxima". Reproduce las dos hojas del Excel.
export type Granularidad = "semana" | "dia";
export interface CalBucket { clave: string; desde: string; hasta: string; estado: "Cobrada" | "En curso" | "Próxima"; porEmpresa: Record<string, number>; total: number; n: number }
export interface CobranzaCalendario { corte: string; empresas: string[]; buckets: CalBucket[]; total: number }
// Lunes de la semana de una fecha ISO (semanas lunes-domingo, como el Excel).
function lunesDe(iso: string): string {
  const t = Date.parse(iso + "T00:00:00Z");
  if (!Number.isFinite(t)) return iso;
  const dow = (new Date(t).getUTCDay() + 6) % 7; // 0 = lunes
  return new Date(t - dow * DIA).toISOString().slice(0, 10);
}
export function cobranzaCalendario(facturas: FacturaCC[], p: ParamsCC, gran: Granularidad = "semana"): CobranzaCalendario {
  const corte = p.fechaCorte || new Date().toISOString().slice(0, 10);
  const cs = facturas.map((f) => costear(f, p)).filter((c) => c.saldo > 1 && c.cobrable && c.vencimiento);
  const empresas = Array.from(new Set(cs.map((c) => c.empresa || "(sin)"))).sort();
  const m = new Map<string, CalBucket>();
  for (const c of cs) {
    const desde = gran === "semana" ? lunesDe(c.vencimiento) : c.vencimiento;
    const hasta = gran === "semana" ? sumarDias(desde, 6) : desde;
    let b = m.get(desde);
    if (!b) { b = { clave: desde, desde, hasta, estado: "Próxima", porEmpresa: {}, total: 0, n: 0 }; m.set(desde, b); }
    const emp = c.empresa || "(sin)";
    b.porEmpresa[emp] = (b.porEmpresa[emp] ?? 0) + c.neto;
    b.total += c.neto; b.n++;
  }
  const buckets = Array.from(m.values()).sort((a, b) => a.desde.localeCompare(b.desde));
  for (const b of buckets) b.estado = b.hasta < corte ? "Cobrada" : b.desde > corte ? "Próxima" : "En curso";
  return { corte, empresas, buckets, total: buckets.reduce((s, b) => s + b.total, 0) };
}

// ── Cobro por Local (hoja "Cobro por Local") ──
// Por local: deuda vencida / no vencida (neta, cobrable), saldo pendiente, total cobrado
// (de TODO el registro de cobros — histórico + nuevos) y fecha del último cobro.
export interface CobroLocal { local: string; empresa: string; vencida: number; noVencida: number; saldo: number; totalCobrado: number; ultimoCobro: string; nFacturas: number }
export function cobroPorLocal(facturas: FacturaCC[], p: ParamsCC, cobros: { local?: string; importe: number; fecha?: string }[] = []): CobroLocal[] {
  const cs = facturas.map((f) => costear(f, p)).filter((c) => c.cobrable);
  const m = new Map<string, CobroLocal>();
  const key = (s?: string) => (canonicalLocal(s || "") || "(sin local)");
  for (const c of cs) {
    const k = key(c.local);
    let a = m.get(k);
    if (!a) { a = { local: k, empresa: c.empresa, vencida: 0, noVencida: 0, saldo: 0, totalCobrado: 0, ultimoCobro: "", nFacturas: 0 }; m.set(k, a); }
    if (c.vencida) a.vencida += c.neto; else a.noVencida += c.neto;
    a.saldo += c.saldo; a.nFacturas++;
  }
  for (const co of cobros) {
    const k = key(co.local);
    const a = m.get(k) ?? { local: k, empresa: "", vencida: 0, noVencida: 0, saldo: 0, totalCobrado: 0, ultimoCobro: "", nFacturas: 0 };
    a.totalCobrado += Number(co.importe) || 0;
    if (co.fecha && co.fecha > a.ultimoCobro) a.ultimoCobro = co.fecha;
    m.set(k, a);
  }
  return Array.from(m.values()).sort((x, y) => y.saldo - x.saldo);
}

// ── Morosidad: ranking de morosos (hojas Análisis de Mora / Calculo_Aux / Días Promedio) ─
// Se puede agrupar por LOCAL (como el Excel) o por franquiciado. Reproduce las métricas
// del Excel: sobre las facturas COBRABLES con ≥30 días de mora — comprobantes, días
// promedio de mora, peor mora, capital y punitorios en mora, y el TOTAL en mora (el
// ranking del Excel es por ese total). Suma un score de riesgo 0–100 propio como extra.
export const MORA_MIN = 30; // días de mora desde los que el Excel considera "en mora"
export type NivelMora = "Bajo" | "Medio" | "Alto" | "Crítico";
export const nivelMora = (score: number): NivelMora => score >= 75 ? "Crítico" : score >= 50 ? "Alto" : score >= 20 ? "Medio" : "Bajo";
export type MoraPor = "franquiciado" | "local";
export interface MorosidadFila {
  clave: string; nombre: string; codigo: string; empresa: string; nFacturas: number;
  neto: number; vencido: number; saldo: number; incobrable: number;
  comprobMora: number; diasProm: number; diasMax: number;   // sobre facturas ≥30d cobrables
  capitalMora: number; punitMora: number; totalMora: number; // $ en mora (ranking del Excel)
  dso: number; score: number; nivel: NivelMora;
}
export function morosidad(facturas: FacturaCC[], p: ParamsCC, por: MoraPor = "franquiciado"): MorosidadFila[] {
  const cs = facturas.map((f) => costear(f, p));
  type Acc = { clave: string; nombres: Map<string, number>; codigo: string; empresa: string; neto: number; vencido: number; saldo: number; incobrable: number; n: number; maxMora: number; wMora: number; wBase: number; comprobMora: number; sumDiasMora: number; capitalMora: number; punitMora: number };
  const m = new Map<string, Acc>();
  for (const c of cs) {
    const clave = por === "local" ? (canonicalLocal(c.local) || "(sin local)") : claveFranq(c.cliente);
    let a = m.get(clave);
    if (!a) { a = { clave, nombres: new Map(), codigo: c.clienteId || "", empresa: c.empresa, neto: 0, vencido: 0, saldo: 0, incobrable: 0, n: 0, maxMora: 0, wMora: 0, wBase: 0, comprobMora: 0, sumDiasMora: 0, capitalMora: 0, punitMora: 0 }; m.set(clave, a); }
    a.n++; a.neto += c.neto; a.saldo += c.saldo;
    if (c.vencida) a.vencido += c.neto;
    if (c.incobrable) a.incobrable += c.neto;
    if (c.diasMora > a.maxMora) a.maxMora = c.diasMora;
    if (c.cobrable && c.saldo > 0) { a.wMora += c.diasMora * c.saldo; a.wBase += c.saldo; }
    // Métricas de mora del Excel: SOLO facturas cobrables con ≥30 días de atraso.
    if (c.cobrable && c.diasMora >= MORA_MIN) {
      a.comprobMora++; a.sumDiasMora += c.diasMora;
      a.capitalMora += c.saldo; a.punitMora += c.punitorios;
    }
    if (!a.codigo && c.clienteId) a.codigo = c.clienteId;
    a.nombres.set(c.cliente, (a.nombres.get(c.cliente) ?? 0) + 1);
  }
  return Array.from(m.values()).map((a) => {
    const dso = a.wBase > 0 ? a.wMora / a.wBase : 0;
    const totalMora = a.capitalMora + a.punitMora;
    const diasProm = a.comprobMora > 0 ? a.sumDiasMora / a.comprobMora : 0;
    const pctVencido = a.neto > 0 ? a.vencido / a.neto : 0;
    const score = Math.min(100, Math.round(40 * pctVencido + 30 * Math.min(1, dso / 90) + 20 * Math.min(1, a.maxMora / 180) + 10 * (a.incobrable > 0 ? 1 : 0)));
    return {
      clave: a.clave, nombre: por === "local" ? a.clave : nombreRep(a.nombres, a.clave), codigo: a.codigo, empresa: a.empresa, nFacturas: a.n,
      neto: a.neto, vencido: a.vencido, saldo: a.saldo, incobrable: a.incobrable,
      comprobMora: a.comprobMora, diasProm, diasMax: a.maxMora,
      capitalMora: a.capitalMora, punitMora: a.punitMora, totalMora,
      dso, score, nivel: nivelMora(score),
    };
  }).sort((x, y) => y.totalMora - x.totalMora || y.neto - x.neto); // ranking del Excel: por $ en mora
}

// Resumen global de mora (hoja "Días Promedio"): días promedio de mora sobre las
// facturas cobrables ≥30d, cantidad de comprobantes, locales en mora, y deuda en mora,
// con el corte por empresa. Es lo que va en el header del panel de Morosidad.
export interface MoraGlobal {
  diasProm: number; comprobMora: number; localesEnMora: number; deudaEnMora: number;
  porEmpresa: { empresa: string; comprob: number; diasProm: number; deuda: number }[];
}
export function moraGlobal(facturas: FacturaCC[], p: ParamsCC): MoraGlobal {
  const cs = facturas.map((f) => costear(f, p)).filter((c) => c.cobrable && c.diasMora >= MORA_MIN);
  const locales = new Set<string>(), emp = new Map<string, { comprob: number; sumDias: number; deuda: number }>();
  let sumDias = 0, deuda = 0;
  for (const c of cs) {
    sumDias += c.diasMora; deuda += c.neto;
    if (c.local) locales.add(canonicalLocal(c.local));
    const e = emp.get(c.empresa) ?? { comprob: 0, sumDias: 0, deuda: 0 };
    e.comprob++; e.sumDias += c.diasMora; e.deuda += c.neto; emp.set(c.empresa, e);
  }
  return {
    diasProm: cs.length ? sumDias / cs.length : 0,
    comprobMora: cs.length, localesEnMora: locales.size, deudaEnMora: deuda,
    porEmpresa: Array.from(emp.entries()).map(([empresa, e]) => ({ empresa, comprob: e.comprob, diasProm: e.comprob ? e.sumDias / e.comprob : 0, deuda: e.deuda })).sort((a, b) => b.deuda - a.deuda),
  };
}

// ── Parsing del CSV/Excel (tolerante a columnas) ──────────────────────────────

// Empresas: canonicaliza casing/espacios para no fragmentar sumas (Mr Tasty = MR Tasty).
const EMP_ALIAS: Record<string, string> = { "mr tasty": "Mr Tasty", "desembarco": "Desembarco", "el desembarco": "Desembarco", "mila & go": "Mila & Go", "mila y go": "Mila & Go" };
export function canonicalEmpresa(s: string): string {
  const k = norm(s);
  return EMP_ALIAS[k] ?? (s || "").trim();
}

// LOCALES: Tango y Raven (y el propio Excel) nombran distinto al mismo local
// ("MRT FLORES" vs "MR TASTY FLORES", "DDR ..." vs "DESEMBARCO ..."). Esto lo unifica:
// normaliza (mayúsculas, sin acentos, espacios simples, sin puntuación al final) y
// expande abreviaturas de marca conocidas. El mapa LOCAL_ALIAS es EXTENSIBLE: a medida
// que aparezcan pares Tango/Raven que no matcheen solos, se agregan acá (clave = nombre
// ya normalizado con canonicalLocalRaw, valor = nombre canónico final).
const LOCAL_ALIAS: Record<string, string> = {
  // Pares Tango/Raven que NO se resuelven con la normalización de marca (nombres
  // realmente distintos del mismo local). Cargar acá tras confirmar que son el MISMO
  // local (ojo: un franquiciado puede tener varios locales — no mezclar).
  // Pendientes de confirmar (NO cargados aún): SAN TELMO<->MICROCENTRO, COLEGIALES<->COLEGIALES 2.
};
function canonicalLocalRaw(s: string): string {
  let t = String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").replace(/[.\s-]+$/, "").trim();
  if (!t) return "";
  // Marca al inicio -> un solo nombre. Tango mezcla "MR TASTY X" y "TASTY X"; Raven usa
  // "MRT X". Todo se normaliza a "TASTY X". DDR -> DESEMBARCO.
  t = t.replace(/^(M\.?\s?R\.?\s?T\.?|MR\s+TASTY)(\s|$)/, "TASTY$2").replace(/^DDR(\s|$)/, "DESEMBARCO$1");
  return t.replace(/\s+/g, " ").trim();
}
/** Nombre canónico de un local (unifica Tango/Raven/Excel). Aplicar SIEMPRE al agrupar
 *  o filtrar por local, así el mismo local es UNO solo aunque venga escrito distinto. */
export function canonicalLocal(s: string): string {
  const t = canonicalLocalRaw(s);
  return LOCAL_ALIAS[t] ?? t;
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

const SINONIMOS: Record<keyof Omit<FacturaCC, "clienteId" | "importe" | "cobrado" | "promesa" | "estado" | "bloqueo" | "emision" | "manual">, RegExp> & { importe: RegExp; cobrado: RegExp; emision: RegExp } = {
  cliente: /cliente|razon social|franquicia/,
  vencimiento: /vencimiento|vto|fecha.*venc/,
  emision: /emisi[oó]n|fecha.*emis/,
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

// Fila cruda de la vista de Tango (dbo.vw_FranquiciasCtaCte) -> FacturaCC. Las columnas
// ya vienen aliasadas por la vista; acá solo normalizamos tipos, empresa y el mes.
// Tolerante a que falten local/detalle (son enriquecimiento, la app funciona sin ellos).
export function tangoRowAFactura(row: Record<string, unknown>): FacturaCC {
  const emis = isoFecha(row.emision);
  const vencRaw = isoFecha(row.vencimiento);
  // Tango marca "sin vencimiento" con la fecha 1899-12-31 (o vacío). Si el vencimiento
  // no es válido (anterior a 2015, ej. regalías/notas de débito), se usa la EMISIÓN
  // como vencimiento — si no, la mora daría ~46.000 días y los punitorios explotan.
  const venc = (!vencRaw || vencRaw < "2015-01-01") ? (emis || vencRaw) : vencRaw;
  const clienteRaw = String(row.cliente ?? "").trim();
  const mCli = clienteRaw.match(/^(\d+)\s*[-–]\s*(.+)$/); // por si el nombre viene "2003 - NOMBRE"
  return {
    clienteId: String(row.clienteId ?? (mCli ? mCli[1] : "")).trim(),
    cliente: mCli ? mCli[2].trim() : clienteRaw,
    vencimiento: venc,
    emision: emis,
    tipo: String(row.tipo ?? "").trim() || "FAC",
    nro: String(row.nro ?? "").trim(),
    importe: parseNum(row.importe),
    cobrado: parseNum(row.cobrado),
    empresa: canonicalEmpresa(String(row.empresa ?? "")),
    local: canonicalLocal(String(row.local ?? "")),
    detalle: String(row.detalle ?? "").trim(),
    contacto: "", obs: "",
    mes: venc ? venc.slice(0, 7) : "",
  };
}
// Clientes de Tango que NO son franquiciados (socios comerciales / apps / proveedores
// que tienen cta cte por acuerdos de publicidad/comercial). Se excluyen de la pantalla
// de franquicias. Lista extensible — agregar si aparecen otros.
const NO_FRANQUICIADOS = /coca\s*cola|femsa|delivery\s*hero|\brappi\b|pedidos\s*ya|pedidosya|mercado\s*(libre|pago)/i;
export const esFranquiciado = (cliente: string) => !NO_FRANQUICIADOS.test(cliente || "");

/** Mapea el snapshot vivo de Tango (varias filas) a FacturaCC, descartando basura y
 *  los clientes que no son franquiciados (socios comerciales / apps / proveedores). */
export function facturasDesdeTango(rows: unknown[]): FacturaCC[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => tangoRowAFactura(r as Record<string, unknown>))
    .filter((f) => f.cliente && (f.importe || f.cobrado) && esFranquiciado(f.cliente));
}

// ── Datos de RAVEN (export fiscal "mis-comprobantes") ─────────────────────────
// FUENTE DISTINTA a la cta cte: son los comprobantes fiscales que emite el CDP,
// cruzados con el franquiciado por CUIT (no por número — la numeración fiscal AFIP
// no coincide con la de la cta cte). Sirve para ver qué facturó el CDP a cada uno y
// separar mercadería (con remito = CDP) de servicios (sin remito = regalías/otros).
export interface RavenFranq {
  cuit: string; denominacion: string; localRaven: string;
  n: number; total: number; cdp: number; servicios: number; desde: string; hasta: string;
}
const soloDigitos = (s: unknown) => String(s ?? "").replace(/\D/g, "");
/** Agrega el export fiscal de Raven por CUIT del receptor (franquiciado). Lee por
 *  nombre de columna (los encabezados reales del export) para ser tolerante. */
export function resumirRaven(comprobantes: Record<string, unknown>[]): RavenFranq[] {
  const g = (c: Record<string, unknown>, ...keys: string[]) => { for (const k of keys) if (c[k] != null && String(c[k]).trim() !== "") return c[k]; return ""; };
  const m = new Map<string, { cuit: string; denoms: Map<string, number>; locales: Map<string, number>; n: number; total: number; cdp: number; servicios: number; desde: string; hasta: string }>();
  for (const c of comprobantes) {
    const cuit = soloDigitos(g(c, "Nro. Doc. Receptor", "cuit", "CUIT"));
    if (!cuit) continue;
    const total = parseNum(g(c, "Imp. Total", "total", "importe"));
    const conRemito = String(g(c, "Número de remito", "remito")).trim() !== "";
    const fecha = isoFecha(g(c, "Fecha", "fecha", "emision"));
    const local = String(g(c, "Nombre Comercial", "local")).trim();
    const denom = String(g(c, "Denominación Receptor", "denominacion", "cliente")).trim();
    let a = m.get(cuit);
    if (!a) { a = { cuit, denoms: new Map(), locales: new Map(), n: 0, total: 0, cdp: 0, servicios: 0, desde: fecha, hasta: fecha }; m.set(cuit, a); }
    a.n++; a.total += total; if (conRemito) a.cdp += total; else a.servicios += total;
    if (fecha) { if (!a.desde || fecha < a.desde) a.desde = fecha; if (!a.hasta || fecha > a.hasta) a.hasta = fecha; }
    if (local) a.locales.set(local, (a.locales.get(local) ?? 0) + 1);
    if (denom) a.denoms.set(denom, (a.denoms.get(denom) ?? 0) + 1);
  }
  const top = (mm: Map<string, number>) => Array.from(mm.entries()).sort((x, y) => y[1] - x[1])[0]?.[0] ?? "";
  return Array.from(m.values()).map((a) => ({
    cuit: a.cuit, denominacion: top(a.denoms), localRaven: top(a.locales),
    n: a.n, total: a.total, cdp: a.cdp, servicios: a.servicios, desde: a.desde, hasta: a.hasta,
  })).sort((x, y) => y.total - x.total);
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
      emision: isoFecha(G(row, "emision")),
      tipo: String(G(row, "tipo") ?? "").trim() || "FAC",
      nro: String(G(row, "nro") ?? "").trim(),
      importe,
      cobrado: parseNum(G(row, "cobrado")),
      empresa: canonicalEmpresa(String(G(row, "empresa") ?? "")),
      local: canonicalLocal(String(G(row, "local") ?? "")),
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
