import { q } from "./consumo-db";

// Las ventas de Tango (venta_tango_articulo.monto) vienen CON IVA (21%), mientras que
// el costo del consumo (CMV) es NETO. Para que margen y foodcost sean comparables se
// netean las ventas ÷1,21 — es exactamente lo que hace Tango: en vw_PreciosProducto,
// precio_neto = precio / 1,21 (verificado 2026-08-07). Casi todo lo que venden estas
// marcas es comida preparada al 21%, así que la tasa uniforme es correcta.
const IVA = 1.21;
const neto = (montoConIva: number) => montoConIva / IVA;

// Capa de datos "Consumo (CMV) vs Ventas". Todo se agrega en SQL (rápido) sobre
// las tablas reales del grupo (esquema cierres):
//   - consumo_insumo_tango: insumo × local × día, con costo_total  -> CMV real
//   - venta_tango_articulo:  artículo × local × día, con monto ($) -> ventas
//   - sucursal_tango:        catálogo id → nombre, marca (D|T), es_propia
// La base arranca jun-2026; no hay 2025 (el YoY queda para cuando exista histórico).

export interface FiltrosConsumo {
  marca?: "D" | "T";      // Desembarco | Mr Tasty
  propias?: boolean;      // true = solo propios, false = solo franquicias, undefined = todas
  sucursalId?: number;    // un local puntual
}

export interface ResumenMes {
  mes: string;            // "YYYY-MM"
  ventas: number;         // $ vendidos
  unidades: number;       // unidades vendidas
  cmv: number;            // $ de consumo de insumos (costo)
  margen: number;         // ventas - cmv
  margenPct: number | null; // % sobre ventas (null si ventas=0)
}

export interface InsumoComparado {
  codigo: string;
  descripcion: string;
  unidad: string;
  cantA: number; costoA: number;
  cantB: number; costoB: number;
  varCosto: number | null;   // % (B vs A); null si A=0
}

export interface Sucursal {
  id: number;
  nombre: string;
  marca: string;      // "D" | "T"
  esPropia: boolean;
}

// Construye el WHERE por filtros sobre un alias de sucursal_tango (`s`) ya joineado.
// Devuelve el fragmento SQL y los params, arrancando en $offset+1.
function whereFiltros(f: FiltrosConsumo, offset: number): { sql: string; params: any[] } {
  const cond: string[] = [];
  const params: any[] = [];
  if (f.marca) { params.push(f.marca); cond.push(`s.marca = $${offset + params.length}`); }
  if (f.propias !== undefined) { params.push(f.propias); cond.push(`s.es_propia = $${offset + params.length}`); }
  if (f.sucursalId) { params.push(f.sucursalId); cond.push(`s.id = $${offset + params.length}`); }
  return { sql: cond.length ? " AND " + cond.join(" AND ") : "", params };
}

/** Resumen por mes: ventas $, unidades, CMV $ y margen — respetando los filtros. */
export async function getResumenMensual(f: FiltrosConsumo = {}): Promise<ResumenMes[]> {
  const wv = whereFiltros(f, 0);
  const wc = whereFiltros(f, wv.params.length);
  const rows = await q<{ mes: string; ventas: string | null; unidades: string | null; cmv: string | null }>(
    `
    WITH v AS (
      SELECT to_char(va.fecha,'YYYY-MM') mes, SUM(va.monto) ventas, SUM(va.cantidad) unidades
      FROM cierres.venta_tango_articulo va
      JOIN cierres.sucursal_tango s ON s.id = va.sucursal_id
      WHERE TRUE${wv.sql}
      GROUP BY 1
    ),
    c AS (
      SELECT to_char(ci.fecha,'YYYY-MM') mes, SUM(ci.costo_total) cmv
      FROM cierres.consumo_insumo_tango ci
      JOIN cierres.sucursal_tango s ON s.id = ci.sucursal_id
      WHERE TRUE${wc.sql}
      GROUP BY 1
    )
    SELECT COALESCE(v.mes, c.mes) mes, v.ventas, v.unidades, c.cmv
    FROM v FULL JOIN c USING (mes)
    ORDER BY 1
    `,
    [...wv.params, ...wc.params]
  );
  return rows.map((r) => {
    const ventas = neto(Number(r.ventas ?? 0)); // neto de IVA, comparable al CMV
    const cmv = Number(r.cmv ?? 0);
    return {
      mes: r.mes,
      ventas,
      unidades: Number(r.unidades ?? 0),
      cmv,
      margen: ventas - cmv,
      margenPct: ventas > 0 ? ((ventas - cmv) / ventas) * 100 : null,
    };
  });
}

/** Comparativo de consumo por insumo entre dos meses (YYYY-MM). Ordenado por costo del mes B. */
export async function getComparativo(mesA: string, mesB: string, f: FiltrosConsumo = {}): Promise<InsumoComparado[]> {
  const wf = whereFiltros(f, 2); // $1=mesA, $2=mesB
  const rows = await q<{
    codigo: string; descripcion: string; unidad: string;
    cant_a: string; costo_a: string; cant_b: string; costo_b: string;
  }>(
    `
    WITH base AS (
      SELECT btrim(ci.codigo) codigo, to_char(ci.fecha,'YYYY-MM') mes,
             ci.descripcion, ci.unidad, ci.cantidad, ci.costo_total
      FROM cierres.consumo_insumo_tango ci
      JOIN cierres.sucursal_tango s ON s.id = ci.sucursal_id
      WHERE to_char(ci.fecha,'YYYY-MM') IN ($1, $2)${wf.sql}
    )
    SELECT codigo,
      MAX(descripcion) descripcion,
      MAX(unidad) unidad,
      COALESCE(SUM(cantidad)    FILTER (WHERE mes = $1), 0) cant_a,
      COALESCE(SUM(costo_total) FILTER (WHERE mes = $1), 0) costo_a,
      COALESCE(SUM(cantidad)    FILTER (WHERE mes = $2), 0) cant_b,
      COALESCE(SUM(costo_total) FILTER (WHERE mes = $2), 0) costo_b
    FROM base
    GROUP BY codigo
    ORDER BY costo_b DESC
    `,
    [mesA, mesB, ...wf.params]
  );
  return rows.map((r) => {
    const costoA = Number(r.costo_a);
    const costoB = Number(r.costo_b);
    return {
      codigo: r.codigo,
      descripcion: r.descripcion || r.codigo,
      unidad: r.unidad || "",
      cantA: Number(r.cant_a),
      costoA,
      cantB: Number(r.cant_b),
      costoB,
      varCosto: costoA > 0 ? ((costoB - costoA) / costoA) * 100 : null,
    };
  });
}

/** Consumo por insumo de UN período (rango de meses YYYY-MM), para la vista "más/menos". */
export async function getConsumoPorInsumo(mesDesde: string, mesHasta: string, f: FiltrosConsumo = {}): Promise<
  { codigo: string; descripcion: string; unidad: string; cantidad: number; costo: number; locales: number }[]
> {
  const wf = whereFiltros(f, 2);
  const rows = await q<{ codigo: string; descripcion: string; unidad: string; cantidad: string; costo: string; locales: string }>(
    `
    SELECT btrim(ci.codigo) codigo, MAX(ci.descripcion) descripcion, MAX(ci.unidad) unidad,
           SUM(ci.cantidad) cantidad, SUM(ci.costo_total) costo,
           COUNT(DISTINCT ci.sucursal_id) locales
    FROM cierres.consumo_insumo_tango ci
    JOIN cierres.sucursal_tango s ON s.id = ci.sucursal_id
    WHERE to_char(ci.fecha,'YYYY-MM') BETWEEN $1 AND $2${wf.sql}
    GROUP BY 1
    ORDER BY costo DESC NULLS LAST
    `,
    [mesDesde, mesHasta, ...wf.params]
  );
  return rows.map((r) => ({
    codigo: r.codigo,
    descripcion: r.descripcion || r.codigo,
    unidad: r.unidad || "",
    cantidad: Number(r.cantidad ?? 0),
    costo: Number(r.costo ?? 0),
    locales: Number(r.locales ?? 0),
  }));
}

export interface LocalRentab {
  id: number; nombre: string; marca: string; esPropia: boolean;
  ventas: number; unidades: number; cmv: number;
  margenPct: number | null;   // (ventas-cmv)/ventas
  cmvPct: number | null;      // cmv/ventas (foodcost)
  sinConsumo: boolean;        // vende pero no cargó consumo -> margen no confiable (inflado)
  sinVentas: boolean;         // cargó consumo pero no registra ventas
}

/**
 * Rentabilidad POR LOCAL en un rango de meses. Además del foodcost, marca los
 * locales con cobertura despareja (ventas sin consumo o viceversa) porque en esos
 * el margen no es confiable — es el chequeo #2 del QA de negocio.
 */
export async function getPorLocal(mesDesde: string, mesHasta: string, f: FiltrosConsumo = {}): Promise<LocalRentab[]> {
  const wf = whereFiltros(f, 2); // $1=desde, $2=hasta ; filtros sobre alias s (sucursal_tango)
  const rows = await q<{ id: number; nombre: string; marca: string; es_propia: boolean; ventas: string; unidades: string; cmv: string; tiene_v: boolean; tiene_c: boolean }>(
    `
    WITH v AS (
      SELECT sucursal_id, SUM(monto) ventas, SUM(cantidad) unidades
      FROM cierres.venta_tango_articulo
      WHERE to_char(fecha,'YYYY-MM') BETWEEN $1 AND $2 GROUP BY sucursal_id
    ),
    c AS (
      SELECT sucursal_id, SUM(costo_total) cmv
      FROM cierres.consumo_insumo_tango
      WHERE to_char(fecha,'YYYY-MM') BETWEEN $1 AND $2 GROUP BY sucursal_id
    )
    SELECT s.id, s.nombre, s.marca, s.es_propia,
      COALESCE(v.ventas, 0) ventas, COALESCE(v.unidades, 0) unidades, COALESCE(c.cmv, 0) cmv,
      (v.sucursal_id IS NOT NULL) tiene_v, (c.sucursal_id IS NOT NULL) tiene_c
    FROM cierres.sucursal_tango s
    LEFT JOIN v ON v.sucursal_id = s.id
    LEFT JOIN c ON c.sucursal_id = s.id
    WHERE (v.sucursal_id IS NOT NULL OR c.sucursal_id IS NOT NULL)${wf.sql}
    ORDER BY COALESCE(v.ventas, 0) DESC
    `,
    [mesDesde, mesHasta, ...wf.params]
  );
  return rows.map((r) => {
    const ventas = neto(Number(r.ventas)), cmv = Number(r.cmv); // ventas netas de IVA
    return {
      id: r.id, nombre: r.nombre, marca: r.marca, esPropia: r.es_propia,
      ventas, unidades: Number(r.unidades), cmv,
      margenPct: ventas > 0 ? ((ventas - cmv) / ventas) * 100 : null,
      cmvPct: ventas > 0 ? (cmv / ventas) * 100 : null,
      sinConsumo: r.tiene_v && !r.tiene_c,
      sinVentas: r.tiene_c && !r.tiene_v,
    };
  });
}

/** Catálogo de sucursales (para el filtro). */
export async function getSucursales(): Promise<Sucursal[]> {
  const rows = await q<{ id: number; nombre: string; marca: string; es_propia: boolean }>(
    `SELECT id, nombre, marca, es_propia FROM cierres.sucursal_tango ORDER BY marca, nombre`
  );
  return rows.map((r) => ({ id: r.id, nombre: r.nombre, marca: r.marca, esPropia: r.es_propia }));
}

/** Meses disponibles en la base (para poblar los selectores), más nuevo primero. */
export async function getMesesDisponibles(): Promise<string[]> {
  const rows = await q<{ mes: string }>(
    `SELECT DISTINCT to_char(fecha,'YYYY-MM') mes FROM cierres.consumo_insumo_tango ORDER BY 1 DESC`
  );
  return rows.map((r) => r.mes);
}
