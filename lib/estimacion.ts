// Estimación de insumos (forecasting). Pronostica ventas futuras por producto ×
// sucursal (promedio ponderado del mismo día de semana, semanas recientes pesan
// más) y las traduce a insumos con la receta COMPLETA. Base para compras/CDP.
import type { VentaSku } from "./sources/types";
import { versionVigente, indiceInsumos, type Receta } from "./recetas";
import { precioConImpuestos, type Insumo } from "./insumos";

export interface InsumoEstimado { cod: string; nombre: string; proveedor: string; presentacion: string; cantidad: number; bultos: number; costo: number; nProductos: number }
export interface SinRecetaItem { sku: string; nombre: string; unidades: number; recetaTango?: boolean }
export interface ResumenEstimacion {
  horizonteDias: number;
  histDesde: string; histHasta: string;  // ventana histórica usada
  futDesde: string; futHasta: string;     // días pronosticados
  totalCosto: number;
  totalUnidades: number;                   // unidades de venta pronosticadas
  cobertura: { conReceta: number; sinReceta: number; pct: number }; // unidades traducibles
  porInsumo: InsumoEstimado[];
  sinReceta: SinRecetaItem[];              // top productos sin receta (no estimables)
  sucursales: string[];
}

const DIA = 86400000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const wd = (f: string) => new Date(f + "T00:00:00Z").getUTCDay();

function fechasEntre(desde: string, hasta: string): string[] {
  const out: string[] = [];
  const fin = Date.parse(hasta + "T00:00:00Z");
  for (let t = Date.parse(desde + "T00:00:00Z"); t <= fin; t += DIA) out.push(iso(new Date(t)));
  return out;
}
function proxDias(hoy: string, n: number): string[] {
  const out: string[] = [];
  let t = Date.parse(hoy + "T00:00:00Z") + DIA; // desde mañana
  for (let i = 0; i < n; i++) { out.push(iso(new Date(t))); t += DIA; }
  return out;
}

export function estimarInsumos(
  ventas: VentaSku[], recetas: Receta[], insumos: Insumo[],
  opts: { horizonteDias: number; hoy: string; sucursal?: string }
): ResumenEstimacion {
  const { horizonteDias, hoy, sucursal } = opts;
  const idxIns = indiceInsumos(insumos);
  const recetaPorSku = new Map<string, Receta>();
  for (const r of recetas) recetaPorSku.set(r.skuTango, r);

  const sucursales = new Set<string>();
  for (const v of ventas) sucursales.add(v.sucursalCanonico);
  const vs = sucursal ? ventas.filter((v) => v.sucursalCanonico === sucursal) : ventas;

  // ventana histórica presente en los datos
  let minF = "9999-99-99", maxF = "0000-00-00";
  for (const v of vs) { if (v.fecha < minF) minF = v.fecha; if (v.fecha > maxF) maxF = v.fecha; }
  const vacio: ResumenEstimacion = { horizonteDias, histDesde: "", histHasta: "", futDesde: "", futHasta: "", totalCosto: 0, totalUnidades: 0, cobertura: { conReceta: 0, sinReceta: 0, pct: 0 }, porInsumo: [], sinReceta: [], sucursales: Array.from(sucursales).sort() };
  if (maxF === "0000-00-00") return vacio;

  // fechas de la ventana por día de semana (recientes primero, para ponderar)
  const fechasPorWd: string[][] = Array.from({ length: 7 }, () => []);
  for (const f of fechasEntre(minF, maxF)) fechasPorWd[wd(f)].push(f);
  for (const arr of fechasPorWd) arr.sort((a, b) => b.localeCompare(a));

  // ventas por sku -> Map<fecha, unidades>
  const porSku = new Map<string, Map<string, number>>();
  const nombreSku = new Map<string, string>();
  for (const v of vs) {
    let m = porSku.get(v.sku); if (!m) { m = new Map(); porSku.set(v.sku, m); }
    m.set(v.fecha, (m.get(v.fecha) ?? 0) + v.unidades);
    if (v.nombre) nombreSku.set(v.sku, v.nombre);
  }

  const fut = proxDias(hoy, horizonteDias);
  const futWd = fut.map(wd);

  const insumoAcum = new Map<string, { cantidad: number; skus: Set<string> }>();
  const sinRecetaMap = new Map<string, number>();
  let uConReceta = 0, uSinReceta = 0, totalUnidades = 0;

  for (const [sku, porFecha] of Array.from(porSku.entries())) {
    // promedio ponderado por día de semana (0-fill para días sin venta, decaimiento por antigüedad)
    const avgWd = fechasPorWd.map((fechas) => {
      if (!fechas.length) return 0;
      let num = 0, den = 0;
      for (let i = 0; i < fechas.length; i++) { const w = Math.pow(0.7, i); num += (porFecha.get(fechas[i]) ?? 0) * w; den += w; }
      return den ? num / den : 0;
    });
    let uEsp = 0;
    for (const d of futWd) uEsp += avgWd[d];
    if (uEsp <= 0.01) continue;
    totalUnidades += uEsp;

    const rec = recetaPorSku.get(sku);
    const comp = rec ? (versionVigente(rec)?.componentes ?? []).filter((c) => idxIns.has(c.insumoCod.trim().toLowerCase())) : [];
    if (comp.length === 0) {
      uSinReceta += uEsp;
      sinRecetaMap.set(sku, (sinRecetaMap.get(sku) ?? 0) + uEsp);
      continue;
    }
    uConReceta += uEsp;
    for (const c of comp) {
      const key = c.insumoCod.trim().toLowerCase();
      let a = insumoAcum.get(key); if (!a) { a = { cantidad: 0, skus: new Set() }; insumoAcum.set(key, a); }
      a.cantidad += uEsp * c.cant; a.skus.add(sku);
    }
  }

  const porInsumo: InsumoEstimado[] = Array.from(insumoAcum.entries()).map(([key, v]) => {
    const ins = idxIns.get(key);
    const costoU = ins ? precioConImpuestos(ins) : 0;
    const factor = ins?.factor && ins.factor > 0 ? ins.factor : 0;
    return { cod: ins?.cod ?? key, nombre: ins?.descripcion ?? key, proveedor: ins?.proveedor ?? "", presentacion: ins?.presentacion ?? "", cantidad: v.cantidad, bultos: factor ? v.cantidad / factor : 0, costo: v.cantidad * costoU, nProductos: v.skus.size };
  }).sort((a, b) => b.costo - a.costo);

  const den = (uConReceta + uSinReceta) || 1;
  const sinReceta = Array.from(sinRecetaMap.entries())
    .map(([sku, u]) => ({ sku, nombre: nombreSku.get(sku) ?? sku, unidades: u }))
    .sort((a, b) => b.unidades - a.unidades).slice(0, 50);

  return {
    horizonteDias, histDesde: minF, histHasta: maxF, futDesde: fut[0], futHasta: fut[fut.length - 1],
    totalCosto: porInsumo.reduce((s, x) => s + x.costo, 0), totalUnidades,
    cobertura: { conReceta: uConReceta, sinReceta: uSinReceta, pct: uConReceta / den },
    porInsumo, sinReceta, sucursales: Array.from(sucursales).sort(),
  };
}
