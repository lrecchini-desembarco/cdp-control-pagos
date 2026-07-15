// Push de Tango a KV (sin túnel). Corre en la PC de carga: lee ventas y precios
// del bridge local (localhost:8787) y los EMPUJA al dashboard por HTTPS saliente
// (/api/tango-push, mismo secreto que el locator). El dashboard los lee del KV.
// Así prod no depende de ningún túnel de entrada.
//
// Autostart sugerido: tarea S4U que lo relance (igual que el watchdog del túnel).
// Necesita en .env.local: TUNEL_ADMIN_SECRETO y TUNEL_BRIDGE_LOCATOR.

import { readFileSync, appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import path from "node:path";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const LOG = path.join(ROOT, "tango-push.log");
const log = (m) => { try { appendFileSync(LOG, `${new Date().toISOString()} [pid ${process.pid}] ${m}\n`); } catch {} };
log(`arranco (cwd=${process.cwd()})`);
process.on("uncaughtException", (e) => { log(`uncaught: ${e?.stack || e}`); });
process.on("unhandledRejection", (e) => { log(`unhandled: ${e}`); });
const env = {};
try {
  for (const line of readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
    const i = line.indexOf("=");
    if (i > 0 && !line.trim().startsWith("#")) env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
} catch {}

const SECRETO = env.TUNEL_ADMIN_SECRETO;
const LOCATOR = env.TUNEL_BRIDGE_LOCATOR; // .../api/bridge-url
const PUSH_URL = LOCATOR ? LOCATOR.replace(/\/bridge-url\/?$/, "/tango-push") : null;
const BRIDGE = "http://localhost:8787";
const BRIDGE_SECRET = env.TANGO_BRIDGE_SECRET || "cdp-bridge-2026-secreto-largo-xyz";
const DIAS = 32;                    // ventana completa (cubre rangos de hasta ~1 mes)
const INTERVALO_MS = 10 * 60 * 1000;

if (!SECRETO || !PUSH_URL) {
  log(`FALTA config: SECRETO=${Boolean(SECRETO)} PUSH_URL=${PUSH_URL || "?"} · .env.local en ${ROOT}`);
  process.exit(1);
}

const ts = () => new Date().toISOString();
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const pack = (obj) => gzipSync(Buffer.from(JSON.stringify(obj), "utf8")).toString("base64");

async function bridgeGet(p) {
  const r = await fetch(`${BRIDGE}${p}`, { headers: { "x-bridge-secret": BRIDGE_SECRET } });
  if (!r.ok) throw new Error(`bridge ${p} -> ${r.status}`);
  return r.json();
}
async function push(body) {
  const r = await fetch(PUSH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-tunel-secreto": SECRETO },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`push ${body.tipo}${body.dia ? " " + body.dia : ""} -> ${r.status}`);
}

// --- Fallback SQL directo: si el bridge local no responde (túnel/bridge caído),
// consultamos Tango directo (la PC de carga llega a SRVTANGO). Así el push NUNCA
// depende del bridge ni del túnel. Requiere TANGO_DB_* en .env.local + paquete mssql.
let poolPromise = null;
async function getPool() {
  const { default: sql } = await import("mssql");
  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool({
      server: env.TANGO_DB_HOST,
      port: Number(env.TANGO_DB_PORT || 1433),
      database: env.TANGO_DB_NAME, user: env.TANGO_DB_USER, password: env.TANGO_DB_PASSWORD,
      options: { encrypt: env.TANGO_DB_ENCRYPT === "true", trustServerCertificate: env.TANGO_DB_TRUST_CERT !== "false" },
      connectionTimeout: 10000, requestTimeout: 180000,
    }).connect();
  }
  return poolPromise;
}
const SQL_Q = {
  ventas: `SELECT CONVERT(varchar(10),fecha,23) fecha, sucursal_canonico, sku, nombre, turno, unidades, importe FROM dbo.vw_VentasArticuloDiaria WHERE fecha BETWEEN @desde AND @hasta`,
  precios: `SELECT sku, nombre, sucursal, CONVERT(varchar(10),actualizado,23) actualizado, precio, precio_neto FROM dbo.vw_PreciosProducto`,
  cobros: `SELECT CONVERT(varchar(10),FECHA,23) fecha, ID_SUCURSAL id_sucursal, MEDIO_PAGO medio_pago, IMPORTE importe FROM dbo.vw_CobrosDiarios WHERE FECHA BETWEEN @desde AND @hasta`,
  horas: `SELECT CONVERT(varchar(10),FECHA,23) fecha, ID_SUCURSAL id_sucursal, HORA hora, IMPORTE importe, TICKETS tickets FROM dbo.vw_VentasPorHora WHERE FECHA BETWEEN @desde AND @hasta`,
  mozos: `SELECT CONVERT(varchar(10),fecha,23) fecha, id_sucursal, mozo, tickets, importe, comensales FROM dbo.vw_VentasPorMozo WHERE fecha BETWEEN @desde AND @hasta`,
  anulados: `SELECT CONVERT(varchar(10),fecha,23) fecha, id_sucursal, tipo, hora, responsable, autoriza, sku, producto, cantidad, importe, n FROM dbo.vw_Anulados WHERE fecha BETWEEN @desde AND @hasta`,
  sucursales: `SELECT ID_SUCURSAL id, DESC_SUCURSAL nombre FROM dbo.vw_Sucursales`,
  recetas: `SELECT COD_ARTICU sku, NOM_ARTICU nombre, COD_INSUMO insumoCod, NOM_INSUMO insumoDesc, CANTIDAD cant, CLASIF_INSUMO clasif FROM dbo.V_QS_Recetas_Insumo_Final`,
  franquicias: `SELECT clienteId, cliente, CONVERT(varchar(10),vencimiento,23) vencimiento, CONVERT(varchar(10),emision,23) emision, tipo, nro, importe, cobrado, empresa, local, detalle FROM dbo.vw_FranquiciasCtaCte`,
};
async function sqlQuery(kind, desde, hasta) {
  const { default: sql } = await import("mssql");
  const pool = await getPool();
  const req = pool.request();
  if (desde) req.input("desde", sql.Date, desde);
  if (hasta) req.input("hasta", sql.Date, hasta);
  return (await req.query(SQL_Q[kind])).recordset;
}
// Trae del bridge; si el bridge falla y hay Tango configurado, cae a SQL directo.
async function traer(kind, bridgePath, desde, hasta) {
  try { return await bridgeGet(bridgePath); }
  catch (e) {
    if (!env.TANGO_DB_HOST) throw e;
    log(`bridge ${bridgePath} falló (${e.message}); voy por SQL directo`);
    return await sqlQuery(kind, desde, hasta);
  }
}
function ultimosDias(n) {
  const out = [];
  const hoy = new Date();
  for (let i = 0; i < n; i++) {
    const x = new Date(hoy);
    x.setDate(hoy.getDate() - i);
    out.push(x.toISOString().slice(0, 10));
  }
  return out.reverse();
}

let ciclos = 0;
async function ciclo() {
  // Cada ~1h empuja la ventana completa; el resto, solo los 2 últimos días (los que cambian).
  const full = ciclos % 6 === 0;
  const dias = ultimosDias(full ? DIAS : 2);
  const desde = dias[0], hasta = dias[dias.length - 1];

  const agrupar = (rows) => { const m = {}; for (const d of dias) m[d] = []; for (const r of rows) (m[String(r.fecha)] ||= []).push(r); return m; };

  const ventas = await traer("ventas", `/ventas?desde=${desde}&hasta=${hasta}`, desde, hasta);
  { const pd = agrupar(ventas); for (const dia of dias) await push({ tipo: "ventas", dia, data: pack(pd[dia] || []) }); }

  const precios = await traer("precios", `/precios`);
  await push({ tipo: "precios", data: pack(precios) });

  // Mapa ID_SUCURSAL -> nombre (para Cobros/Horas por local). Tolerante.
  try {
    const sucs = await traer("sucursales", `/sucursales-map`);
    await push({ tipo: "sucursales", data: pack(sucs) });
  } catch (e) { log(`sucursales no empujadas: ${e instanceof Error ? e.message : e}`); }

  // Cobros (medios de pago) y ventas-por-hora: mismo esquema por-día. Tolerante:
  // si una vista falla, no rompe el push de ventas/precios.
  let nCobros = 0, nHoras = 0;
  try {
    const cobros = await traer("cobros", `/cobros?desde=${desde}&hasta=${hasta}`, desde, hasta);
    const pd = agrupar(cobros); for (const dia of dias) await push({ tipo: "cobros", dia, data: pack(pd[dia] || []) });
    nCobros = cobros.length;
  } catch (e) { log(`cobros no empujados: ${e instanceof Error ? e.message : e}`); }
  try {
    const horas = await traer("horas", `/ventas-horas?desde=${desde}&hasta=${hasta}`, desde, hasta);
    const pd = agrupar(horas); for (const dia of dias) await push({ tipo: "horas", dia, data: pack(pd[dia] || []) });
    nHoras = horas.length;
  } catch (e) { log(`horas no empujadas: ${e instanceof Error ? e.message : e}`); }
  let nMozos = 0, nAnul = 0;
  try {
    const mozos = await traer("mozos", `/mozos?desde=${desde}&hasta=${hasta}`, desde, hasta);
    const pd = agrupar(mozos); for (const dia of dias) await push({ tipo: "mozos", dia, data: pack(pd[dia] || []) });
    nMozos = mozos.length;
  } catch (e) { log(`mozos no empujados: ${e instanceof Error ? e.message : e}`); }
  try {
    const anul = await traer("anulados", `/anulados?desde=${desde}&hasta=${hasta}`, desde, hasta);
    const pd = agrupar(anul); for (const dia of dias) await push({ tipo: "anulados", dia, data: pack(pd[dia] || []) });
    nAnul = anul.length;
  } catch (e) { log(`anulados no empujados: ${e instanceof Error ? e.message : e}`); }

  // Recetario de Tango (snapshot; cambia poco) -> solo en ciclos completos (~1h).
  let nRec = 0;
  if (full) {
    try {
      const recetas = await traer("recetas", `/recetas`);
      await push({ tipo: "recetas", data: pack(recetas) });
      nRec = recetas.length;
    } catch (e) { log(`recetas no empujadas: ${e instanceof Error ? e.message : e}`); }
  }

  // Cta cte de FRANQUICIAS (snapshot; estado de cuenta) -> solo en ciclos completos.
  // Tolerante: hasta que exista la vista dbo.vw_FranquiciasCtaCte, el bridge/SQL da
  // error y NO se empuja (la app sigue con el Excel subido a mano). Ver docs/sql.
  let nFranq = 0;
  if (full) {
    try {
      const franq = await traer("franquicias", `/franquicias`);
      await push({ tipo: "franquicias", data: pack(franq) });
      nFranq = franq.length;
    } catch (e) { log(`franquicias no empujadas (¿falta la vista/grant?): ${e instanceof Error ? e.message : e}`); }
  }

  await push({ tipo: "fresh", dias: ultimosDias(DIAS) });

  log(`push OK ${full ? "(completo)" : "(2 días)"}: ${ventas.length} ventas + ${precios.length} precios + ${nCobros} cobros + ${nHoras} horas + ${nMozos} mozos + ${nAnul} anulados + ${nRec} recetas + ${nFranq} franquicias`);
  ciclos++;
}

log(`tango-push -> ${PUSH_URL} cada ${INTERVALO_MS / 60000} min (ventana ${DIAS} días)`);
// eslint-disable-next-line no-constant-condition
while (true) {
  try { await ciclo(); } catch (e) { log(`error en push: ${e instanceof Error ? e.message : e}`); }
  await dormir(INTERVALO_MS);
}
