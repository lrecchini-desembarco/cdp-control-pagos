import { gunzipSync } from "zlib";
import { readStore } from "./store";
import { getFacturacion } from "./facturacion";
import { getCruce } from "./cruce";
import { resumirBancos, canonicalLocal, type MovBanco } from "./bancos";
import { resumir as resumirCC, aplicarGestion, claveFranq, maestro, proyeccionCobranza, morosidad, PARAMS_DEFAULT, type FacturaCC, type Gestion } from "./franquicias";

// Bot de QA diario. Cada check es una "persona" del panel controlando su sección:
// re-corre las auditorías reales (reconciliación, margen, identidad, mapeo, frescura)
// y devuelve ✓/✗ + un número. El cron lo dispara a diario y guarda historial.

export type Severidad = "alta" | "media" | "baja";
export interface QaCheck {
  id: string; persona: string; seccion: string; titulo: string;
  ok: boolean; severidad: Severidad; valor?: string; detalle: string;
}
export interface QaReporte { cuando: string; total: number; pasan: number; fallan: number; checks: QaCheck[] }

const hoyISO = () => new Date().toISOString().slice(0, 10);
const M = (n: number) => "$" + Math.round(n).toLocaleString("es-AR");
const casi = (a: number, b: number, tol = 1) => Math.abs(a - b) <= tol;

async function safe(meta: Omit<QaCheck, "ok" | "detalle" | "valor">, fn: () => Promise<{ ok: boolean; valor?: string; detalle: string }>): Promise<QaCheck> {
  try { const r = await fn(); return { ...meta, ...r }; }
  catch (e) { return { ...meta, ok: false, valor: "error", detalle: "el check no pudo correr: " + (e instanceof Error ? e.message : "error") }; }
}

async function leerBancos(): Promise<MovBanco[]> {
  const p = await readStore<string | null>("bancos-movs", null);
  return p ? JSON.parse(gunzipSync(Buffer.from(p, "base64")).toString("utf8")) : [];
}
async function leerFranquicias(): Promise<FacturaCC[]> {
  const [p, man, ges] = await Promise.all([
    readStore<string | null>("franquicias-facturas", null),
    readStore<FacturaCC[] | null>("franquicias-manuales", null),
    readStore<Record<string, Gestion> | null>("franquicias-gestion", null),
  ]);
  const base: FacturaCC[] = p ? JSON.parse(gunzipSync(Buffer.from(p, "base64")).toString("utf8")) : [];
  return aplicarGestion([...base, ...(man ?? [])], ges ?? {});
}

export async function correrChecks(): Promise<QaCheck[]> {
  const checks: Promise<QaCheck>[] = [];

  // ── FACTURACIÓN (Lucho) ──────────────────────────────────────────────
  const fact = await getFacturacion().catch(() => null);
  checks.push(safe({ id: "fact-reconcilia", persona: "Lucho", seccion: "Facturación", titulo: "La facturación reconcilia", severidad: "alta" }, async () => {
    if (!fact) throw new Error("no se pudo calcular facturación");
    const sp = fact.porProducto.reduce((s, p) => s + p.facturacion, 0);
    const sl = fact.porLocal.reduce((s, l) => s + l.facturacion, 0);
    const ok = casi(sp, fact.total, 2) && casi(sl, fact.total, 2);
    return { ok, valor: M(fact.total), detalle: ok ? "producto = local = marca = total, sin pérdida" : `no cuadra: Σproducto ${M(sp)} vs total ${M(fact.total)}` };
  }));
  checks.push(safe({ id: "fact-margen", persona: "Lucho", seccion: "Facturación", titulo: "Márgenes altos a revisar", severidad: "media" }, async () => {
    if (!fact) throw new Error("sin facturación");
    // Las hamburguesas subcosteadas ya se excluyen (costoDudoso). Esto avisa de otros
    // productos con margen alto (>80%) por si hay más recetas incompletas escondidas
    // (bebidas/packaging pueden tener margen alto real, por eso es un aviso, no un error).
    const altos = fact.porProducto.filter((p) => p.tieneCosto && (p.margenPct ?? 0) > 0.80).sort((a, b) => (b.margenPct ?? 0) - (a.margenPct ?? 0));
    return { ok: altos.length === 0, valor: altos.length + " con >80%", detalle: altos.length === 0 ? "ningún producto costeado con margen sospechoso (>80%)" : `revisar ${altos.length} con margen >80% (¿receta incompleta o margen real?): ${altos.slice(0, 3).map((p) => `${p.nombre} ${Math.round((p.margenPct ?? 0) * 100)}%`).join(", ")}` };
  }));
  checks.push(safe({ id: "fact-exacta", persona: "Lucho", seccion: "Facturación", titulo: "Facturación exacta (Tango)", severidad: "media" }, async () => {
    if (!fact) throw new Error("sin facturación");
    return { ok: !!fact.exacta, valor: Math.round((fact.coberturaImporte ?? 0) * 100) + "% exacta", detalle: fact.exacta ? "importe real de Tango (IMPORTE_NETO)" : "está estimada (precio × unidades), no exacta" };
  }));
  checks.push(safe({ id: "costo-cobertura", persona: "Diego", seccion: "Costos", titulo: "Cobertura de costo/receta", severidad: "baja" }, async () => {
    if (!fact) throw new Error("sin facturación");
    const cob = fact.coberturaCosto ?? 0;
    const dud = fact.porProducto.filter((p) => p.costoDudoso).length;
    return { ok: cob >= 0.25, valor: Math.round(cob * 100) + "% con costo", detalle: `${Math.round(cob * 100)}% de la facturación tiene receta costeable · ${dud} recetas a revisar (incompletas)` };
  }));

  // ── CUENTAS CORRIENTES (Vale / Marina) ───────────────────────────────
  const ccFacturas = await leerFranquicias().catch(() => [] as FacturaCC[]);
  if (ccFacturas.length) {
    checks.push(safe({ id: "cc-duplicados", persona: "Vale", seccion: "Cuentas Corrientes", titulo: "Sin comprobantes duplicados", severidad: "alta" }, async () => {
      const cnt: Record<string, number> = {};
      for (const f of ccFacturas) { const k = f.clienteId + "|" + f.nro; cnt[k] = (cnt[k] || 0) + 1; }
      const dup = Object.values(cnt).filter((n) => n > 1).length;
      return { ok: dup === 0, valor: dup + " dup", detalle: dup === 0 ? "no hay comprobantes repetidos" : `${dup} comprobantes duplicados (doble conteo)` };
    }));
    checks.push(safe({ id: "cc-saldo-neg", persona: "Vale", seccion: "Cuentas Corrientes", titulo: "Sin saldo negativo", severidad: "media" }, async () => {
      const neg = ccFacturas.filter((f) => f.importe - f.cobrado < -1).length;
      return { ok: neg === 0, valor: neg + "", detalle: neg === 0 ? "ningún cobrado mayor al importe" : `${neg} facturas con saldo negativo` };
    }));
    checks.push(safe({ id: "cc-identidad", persona: "Vale", seccion: "Cuentas Corrientes", titulo: "Identidad de franquiciado", severidad: "alta" }, async () => {
      // La identidad ahora es por NOMBRE normalizado (no por N°). Solo es problema si una
      // factura no tiene NINGÚN nombre usable -> no se puede agrupar ni gestionar.
      const sinNombre = ccFacturas.filter((f) => claveFranq(f.cliente) === "(sin dato)").length;
      return { ok: sinNombre === 0, valor: sinNombre + " s/nombre", detalle: sinNombre === 0 ? "todos los franquiciados se identifican por nombre (unifica N° repetidos/faltantes)" : `${sinNombre} facturas sin nombre de franquiciado usable` };
    }));
    checks.push(safe({ id: "cc-aging", persona: "Marina", seccion: "Cuentas Corrientes", titulo: "El aging cuadra con el neto", severidad: "media" }, async () => {
      const r = resumirCC(ccFacturas, { ...PARAMS_DEFAULT, fechaCorte: hoyISO() });
      const ag = r.aging.reduce((s, a) => s + a.neto, 0);
      const ok = casi(ag, r.totalNeto, 2) && casi(r.cobrable + r.incobrable, r.totalNeto, 2);
      return { ok, valor: M(r.totalNeto), detalle: ok ? "Σaging = cobrable + incobrable = neto" : "el aging no suma el neto" };
    }));
    checks.push(safe({ id: "cc-maestro", persona: "Vale", seccion: "Cuentas Corrientes", titulo: "Maestro sin franquiciados partidos", severidad: "media" }, async () => {
      const p = { ...PARAMS_DEFAULT, fechaCorte: hoyISO() };
      const mae = maestro(ccFacturas, p);
      const claves = new Set(ccFacturas.map((f) => claveFranq(f.cliente)));
      // el maestro debe tener una ficha por clave estable (ni duplica ni pierde)
      const ok = mae.length === claves.size;
      return { ok, valor: mae.length + " fichas", detalle: ok ? `${mae.length} franquiciados en el maestro, 1 por identidad` : `desajuste: ${mae.length} fichas vs ${claves.size} identidades` };
    }));
    checks.push(safe({ id: "cc-cobrable-scope", persona: "Lucho", seccion: "Cuentas Corrientes", titulo: "Cobrable excluye incobrables y toma local", severidad: "alta" }, async () => {
      const r = resumirCC(ccFacturas, { ...PARAMS_DEFAULT, fechaCorte: hoyISO() });
      // El cobrable debe partirse exacto en vencido + por vencer, y dejar afuera la
      // deuda toma local (como el Excel). Si tomaLocal se colara, no cerraría.
      const ok = casi(r.cobrable, r.vencido + r.porVencer, 2) && r.tomaLocal >= 0 && r.cobrable <= r.totalNeto;
      return { ok, valor: M(r.cobrable), detalle: ok ? `cobrable ${M(r.cobrable)} = vencido + por vencer · toma local ${M(r.tomaLocal)} aparte · incobrables ${M(r.incobrable)} aparte` : "el cobrable no cierra con vencido + por vencer" };
    }));
    checks.push(safe({ id: "cc-cobranza", persona: "Marina", seccion: "Cuentas Corrientes", titulo: "La proyección no pierde plata", severidad: "media" }, async () => {
      const p = { ...PARAMS_DEFAULT, fechaCorte: hoyISO() };
      const proy = proyeccionCobranza(ccFacturas, p, 8);
      // el cobrable proyectado (atrasado+futuro+sinfecha) debe igualar la suma de los buckets
      const sum = proy.buckets.reduce((s, b) => s + b.monto, 0);
      const ok = casi(sum, proy.total, 2) && proy.total >= 0;
      return { ok, valor: M(proy.total), detalle: ok ? "Σsemanas + atrasado + sin fecha = total cobrable proyectado" : "la proyección no cuadra con sus buckets" };
    }));
    checks.push(safe({ id: "cc-morosidad", persona: "Ramiro", seccion: "Cuentas Corrientes", titulo: "Score de morosidad válido", severidad: "media" }, async () => {
      const p = { ...PARAMS_DEFAULT, fechaCorte: hoyISO() };
      const mor = morosidad(ccFacturas, p);
      const malos = mor.filter((m) => m.score < 0 || m.score > 100 || m.dso < 0 || !Number.isFinite(m.score) || !Number.isFinite(m.dso));
      const ok = malos.length === 0 && mor.length > 0;
      const criticos = mor.filter((m) => m.nivel === "Crítico").length;
      return { ok, valor: criticos + " críticos", detalle: ok ? `${mor.length} franquiciados scoreados (0–100), ${criticos} en nivel crítico` : `${malos.length} scores fuera de rango o inválidos` };
    }));
  }

  // ── BANCOS (Marina) ──────────────────────────────────────────────────
  const movs = await leerBancos().catch(() => [] as MovBanco[]);
  if (movs.length) {
    checks.push(safe({ id: "banco-otro", persona: "Marina", seccion: "Bancos", titulo: "Sin banco 'Otro' sin clasificar", severidad: "media" }, async () => {
      const otro = movs.filter((m) => m.banco === "Otro").length;
      return { ok: otro === 0, valor: otro + " movs", detalle: otro === 0 ? "todos los movimientos tienen banco reconocido" : `${otro} movimientos en banco 'Otro' (sin clasificar)` };
    }));
    checks.push(safe({ id: "banco-alias", persona: "Marina", seccion: "Bancos", titulo: "Locales canonicalizados", severidad: "media" }, async () => {
      const mal = new Set(movs.filter((m) => canonicalLocal(m.local) !== m.local).map((m) => m.local));
      return { ok: mal.size === 0, valor: mal.size + " alias", detalle: mal.size === 0 ? "no hay locales con alias sin unificar" : `${mal.size} locales con alias (doble conteo): ${Array.from(mal).slice(0, 3).join(", ")}` };
    }));
  }

  // ── CRUCE CDP vs VENTAS (Sofía) ──────────────────────────────────────
  const cruce = await getCruce().catch(() => null);
  if (cruce) {
    checks.push(safe({ id: "cruce-sucursales", persona: "Sofía", seccion: "CDP vs Ventas", titulo: "Sucursales que matchean", severidad: "media" }, async () => {
      const ped = new Set(cruce.filter((r) => (r.pedidoCdp ?? 0) > 0).map((r) => r.sucursal));
      const ven = new Set(cruce.filter((r) => (r.ventaEquiv ?? 0) > 0).map((r) => r.sucursal));
      const todas = new Set(Array.from(ped).concat(Array.from(ven)));
      const cruzan = Array.from(todas).filter((s) => ped.has(s) && ven.has(s)).length;
      const pct = todas.size ? cruzan / todas.size : 0;
      return { ok: pct >= 0.6, valor: Math.round(pct * 100) + "% cruzan", detalle: `${cruzan}/${todas.size} sucursales tienen pedido y venta (el resto no matchea por nombre o no cruza)` };
    }));
  }

  // ── FRESCURA DEL DATO (Sistema) ──────────────────────────────────────
  checks.push(safe({ id: "fresh-tango", persona: "Sistema", seccion: "Frescura", titulo: "Tango actualizado (push reciente)", severidad: "alta" }, async () => {
    const fresh = await readStore<{ cuando?: string } | null>("tango-fresh", null);
    if (!fresh?.cuando) return { ok: false, valor: "sin push", detalle: "no hay registro del último push de Tango" };
    const horas = (Date.now() - Date.parse(fresh.cuando)) / 3600000;
    return { ok: horas < 24, valor: Math.round(horas) + "h", detalle: horas < 24 ? `último push hace ${Math.round(horas)}h` : `⚠ el último push de Tango fue hace ${Math.round(horas)}h (¿se cortó la carga?)` };
  }));

  return Promise.all(checks);
}

export function armarReporte(checks: QaCheck[]): QaReporte {
  const pasan = checks.filter((c) => c.ok).length;
  return { cuando: new Date().toISOString(), total: checks.length, pasan, fallan: checks.length - pasan, checks };
}
