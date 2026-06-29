/**
 * Prueba de conexión a Tango. Valida credenciales + que las vistas devuelvan
 * datos, ANTES de prender la app en modo live.
 *
 * Uso:
 *   1) Completá .env.local con las variables TANGO_DB_* (ver .env.example).
 *   2) node scripts/test-tango.mjs
 */
import { createRequire } from "module";
import { readFileSync } from "fs";

const require = createRequire(import.meta.url);

// Carga simple de .env.local (no depende de Next).
try {
  const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {}

const need = ["TANGO_DB_HOST", "TANGO_DB_NAME", "TANGO_DB_USER", "TANGO_DB_PASSWORD"];
const faltan = need.filter((k) => !process.env[k]);
if (faltan.length) {
  console.error("✗ Faltan variables en .env.local:", faltan.join(", "));
  process.exit(1);
}

let sql;
try {
  sql = require("mssql");
} catch {
  console.error("✗ Falta el paquete 'mssql'. Corré: npm install");
  process.exit(1);
}

const config = {
  server: process.env.TANGO_DB_HOST,
  port: Number(process.env.TANGO_DB_PORT ?? 1433),
  database: process.env.TANGO_DB_NAME,
  user: process.env.TANGO_DB_USER,
  password: process.env.TANGO_DB_PASSWORD,
  options: {
    encrypt: process.env.TANGO_DB_ENCRYPT === "true",
    trustServerCertificate: process.env.TANGO_DB_TRUST_CERT === "true",
  },
  connectionTimeout: 8000,
  requestTimeout: 15000,
};

console.log(`→ Conectando a ${config.server}:${config.port} / ${config.database} como ${config.user}…`);

try {
  const pool = await new sql.ConnectionPool(config).connect();
  console.log("✓ Conexión OK\n");

  // Ventas por turno
  try {
    const v = await pool.request().query(`
      SELECT TOP 5 fecha, sucursal_canonico, sku, turno, unidades
      FROM dbo.vw_VentasInsumoDiaria ORDER BY fecha DESC;
    `);
    console.log(`✓ vw_VentasInsumoDiaria responde (${v.recordset.length} filas de muestra):`);
    console.table(v.recordset);
    const t = await pool.request().query(`
      SELECT turno, COUNT(*) AS filas, SUM(unidades) AS unidades
      FROM dbo.vw_VentasInsumoDiaria GROUP BY turno;
    `);
    console.log("✓ Desglose por turno:");
    console.table(t.recordset);
    const cols = Object.keys(v.recordset[0] ?? {});
    const faltanCols = ["fecha", "sucursal_canonico", "sku", "turno", "unidades"].filter((c) => !cols.includes(c));
    if (v.recordset.length && faltanCols.length) console.log("⚠ Faltan columnas esperadas:", faltanCols.join(", "));
  } catch (e) {
    console.error("✗ vw_VentasInsumoDiaria falló:", e.message);
  }

  // Catálogo (opcional)
  try {
    const c = await pool.request().query("SELECT TOP 3 sku, nombre, marca, activo FROM dbo.vw_ArticulosCatalogo;");
    console.log(`\n✓ vw_ArticulosCatalogo responde (${c.recordset.length} filas de muestra):`);
    console.table(c.recordset);
  } catch (e) {
    console.error("\n⚠ vw_ArticulosCatalogo falló (opcional para Ventas por turno):", e.message);
  }

  await pool.close();
  console.log("\n✓ Listo. Si las vistas devolvieron datos, poné DATA_SOURCE=live y la app usa Tango real.");
  process.exit(0);
} catch (e) {
  console.error("✗ No se pudo conectar:", e.message);
  console.error("  Revisá: host/puerto, que la app llegue al SQL Server (red/VPN), usuario/clave, y encrypt/trust.");
  process.exit(1);
}
