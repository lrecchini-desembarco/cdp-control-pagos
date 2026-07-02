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
// Requiere la vista dbo.vw_CobrosDiarios (la crea Sistemas; ver docs/tango-bridge.md).
// Hasta que exista, este endpoint responde 502 (por eso queda "listo/plug-and-play").
// La vista debe exponer: fecha DATE, id_sucursal, sucursal (DESC_SUCURSAL),
// medio_pago, importe. (Ideal: una fila por cobro con hora + comprobante.)
const COBROS_QUERY = `
  SELECT
    CONVERT(varchar(10), fecha, 23) AS fecha,
    id_sucursal, sucursal, medio_pago, importe
  FROM dbo.vw_CobrosDiarios
  WHERE fecha BETWEEN @desde AND @hasta
  ORDER BY fecha, id_sucursal, medio_pago;
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

  if (req.headers["x-bridge-secret"] !== SECRET) return json(401, { error: "no autorizado" });

  if (url.pathname === "/ventas") {
    const desde = url.searchParams.get("desde");
    const hasta = url.searchParams.get("hasta");
    if (!isFecha(desde) || !isFecha(hasta)) return json(400, { error: "desde/hasta AAAA-MM-DD requeridos" });
    try {
      const pool = await getPool();
      const r = await pool.request().input("desde", sql.Date, desde).input("hasta", sql.Date, hasta).query(VENTAS_QUERY);
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

  return json(404, { error: "ruta no encontrada" });
});

server.listen(PORT, () => {
  console.log(`✓ Tango bridge escuchando en http://localhost:${PORT}`);
  console.log(`  GET /ventas?desde&hasta  ·  GET /precios  ·  GET /cobros?desde&hasta   (header x-bridge-secret)`);
  console.log(`  Publicalo con:  cloudflared tunnel --url http://localhost:${PORT}`);
});
