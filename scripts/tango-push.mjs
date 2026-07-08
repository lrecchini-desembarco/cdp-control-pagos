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

  const ventas = await bridgeGet(`/ventas?desde=${desde}&hasta=${hasta}`);
  const porDia = {};
  for (const d of dias) porDia[d] = [];
  for (const v of ventas) (porDia[String(v.fecha)] ||= []).push(v);
  for (const dia of dias) await push({ tipo: "ventas", dia, data: pack(porDia[dia] || []) });

  const precios = await bridgeGet(`/precios`);
  await push({ tipo: "precios", data: pack(precios) });
  await push({ tipo: "fresh", dias: ultimosDias(DIAS) });

  log(`push OK ${full ? "(completo)" : "(2 días)"}: ${ventas.length} filas ventas + ${precios.length} precios`);
  ciclos++;
}

log(`tango-push -> ${PUSH_URL} cada ${INTERVALO_MS / 60000} min (ventana ${DIAS} días)`);
// eslint-disable-next-line no-constant-condition
while (true) {
  try { await ciclo(); } catch (e) { log(`error en push: ${e instanceof Error ? e.message : e}`); }
  await dormir(INTERVALO_MS);
}
