/**
 * Bridge HTTP read-only de Tango.
 *
 * Corre en una máquina de la red de la empresa (la que llega a SRVTANGO) y
 * expone SOLO las ventas de la vista vw_VentasInsumoDiaria por HTTP, protegido
 * por un secreto. La app en Vercel (que no llega al SQL interno) le pega a este
 * bridge a través de Cloudflare Tunnel.
 *
 * Uso:
 *   1) .env.local con TANGO_DB_* (ver .env.example) + BRIDGE_SECRET (un token largo).
 *   2) node scripts/tango-bridge.mjs           -> escucha en http://localhost:8787
 *   3) cloudflared tunnel --url http://localhost:8787   -> da una URL https pública
 *   4) En Vercel: TANGO_BRIDGE_URL=<esa url>, TANGO_BRIDGE_SECRET=<mismo token>,
 *      VENTAS_SOURCE=live
 *
 * Seguridad: solo expone GET /ventas (consulta parametrizada a la vista). No hay
 * SQL arbitrario. Exige header x-bridge-secret. Nunca expongas el SQL directo.
 */
import { createServer } from "http";
import { createRequire } from "module";
import { readFileSync } from "fs";

const require = createRequire(import.meta.url);

// Carga simple de .env.local
try {
  const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {}

const PORT = Number(process.env.BRIDGE_PORT ?? 8787);
const SECRET = process.env.BRIDGE_SECRET;
if (!SECRET) {
  console.error("✗ Falta BRIDGE_SECRET en .env.local (un token largo y secreto).");
  process.exit(1);
}

const sql = require("mssql");
const instanceName = process.env.TANGO_DB_INSTANCE || undefined;
const config = {
  server: process.env.TANGO_DB_HOST,
  ...(instanceName ? {} : { port: Number(process.env.TANGO_DB_PORT ?? 1433) }),
  database: process.env.TANGO_DB_NAME,
  user: process.env.TANGO_DB_USER,
  password: process.env.TANGO_DB_PASSWORD,
  options: {
    instanceName,
    encrypt: process.env.TANGO_DB_ENCRYPT === "true",
    trustServerCertificate: process.env.TANGO_DB_TRUST_CERT !== "false",
  },
  pool: { max: 5, min: 0, idleTimeoutMillis: 30_000 },
};

// Vista con IMPORTE (facturación exacta). La crea Sistemas (docs/sql/tango-plata.sql).
// Si todavía no existe, /ventas cae automáticamente a VENTAS_QUERY (solo unidades).
const VENTAS_QUERY_PLATA = `
  SELECT
    CONVERT(varchar(10), fecha, 23) AS fecha,
    sucursal_canonico, sku, nombre, turno, unidades, importe
  FROM dbo.vw_VentasArticuloDiaria
  WHERE fecha BETWEEN @desde AND @hasta
  ORDER BY fecha, sucursal_canonico, sku;
`;

const VENTAS_QUERY = `
  SELECT
    CONVERT(varchar(10), fecha, 23) AS fecha,
    sucursal_canonico, sku, nombre, turno, unidades
  FROM dbo.vw_VentasInsumoDiaria
  WHERE fecha BETWEEN @desde AND @hasta
  ORDER BY fecha, sucursal_canonico, sku;
`;

const PRECIOS_QUERY = `
  SELECT sku, nombre, sucursal,
         CONVERT(varchar(10), actualizado, 23) AS actualizado,
         precio, precio_neto
  FROM dbo.vw_PreciosProducto
  ORDER BY nombre, sucursal;
`;

// Cobros por día · sucursal · medio de pago (para contrastar contra Mercado Pago).
// Contrato de la vista dbo.vw_CobrosDiarios (la crea Sistemas para los cierres/Pablo):
//   FECHA, ID_SUCURSAL, MEDIO_PAGO, IMPORTE  -> se re-aliasan a claves JSON estables.
// IMPORTANTE (jul-2026): la vista ya EXISTE, pero el usuario read-only del bridge
// (cdp_lectura) todavía NO tiene permiso de lectura. Falta que Sistemas corra:
//   GRANT SELECT ON dbo.vw_CobrosDiarios TO cdp_lectura;
// Hasta eso, el endpoint responde 502 ("SELECT permission was denied").
const COBROS_QUERY = `
  SELECT
    CONVERT(varchar(10), FECHA, 23) AS fecha,
    ID_SUCURSAL AS id_sucursal,
    MEDIO_PAGO  AS medio_pago,
    IMPORTE     AS importe
  FROM dbo.vw_CobrosDiarios
  WHERE FECHA BETWEEN @desde AND @hasta
  ORDER BY FECHA, ID_SUCURSAL, MEDIO_PAGO;
`;

// Ventas por hora y por artículo (para la app de Pablo/cierres). Requieren las vistas
// dbo.vw_VentasPorHora y dbo.vw_VentasPorArticulo + permiso de lectura para cdp_lectura:
//   GRANT SELECT ON dbo.vw_VentasPorHora    TO cdp_lectura;
//   GRANT SELECT ON dbo.vw_VentasPorArticulo TO cdp_lectura;
// Hasta que existan + tengan permiso, estos endpoints responden 502.
const VENTAS_HORAS_QUERY = `
  SELECT CONVERT(varchar(10), FECHA, 23) AS fecha, ID_SUCURSAL AS id_sucursal,
         HORA AS hora, IMPORTE AS importe, TICKETS AS tickets
  FROM dbo.vw_VentasPorHora
  WHERE FECHA BETWEEN @desde AND @hasta
  ORDER BY FECHA, ID_SUCURSAL, HORA;
`;

const VENTAS_ARTICULOS_QUERY = `
  SELECT CONVERT(varchar(10), FECHA, 23) AS fecha, ID_SUCURSAL AS id_sucursal,
         COD_ARTICULO AS cod_articulo, DESCRIPCION AS descripcion, RUBRO AS rubro,
         CANTIDAD AS cantidad, IMPORTE AS importe
  FROM dbo.vw_VentasPorArticulo
  WHERE FECHA BETWEEN @desde AND @hasta
  ORDER BY FECHA, ID_SUCURSAL, COD_ARTICULO;
`;

// Receta de menú: qué INSUMO (y cuánto) consume cada ARTÍCULO DE VENTA. Es lo que
// el Cruce necesita para traducir ventas -> insumo. Requiere la vista dbo.vw_RecetasVenta
// (la crea Sistemas; ver docs/tango-bridge.md). Hasta que exista, responde 502.
// Columnas: sku_venta, nombre_venta, codigo_insumo, nombre_insumo, cantidad.
const RECETAS_QUERY = `
  SELECT sku_venta, nombre_venta, codigo_insumo, nombre_insumo, cantidad
  FROM dbo.vw_RecetasVenta
  ORDER BY sku_venta, codigo_insumo;
`;

// Maestro de sucursales tal como las nombra Tango (DESC_SUCURSAL). Sirve para que
// otras apps reconcilien su propio namespace (ej. store_id de Mercado Pago) por nombre.
// Nota: la vista NO expone ID_SUCURSAL (solo el nombre); el ID firme sale de vw_CobrosDiarios.
const SUCURSALES_QUERY = `
  SELECT sucursal_canonico AS sucursal,
         CONVERT(varchar(10), MAX(fecha), 23) AS ultima_venta
  FROM dbo.vw_VentasInsumoDiaria
  GROUP BY sucursal_canonico
  ORDER BY sucursal_canonico;
`;

let poolPromise = null;
const getPool = () => (poolPromise ??= new sql.ConnectionPool(config).connect());

const isFecha = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const json = (code, body) => {
    res.writeHead(code, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };

  if (url.pathname === "/health") return json(200, { ok: true });

  // Índice: lista los endpoints (sin datos, sin secreto) para que un consumidor los descubra.
  if (url.pathname === "/") return json(200, {
    ok: true,
    bridge: "tango-cdp",
    endpoints: [
      "GET /health",
      "GET /ventas?desde=AAAA-MM-DD&hasta=AAAA-MM-DD",
      "GET /precios",
      "GET /sucursales",
      "GET /recetas  (requiere vista vw_RecetasVenta)",
      "GET /cobros?desde=AAAA-MM-DD&hasta=AAAA-MM-DD  (requiere vista vw_CobrosDiarios)",
      "GET /ventas-horas?desde=AAAA-MM-DD&hasta=AAAA-MM-DD  (requiere vista vw_VentasPorHora)",
      "GET /ventas-articulos?desde=AAAA-MM-DD&hasta=AAAA-MM-DD  (requiere vista vw_VentasPorArticulo)",
    ],
    auth: "header x-bridge-secret (salvo /health y /)",
  });

  if (req.headers["x-bridge-secret"] !== SECRET) return json(401, { error: "no autorizado" });

  if (url.pathname === "/ventas") {
    const desde = url.searchParams.get("desde");
    const hasta = url.searchParams.get("hasta");
    if (!isFecha(desde) || !isFecha(hasta)) return json(400, { error: "desde/hasta AAAA-MM-DD requeridos" });
    try {
      const pool = await getPool();
      const consulta = (query) =>
        pool.request().input("desde", sql.Date, desde).input("hasta", sql.Date, hasta).query(query);
      // Vista con importe primero; si no existe (o falta permiso), cae a la de siempre.
      let r;
      try { r = await consulta(VENTAS_QUERY_PLATA); }
      catch (e2) { console.error("ventas (plata) no disponible, uso unidades:", e2.message); r = await consulta(VENTAS_QUERY); }
      return json(200, r.recordset);
    } catch (e) {
      console.error("ventas error:", e.message);
      return json(502, { error: e.message });
    }
  }

  if (url.pathname === "/precios") {
    try {
      const pool = await getPool();
      const r = await pool.request().query(PRECIOS_QUERY);
      return json(200, r.recordset);
    } catch (e) {
      console.error("precios error:", e.message);
      return json(502, { error: e.message });
    }
  }

  if (url.pathname === "/sucursales") {
    try {
      const pool = await getPool();
      const r = await pool.request().query(SUCURSALES_QUERY);
      return json(200, r.recordset);
    } catch (e) {
      console.error("sucursales error:", e.message);
      return json(502, { error: e.message });
    }
  }

  if (url.pathname === "/recetas") {
    try {
      const pool = await getPool();
      const r = await pool.request().query(RECETAS_QUERY);
      return json(200, r.recordset);
    } catch (e) {
      // 502 con "Invalid object name" hasta que exista dbo.vw_RecetasVenta.
      console.error("recetas error:", e.message);
      return json(502, { error: e.message });
    }
  }

  if (url.pathname === "/cobros") {
    const desde = url.searchParams.get("desde");
    const hasta = url.searchParams.get("hasta");
    if (!isFecha(desde) || !isFecha(hasta)) return json(400, { error: "desde/hasta AAAA-MM-DD requeridos" });
    try {
      const pool = await getPool();
      const r = await pool.request().input("desde", sql.Date, desde).input("hasta", sql.Date, hasta).query(COBROS_QUERY);
      return json(200, r.recordset);
    } catch (e) {
      // Mientras no exista dbo.vw_CobrosDiarios, cae acá (502) con "Invalid object name".
      console.error("cobros error:", e.message);
      return json(502, { error: e.message });
    }
  }

  if (url.pathname === "/ventas-horas") {
    const desde = url.searchParams.get("desde");
    const hasta = url.searchParams.get("hasta");
    if (!isFecha(desde) || !isFecha(hasta)) return json(400, { error: "desde/hasta AAAA-MM-DD requeridos" });
    try {
      const pool = await getPool();
      const r = await pool.request().input("desde", sql.Date, desde).input("hasta", sql.Date, hasta).query(VENTAS_HORAS_QUERY);
      return json(200, r.recordset);
    } catch (e) {
      console.error("ventas-horas error:", e.message);
      return json(502, { error: e.message });
    }
  }

  if (url.pathname === "/ventas-articulos") {
    const desde = url.searchParams.get("desde");
    const hasta = url.searchParams.get("hasta");
    if (!isFecha(desde) || !isFecha(hasta)) return json(400, { error: "desde/hasta AAAA-MM-DD requeridos" });
    try {
      const pool = await getPool();
      const r = await pool.request().input("desde", sql.Date, desde).input("hasta", sql.Date, hasta).query(VENTAS_ARTICULOS_QUERY);
      return json(200, r.recordset);
    } catch (e) {
      console.error("ventas-articulos error:", e.message);
      return json(502, { error: e.message });
    }
  }

  return json(404, { error: "ruta no encontrada" });
});

server.listen(PORT, () => {
  console.log(`✓ Tango bridge escuchando en http://localhost:${PORT}`);
  console.log(`  GET /ventas?desde&hasta  ·  GET /precios  ·  GET /cobros?desde&hasta   (header x-bridge-secret)`);
  console.log(`  Publicalo con:  cloudflared tunnel --url http://localhost:${PORT}`);
});
