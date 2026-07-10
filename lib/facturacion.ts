import { getSources, getPreciosSource } from "./sources";
import { brandDeSucursal } from "./ventas";
import { rangoActividad } from "./actividad";
import { getRecetas } from "./recetas-store";
import { getInsumos } from "./insumos-store";
import { costearReceta, indiceInsumos } from "./recetas";
import { baseSuc } from "./sucursal-key";
import type { RangoQuery } from "./sources/types";

/**
 * Facturación ESTIMADA, 100% con datos vivos de Tango:
 *   unidades vendidas (ventas) × precio efectivo (precios, última venta) por SKU×local.
 *
 * Es un estimado honesto: usa el precio efectivo ACTUAL, no el de cada venta histórica
 * (los precios cambian). Para un rango reciente es muy fiel. La facturación EXACTA
 * llega cuando Sistemas exponga IMPORTE_NETO (vista vw_VentasArticuloDiaria, ya lista
 * en docs/sql/tango-plata.sql). Diseñado para cambiar la fuente sin tocar la pantalla.
 */

const clave = (sku: string, suc: string) => `${sku}|${suc}`;

export interface FactProducto {
  sku: string; nombre: string; marca: string;
  unidades: number; precio: number; facturacion: number;
  acumulado?: number;        // % acumulado de facturación (curva ABC)
  clase?: "A" | "B" | "C";   // A = hasta 80% · B = 80-95% · C = resto
  costoUnit?: number;        // costo de receta por unidad (con impuestos), si hay receta
  margen?: number;           // margen bruto total = facturación − costo × unidades
  margenPct?: number;        // margen / facturación
  tieneCosto?: boolean;      // false = sin receta (no se puede calcular margen)
}
export interface FactTurno { turno: string; unidades: number; facturacion: number; }
export interface FactDia { fecha: string; unidades: number; facturacion: number; }
export interface FactLocal {
  sucursal: string; marca: string;
  unidades: number; facturacion: number; cobertura: number; // % de sus unidades con precio
  margen: number;            // margen bruto (solo de productos con receta)
}
export interface FactMarca { marca: string; unidades: number; facturacion: number; }

export interface Facturacion {
  ventana: RangoQuery;
  refFecha: string;
  total: number;            // facturación estimada total
  unidades: number;         // unidades totales
  unidadesConPrecio: number;
  cobertura: number;        // % de unidades que pudieron valorizarse
  ticketProm: number;       // $ por unidad (no por ticket: no tenemos tickets aún)
  exacta: boolean;          // true = la mayoría del $ viene del IMPORTE real de Tango (no estimado)
  coberturaImporte: number; // % de unidades con importe real
  margenTotal: number;      // margen bruto total (facturación − costo, de lo que tiene receta)
  facturacionConCosto: number; // facturación de los productos con receta (base del margen)
  coberturaCosto: number;   // % de la facturación que tiene receta para costear
  abc: { a: number; b: number; c: number }; // cantidad de productos por clase
  porProducto: FactProducto[];
  porLocal: FactLocal[];
  porMarca: FactMarca[];
  porTurno: FactTurno[];
  porDia: FactDia[];
}

export async function getFacturacion(q: RangoQuery = rangoActividad(), opts?: { sucursal?: string }): Promise<Facturacion> {
  const { ventas } = getSources();
  const [dataRaw, precios, recetas, insumos] = await Promise.all([
    ventas.getVentas(q), getPreciosSource().getPrecios(), getRecetas(), getInsumos(),
  ]);
  // Drill-down: si viene una sucursal, se filtran las ventas a ese local y TODO el
  // resto del cálculo (productos, margen, ABC, turno, día) queda scopeado a ese local.
  const data = opts?.sucursal ? dataRaw.filter((v) => v.sucursalCanonico === opts.sucursal) : dataRaw;

  // Costo de receta por SKU de venta (con impuestos), del módulo Costos. Sirve para el
  // margen bruto real: solo cubre lo que tenga receta cargada (se reporta cobertura).
  const idxIns = indiceInsumos(insumos);
  const costoPorSku = new Map<string, number>();
  for (const r of recetas) {
    const cost = costearReceta(r, idxIns);
    // Solo recetas COMPLETAS: si falta algún insumo en el maestro, ese componente
    // se costea $0 y el costo total queda sub-valuado -> el margen saldría inflado.
    // Mejor tratarla como "sin costo" (no cubre margen) que mostrar un margen falso.
    if (cost.costoConImp > 0 && cost.nFaltantes === 0) costoPorSku.set(r.skuTango, cost.costoConImp);
  }

  // Precio por SKU×local; y fallback: precio del SKU en cualquier local (mejora cobertura).
  const pLocal = new Map<string, number>();
  const pSku = new Map<string, number>();
  for (const p of precios) {
    if (p.precio > 0) {
      // Clave por sucursal NORMALIZADA (baseSuc): ventas y precios vienen de dos
      // vistas Tango distintas; si difieren en acento/mayúsculas el match por local
      // fallaba y caía al precio de otro local (pSku). Normalizando, matchea igual.
      pLocal.set(clave(p.sku, baseSuc(p.sucursal)), p.precio);
      if (!pSku.has(p.sku)) pSku.set(p.sku, p.precio);
    }
  }
  const precioDe = (sku: string, suc: string): number =>
    pLocal.get(clave(sku, baseSuc(suc))) ?? pSku.get(sku) ?? 0;

  const prod = new Map<string, FactProducto>();
  const uppPorSku = new Map<string, number>(); // unidades VALORIZADAS por SKU (para el margen)
  const local = new Map<string, { sucursal: string; marca: string; unidades: number; facturacion: number; conPrecio: number; margen: number }>();
  const turno = new Map<string, FactTurno>();
  const dia = new Map<string, FactDia>();
  let refFecha = "";
  let total = 0, unidades = 0, unidadesConPrecio = 0, unidadesConImporte = 0;
  let margenTotal = 0, facturacionConCosto = 0;

  for (const v of data) {
    if (v.fecha > refFecha) refFecha = v.fecha;
    const precio = precioDe(v.sku, v.sucursalCanonico);
    // Si Tango trae el IMPORTE real del renglón, se usa ese (exacto); si no, el
    // estimado = precio efectivo × unidades.
    const tieneImporte = v.importe != null && Number.isFinite(v.importe);
    const fact = tieneImporte ? (v.importe as number) : precio * v.unidades;
    const valorizado = tieneImporte || precio > 0; // se le pudo poner $
    const marca = brandDeSucursal(v.sucursalCanonico);
    const cu = costoPorSku.get(v.sku) ?? 0; // costo unitario de receta (0 = sin receta)
    const margenRow = valorizado && cu > 0 ? fact - cu * v.unidades : 0;

    unidades += v.unidades;
    if (valorizado) { unidadesConPrecio += v.unidades; total += fact; }
    if (tieneImporte) unidadesConImporte += v.unidades;
    if (valorizado && cu > 0) { margenTotal += margenRow; facturacionConCosto += fact; }

    const tn = v.turno ?? "noche";
    let tu = turno.get(tn);
    if (!tu) { tu = { turno: tn, unidades: 0, facturacion: 0 }; turno.set(tn, tu); }
    tu.unidades += v.unidades; tu.facturacion += fact;

    let di = dia.get(v.fecha);
    if (!di) { di = { fecha: v.fecha, unidades: 0, facturacion: 0 }; dia.set(v.fecha, di); }
    di.unidades += v.unidades; di.facturacion += fact;

    let pr = prod.get(v.sku);
    if (!pr) { pr = { sku: v.sku, nombre: v.nombre ?? v.sku, marca, unidades: 0, precio, facturacion: 0 }; prod.set(v.sku, pr); }
    pr.unidades += v.unidades;
    pr.facturacion += fact;
    if (valorizado) uppPorSku.set(v.sku, (uppPorSku.get(v.sku) ?? 0) + v.unidades);
    if (precio > 0) pr.precio = precio; // último precio visto

    let lo = local.get(v.sucursalCanonico);
    if (!lo) { lo = { sucursal: v.sucursalCanonico, marca, unidades: 0, facturacion: 0, conPrecio: 0, margen: 0 }; local.set(v.sucursalCanonico, lo); }
    lo.unidades += v.unidades;
    lo.facturacion += fact;
    lo.margen += margenRow;
    if (valorizado) lo.conPrecio += v.unidades;
  }

  const porProducto = Array.from(prod.values()).sort((a, b) => b.facturacion - a.facturacion);
  // Curva ABC: acumulado sobre el total; A = hasta 80%, B = 80-95%, C = resto.
  const abc = { a: 0, b: 0, c: 0 };
  let acc = 0;
  for (const p of porProducto) {
    const cumAntes = total ? acc / total : 0;
    acc += p.facturacion;
    p.acumulado = total ? acc / total : 0;
    p.clase = cumAntes < 0.8 ? "A" : cumAntes < 0.95 ? "B" : "C";
    abc[p.clase === "A" ? "a" : p.clase === "B" ? "b" : "c"]++;
    // Margen bruto del producto (costo de receta constante por SKU).
    const cu = costoPorSku.get(p.sku);
    if (cu != null && cu > 0) {
      p.costoUnit = cu; p.tieneCosto = true;
      // Costo solo sobre las unidades VALORIZADAS (las que aportaron facturación),
      // no sobre el total: si no, se resta costo de unidades que sumaron $0 y el
      // margen queda subvaluado (inconsistente con margenTotal y el margen por local).
      p.margen = p.facturacion - cu * (uppPorSku.get(p.sku) ?? 0);
      p.margenPct = p.facturacion ? p.margen / p.facturacion : 0;
    } else {
      p.tieneCosto = false;
    }
  }
  const porLocal = Array.from(local.values())
    .map((l) => ({ sucursal: l.sucursal, marca: l.marca, unidades: l.unidades, facturacion: l.facturacion, cobertura: l.unidades ? l.conPrecio / l.unidades : 0, margen: l.margen }))
    .sort((a, b) => b.facturacion - a.facturacion);

  const marcaMap = new Map<string, FactMarca>();
  for (const l of porLocal) {
    const m = marcaMap.get(l.marca) ?? { marca: l.marca, unidades: 0, facturacion: 0 };
    m.unidades += l.unidades; m.facturacion += l.facturacion;
    marcaMap.set(l.marca, m);
  }
  const porMarca = Array.from(marcaMap.values()).sort((a, b) => b.facturacion - a.facturacion);

  const ordenTurno = ["mediodia", "tarde", "noche"];
  const porTurno = Array.from(turno.values()).sort((a, b) => ordenTurno.indexOf(a.turno) - ordenTurno.indexOf(b.turno));
  const porDia = Array.from(dia.values()).sort((a, b) => a.fecha.localeCompare(b.fecha));

  return {
    ventana: q,
    refFecha,
    total,
    unidades,
    unidadesConPrecio,
    cobertura: unidades ? unidadesConPrecio / unidades : 0,
    ticketProm: unidadesConPrecio ? total / unidadesConPrecio : 0,
    exacta: unidades > 0 && unidadesConImporte / unidades > 0.9,
    coberturaImporte: unidades ? unidadesConImporte / unidades : 0,
    margenTotal,
    facturacionConCosto,
    coberturaCosto: total ? facturacionConCosto / total : 0,
    abc,
    porProducto,
    porLocal,
    porMarca,
    porTurno,
    porDia,
  };
}
