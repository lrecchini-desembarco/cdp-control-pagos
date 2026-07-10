import { getSources, getPreciosSource } from "./sources";
import { brandDeSucursal } from "./ventas";
import { rangoActividad } from "./actividad";
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
}
export interface FactLocal {
  sucursal: string; marca: string;
  unidades: number; facturacion: number; cobertura: number; // % de sus unidades con precio
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
  porProducto: FactProducto[];
  porLocal: FactLocal[];
  porMarca: FactMarca[];
}

export async function getFacturacion(q: RangoQuery = rangoActividad()): Promise<Facturacion> {
  const { ventas } = getSources();
  const [data, precios] = await Promise.all([ventas.getVentas(q), getPreciosSource().getPrecios()]);

  // Precio por SKU×local; y fallback: precio del SKU en cualquier local (mejora cobertura).
  const pLocal = new Map<string, number>();
  const pSku = new Map<string, number>();
  for (const p of precios) {
    if (p.precio > 0) {
      pLocal.set(clave(p.sku, p.sucursal), p.precio);
      if (!pSku.has(p.sku)) pSku.set(p.sku, p.precio);
    }
  }
  const precioDe = (sku: string, suc: string): number =>
    pLocal.get(clave(sku, suc)) ?? pSku.get(sku) ?? 0;

  const prod = new Map<string, FactProducto>();
  const local = new Map<string, { sucursal: string; marca: string; unidades: number; facturacion: number; conPrecio: number }>();
  let refFecha = "";
  let total = 0, unidades = 0, unidadesConPrecio = 0;

  for (const v of data) {
    if (v.fecha > refFecha) refFecha = v.fecha;
    const precio = precioDe(v.sku, v.sucursalCanonico);
    const fact = precio * v.unidades;
    const marca = brandDeSucursal(v.sucursalCanonico);

    unidades += v.unidades;
    if (precio > 0) { unidadesConPrecio += v.unidades; total += fact; }

    let pr = prod.get(v.sku);
    if (!pr) { pr = { sku: v.sku, nombre: v.nombre ?? v.sku, marca, unidades: 0, precio, facturacion: 0 }; prod.set(v.sku, pr); }
    pr.unidades += v.unidades;
    pr.facturacion += fact;
    if (precio > 0) pr.precio = precio; // último precio visto

    let lo = local.get(v.sucursalCanonico);
    if (!lo) { lo = { sucursal: v.sucursalCanonico, marca, unidades: 0, facturacion: 0, conPrecio: 0 }; local.set(v.sucursalCanonico, lo); }
    lo.unidades += v.unidades;
    lo.facturacion += fact;
    if (precio > 0) lo.conPrecio += v.unidades;
  }

  const porProducto = Array.from(prod.values()).sort((a, b) => b.facturacion - a.facturacion);
  const porLocal = Array.from(local.values())
    .map((l) => ({ sucursal: l.sucursal, marca: l.marca, unidades: l.unidades, facturacion: l.facturacion, cobertura: l.unidades ? l.conPrecio / l.unidades : 0 }))
    .sort((a, b) => b.facturacion - a.facturacion);

  const marcaMap = new Map<string, FactMarca>();
  for (const l of porLocal) {
    const m = marcaMap.get(l.marca) ?? { marca: l.marca, unidades: 0, facturacion: 0 };
    m.unidades += l.unidades; m.facturacion += l.facturacion;
    marcaMap.set(l.marca, m);
  }
  const porMarca = Array.from(marcaMap.values()).sort((a, b) => b.facturacion - a.facturacion);

  return {
    ventana: q,
    refFecha,
    total,
    unidades,
    unidadesConPrecio,
    cobertura: unidades ? unidadesConPrecio / unidades : 0,
    ticketProm: unidadesConPrecio ? total / unidadesConPrecio : 0,
    porProducto,
    porLocal,
    porMarca,
  };
}
