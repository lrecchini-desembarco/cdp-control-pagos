import type { VentaSku, VentasSource, RangoQuery, PrecioProducto, PreciosSource, CobroDia, VentaHora } from "./types";
import { getBridgeUrl } from "../bridge-url";
import { ventasDesdeCache, preciosDesdeCache } from "../tango-cache";

// Fuente REAL de ventas: Tango sobre SQL Server (mismo patrón que el dashboard
// de facturación del grupo). La app NO consulta tablas de Tango directo: lee una
// VISTA read-only `dbo.vw_VentasInsumoDiaria` que mapea el esquema interno.
// Plantilla de la vista en lib/sources/tango.queries.sql.
//
// El paquete `mssql` se importa de forma perezosa: en modo mock nunca se carga,
// así el proyecto corre sin la dependencia nativa instalada.

let poolPromise: Promise<any> | null = null;

async function getPool() {
  if (!poolPromise) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const sql = require("mssql");
    // Instancia nombrada (ej. SRVTANGO\AXSQLEXPRESS): se resuelve por SQL Browser,
    // sin puerto fijo. Si hay instancia, NO mandamos port.
    const instanceName = process.env.TANGO_DB_INSTANCE || undefined;
    poolPromise = new sql.ConnectionPool({
      server: process.env.TANGO_DB_HOST!,
      ...(instanceName ? {} : { port: Number(process.env.TANGO_DB_PORT ?? 1433) }),
      database: process.env.TANGO_DB_NAME!,
      user: process.env.TANGO_DB_USER!,
      password: process.env.TANGO_DB_PASSWORD!,
      options: {
        instanceName,
        encrypt: process.env.TANGO_DB_ENCRYPT === "true",
        trustServerCertificate: process.env.TANGO_DB_TRUST_CERT !== "false",
      },
      pool: { max: 5, min: 0, idleTimeoutMillis: 30_000 },
    }).connect();
  }
  return poolPromise;
}

// Mapea una fila de la vista (venga de SQL directo o del bridge HTTP) a VentaSku.
function filaAVenta(r: any): VentaSku {
  return {
    fecha: String(r.fecha),
    sku: String(r.sku),
    nombre: r.nombre != null ? String(r.nombre) : undefined,
    sucursalCanonico: String(r.sucursal_canonico),
    unidades: Number(r.unidades) || 0,
    // importe real (IMPORTE_NETO) si la vista lo trae; si no, queda undefined y la
    // app cae al estimado (precio efectivo × unidades).
    importe: r.importe != null ? Number(r.importe) : undefined,
    turno: r.turno ? String(r.turno) : undefined,
  };
}

// Vercel (cloud) no llega al SQL interno. Si está TANGO_BRIDGE_URL, las ventas se
// piden a un bridge HTTP que corre en la red de la empresa (ver scripts/tango-bridge.mjs),
// publicado por Cloudflare Tunnel. En la red interna se usa SQL directo (sin bridge).
async function ventasViaBridge(q: RangoQuery, base: string): Promise<VentaSku[]> {
  const u = new URL(`${base}/ventas`);
  u.searchParams.set("desde", q.desde);
  u.searchParams.set("hasta", q.hasta);
  const res = await fetch(u.toString(), {
    headers: { "x-bridge-secret": process.env.TANGO_BRIDGE_SECRET ?? "", "ngrok-skip-browser-warning": "true" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Bridge Tango respondió ${res.status} ${res.statusText}`);
  const rows = (await res.json()) as any[];
  return rows.map(filaAVenta);
}

export const tangoVentasSource: VentasSource = {
  async getVentas(q: RangoQuery): Promise<VentaSku[]> {
    // 1) Cache en KV (empujado por la PC de carga, sin túnel). Es la vía normal.
    // El push guarda las filas CRUDAS del bridge (sucursal_canonico, snake_case),
    // así que hay que pasarlas por filaAVenta igual que el bridge/SQL directo —
    // si no, sucursalCanonico queda undefined y todo colapsa en una sola marca/local.
    const cache = await ventasDesdeCache(q);
    if (cache) return cache.map(filaAVenta);
    // 2) Respaldo: bridge por túnel (si está y el cache no cubre el rango).
    const base = await getBridgeUrl();
    if (base) return ventasViaBridge(q, base);

    if (!process.env.TANGO_DB_HOST) {
      throw new Error(
        "Tango no está configurado (falta TANGO_DB_HOST o TANGO_BRIDGE_URL). Configurá las variables TANGO_* / el bridge, o usá DATA_SOURCE=mock."
      );
    }
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const sql = require("mssql");
    const pool = await getPool();
    const consulta = (query: string) =>
      pool.request().input("desde", sql.Date, q.desde).input("hasta", sql.Date, q.hasta).query(query);
    // Primero la vista con IMPORTE (facturación exacta); si no existe todavía, la de siempre.
    let result;
    try { result = await consulta(VENTAS_QUERY_PLATA); }
    catch { result = await consulta(VENTAS_QUERY); }
    return result.recordset.map(filaAVenta);
  },
};

// Vista con IMPORTE_NETO (facturación exacta). La crea Sistemas: docs/sql/tango-plata.sql.
export const VENTAS_QUERY_PLATA = `
  SELECT
    CONVERT(varchar(10), fecha, 23) AS fecha,
    sucursal_canonico, sku, nombre, turno, unidades, importe
  FROM dbo.vw_VentasArticuloDiaria
  WHERE fecha BETWEEN @desde AND @hasta
  ORDER BY fecha, sucursal_canonico, sku;
`;

// Vista de siempre (solo unidades) — fallback si la de importe no está.
export const VENTAS_QUERY = `
  SELECT
    CONVERT(varchar(10), fecha, 23) AS fecha,
    sucursal_canonico,
    sku,
    nombre,
    turno,
    unidades
  FROM dbo.vw_VentasInsumoDiaria
  WHERE fecha BETWEEN @desde AND @hasta
  ORDER BY fecha, sucursal_canonico, sku;
`;

// ---------------------------------------------------------------------------
// Precios de productos (precio efectivo de la última venta, por SKU x sucursal).
// Lee la vista read-only dbo.vw_PreciosProducto (ver lib/sources/precios.queries.sql).
// ---------------------------------------------------------------------------
function filaAPrecio(r: any): PrecioProducto {
  return {
    sku: String(r.sku),
    nombre: r.nombre != null ? String(r.nombre) : String(r.sku),
    sucursal: String(r.sucursal),
    precio: Number(r.precio) || 0,
    precioNeto: Number(r.precio_neto) || 0,
    actualizado: r.actualizado != null ? String(r.actualizado) : undefined,
  };
}

async function preciosViaBridge(base: string): Promise<PrecioProducto[]> {
  const res = await fetch(`${base}/precios`, {
    headers: { "x-bridge-secret": process.env.TANGO_BRIDGE_SECRET ?? "", "ngrok-skip-browser-warning": "true" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Bridge Tango respondió ${res.status} ${res.statusText}`);
  const rows = (await res.json()) as any[];
  return rows.map(filaAPrecio);
}

export const tangoPreciosSource: PreciosSource = {
  async getPrecios(): Promise<PrecioProducto[]> {
    // 1) Cache en KV (empujado por la PC de carga). 2) Respaldo: bridge.
    // Igual que ventas: el push guarda filas crudas (precio_neto), hay que mapearlas.
    const cache = await preciosDesdeCache();
    if (cache) return cache.map(filaAPrecio);
    const base = await getBridgeUrl();
    if (base) return preciosViaBridge(base);
    if (!process.env.TANGO_DB_HOST) {
      throw new Error(
        "Tango no está configurado (falta TANGO_DB_HOST o TANGO_BRIDGE_URL). Configurá TANGO_* / el bridge, o usá DATA_SOURCE=mock."
      );
    }
    const pool = await getPool();
    const result = await pool.request().query(PRECIOS_QUERY);
    return result.recordset.map(filaAPrecio);
  },
};

export const PRECIOS_QUERY = `
  SELECT sku, nombre, sucursal,
         CONVERT(varchar(10), actualizado, 23) AS actualizado,
         precio, precio_neto
  FROM dbo.vw_PreciosProducto
  ORDER BY nombre, sucursal;
`;

// ---------------------------------------------------------------------------
// Cobros por medio de pago y ventas por hora (para Cobros y Ticket/Horas).
// Ambas vistas traen ID_SUCURSAL (número), no el nombre del local: Tango todavía
// no lo expone. Por eso hoy se agregan a nivel GRUPO; el desglose por local se
// enciende cuando Sistemas agregue DESC_SUCURSAL a las vistas.
// Camino: en la nube se usa el bridge HTTP; en la red interna, SQL directo.
// ---------------------------------------------------------------------------
async function rangoViaBridge(path: string, q: RangoQuery, base: string): Promise<any[]> {
  const u = new URL(`${base}${path}`);
  u.searchParams.set("desde", q.desde);
  u.searchParams.set("hasta", q.hasta);
  const res = await fetch(u.toString(), {
    headers: { "x-bridge-secret": process.env.TANGO_BRIDGE_SECRET ?? "", "ngrok-skip-browser-warning": "true" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Bridge Tango respondió ${res.status} ${res.statusText}`);
  return (await res.json()) as any[];
}

async function rangoViaSql(query: string, q: RangoQuery): Promise<any[]> {
  if (!process.env.TANGO_DB_HOST) {
    throw new Error("Tango no está configurado (falta TANGO_BRIDGE_URL o TANGO_DB_HOST).");
  }
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const sql = require("mssql");
  const pool = await getPool();
  const result = await pool.request().input("desde", sql.Date, q.desde).input("hasta", sql.Date, q.hasta).query(query);
  return result.recordset;
}

export async function getCobros(q: RangoQuery): Promise<CobroDia[]> {
  const base = await getBridgeUrl();
  const rows = base ? await rangoViaBridge("/cobros", q, base) : await rangoViaSql(COBROS_QUERY, q);
  return rows.map((r) => ({ fecha: String(r.fecha), idSucursal: Number(r.id_sucursal) || 0, medioPago: String(r.medio_pago ?? "").trim() || "Sin medio", importe: Number(r.importe) || 0 }));
}

export async function getVentasHoras(q: RangoQuery): Promise<VentaHora[]> {
  const base = await getBridgeUrl();
  const rows = base ? await rangoViaBridge("/ventas-horas", q, base) : await rangoViaSql(VENTAS_HORAS_QUERY, q);
  return rows.map((r) => ({ fecha: String(r.fecha), idSucursal: Number(r.id_sucursal) || 0, hora: Number(r.hora) || 0, importe: Number(r.importe) || 0, tickets: Number(r.tickets) || 0 }));
}

// En SQL directo el bridge devuelve claves snake_case (id_sucursal, medio_pago…) para
// que el mapeo de arriba funcione igual venga de donde venga.
export const COBROS_QUERY = `
  SELECT CONVERT(varchar(10), FECHA, 23) AS fecha, ID_SUCURSAL AS id_sucursal,
         MEDIO_PAGO AS medio_pago, IMPORTE AS importe
  FROM dbo.vw_CobrosDiarios
  WHERE FECHA BETWEEN @desde AND @hasta
  ORDER BY FECHA, ID_SUCURSAL, MEDIO_PAGO;
`;

export const VENTAS_HORAS_QUERY = `
  SELECT CONVERT(varchar(10), FECHA, 23) AS fecha, ID_SUCURSAL AS id_sucursal,
         HORA AS hora, IMPORTE AS importe, TICKETS AS tickets
  FROM dbo.vw_VentasPorHora
  WHERE FECHA BETWEEN @desde AND @hasta
  ORDER BY FECHA, ID_SUCURSAL, HORA;
`;
