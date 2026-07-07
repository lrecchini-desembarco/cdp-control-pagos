// Watchdog del túnel del bridge de Tango.
//
// Mantiene un quick tunnel de Cloudflare apuntando al bridge (localhost:8787) y
// cada vez que levanta uno nuevo publica la URL en el locator del dashboard
// (/api/bridge-url). El dashboard lee esa URL del KV, así prod nunca se cae por
// la URL que cambia ni por el tope de tráfico de un plan gratis, y no hay que
// tocar Vercel jamás. Si el túnel se cae, lo vuelve a crear y republica solo.
//
// Autostart: scripts/iniciar-tunel-bridge.vbs (carpeta de Inicio de Windows).
// Necesita en .env.local:
//   TUNEL_BRIDGE_LOCATOR   p.ej. https://cdp-control-pagos.vercel.app/api/bridge-url
//   TUNEL_ADMIN_SECRETO    mismo valor que la env de Vercel del dashboard

import { spawn } from "node:child_process";
import { readFileSync, existsSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const LOG = path.join(ROOT, "tunnel-bridge.log");
const PUERTO = 8787;

// Ruta completa de cloudflared (para que ande también sin sesión iniciada, donde
// el PATH del usuario puede no estar). Cae a "cloudflared" (PATH) si no la encuentra.
const CF_FULL = path.join(os.homedir(), "AppData", "Local", "Microsoft", "WinGet", "Links", "cloudflared.exe");
const CLOUDFLARED = existsSync(CF_FULL) ? CF_FULL : "cloudflared";

const env = {};
try {
  for (const line of readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
    const i = line.indexOf("=");
    if (i > 0 && !line.trim().startsWith("#")) env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
} catch {}
const LOCATOR = env.TUNEL_BRIDGE_LOCATOR;
const SECRETO = env.TUNEL_ADMIN_SECRETO;
if (!LOCATOR || !SECRETO) {
  console.error("Faltan TUNEL_BRIDGE_LOCATOR / TUNEL_ADMIN_SECRETO en .env.local");
  process.exit(1);
}

const ts = () => new Date().toISOString();
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function urlDelLog(esperaMax = 60000) {
  const t0 = Date.now();
  while (Date.now() - t0 < esperaMax) {
    if (existsSync(LOG)) {
      const m = readFileSync(LOG, "utf8").match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (m) return m[0];
    }
    await dormir(1000);
  }
  return null;
}

async function publicar(url) {
  for (let intento = 1; intento <= 5; intento++) {
    try {
      const res = await fetch(LOCATOR, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-tunel-secreto": SECRETO },
        body: JSON.stringify({ url }),
      });
      if (res.ok) return true;
      console.error(`${ts()} locator respondió ${res.status}`);
    } catch (e) {
      console.error(`${ts()} error publicando: ${e}`);
    }
    await dormir(5000 * intento);
  }
  return false;
}

// eslint-disable-next-line no-constant-condition
while (true) {
  try { rmSync(LOG, { force: true }); } catch { /* en uso */ }
  console.log(`${ts()} levantando túnel hacia http://localhost:${PUERTO}…`);
  const p = spawn(
    CLOUDFLARED,
    ["tunnel", "--protocol", "http2", "--url", `http://localhost:${PUERTO}`, "--logfile", LOG],
    { stdio: "ignore", shell: false }
  );
  const fin = new Promise((r) => { p.on("close", r); p.on("error", r); });

  const url = await urlDelLog();
  if (url) {
    console.log(`${ts()} túnel arriba: ${url}`);
    const ok = await publicar(url);
    console.log(`${ts()} locator ${ok ? "actualizado" : "NO actualizado (seguirá el túnel igual)"}`);
  } else {
    console.error(`${ts()} el túnel no publicó URL en 60s, lo reinicio`);
    p.kill();
  }

  await fin;
  console.error(`${ts()} túnel caído — reintento en 10s`);
  await dormir(10000);
}
