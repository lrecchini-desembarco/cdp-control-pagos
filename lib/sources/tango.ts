import type { VentaSku, VentasSource, RangoQuery, PrecioProducto, PreciosSource } from "./types";
import { getBridgeUrl } from "../bridge-url";

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
    const result = await pool
      .request()
      .input("desde", sql.Date, q.desde)
      .input("hasta", sql.Date, q.hasta)
      .query(VENTAS_QUERY);

    return result.recordset.map(filaAVenta);
  },
};

// Query de la vista (compartida por el SQL directo y el bridge HTTP).
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
