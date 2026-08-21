// Compara el MENÚ WEB (lista) contra el precio efectivo de Tango, por consola.
// Usa el mismo módulo que la app (lib/menu-web.ts).
// Uso: node --experimental-strip-types scripts/comparar-precios-web.mjs
//   (con el dev en localhost:3000 y PRECIOS_SOURCE=live)
import { scrapearMenus, comparar, MENUS_WEB } from "../lib/menu-web.ts";

const BASE = process.env.APP_URL || "http://localhost:3000";
const money = (n) => "$" + Math.round(n).toLocaleString("es-AR");

async function tangoGeneral() {
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: process.env.CDP_EMAIL ?? "", password: process.env.APP_PASSWORD ?? "" }),
  });
  const ck = (login.headers.get("set-cookie") || "").split(";")[0];
  const j = await (await fetch(`${BASE}/api/precios`, { headers: { cookie: ck } })).json();
  if (!j.ok) throw new Error("api/precios: " + (j.error || "sin ok"));
  return { general: j.general || [], source: j.source };
}

(async () => {
  const { general, source } = await tangoGeneral();
  const web = await scrapearMenus();
  const filas = comparar(web, general);
  console.log(`Tango: ${general.length} productos (source=${source}) · Web: ${web.length} productos\n`);

  for (const { marca } of MENUS_WEB) {
    const rows = filas.filter((f) => f.marca === marca);
    const con = rows.filter((r) => r.precioTango != null);
    const ok = con.filter((r) => r.estado === "ok").length;
    console.log(`\n===== ${marca} — ${rows.length} web · ${con.length} match · ${ok} ≈ok`);
    console.log("  " + "PRODUCTO".padEnd(26) + "WEB".padEnd(11) + "TANGO".padEnd(11) + "DIF");
    for (const r of con.sort((a, b) => Math.abs(b.diffPct) - Math.abs(a.diffPct)).slice(0, 25)) {
      const flag = r.estado === "ok" ? "ok" : r.estado === "dif" ? "~" : "‼";
      console.log(
        "  " + r.nombre.slice(0, 25).padEnd(26) + money(r.precioWeb).padEnd(11) + money(r.precioTango).padEnd(11) +
          `${r.diffPct > 0 ? "+" : ""}${r.diffPct}% ${flag}  [${(r.tangoNombre || "").slice(0, 22)}]`
      );
    }
    const nm = rows.filter((r) => r.precioTango == null).map((r) => r.nombre);
    if (nm.length) console.log(`  Sin match (${nm.length}): ${nm.slice(0, 10).join(" · ")}`);
  }
})().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
