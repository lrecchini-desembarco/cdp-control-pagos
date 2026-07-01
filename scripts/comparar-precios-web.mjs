// Compara los precios del MENÚ WEB (WordPress/Elementor) contra el precio vigente
// de Tango (/api/precios general). Uso: node scripts/comparar-precios-web.mjs
// (con el dev corriendo en localhost:3000 y PRECIOS_SOURCE=live).

const BASE = process.env.APP_URL || "http://localhost:3000";
const MENUS = [
  { marca: "El Desembarco", url: "https://eldesembarco.com/menu/" },
  { marca: "Mr. Tasty", url: "https://mrtasty.com.ar/menu-amba/" },
];

const decode = (t) =>
  t.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#8217;/g, "'").replace(/&nbsp;/g, " ").trim();
const esPrecio = (t) => /^\$\s?[\d][\d.,]*$/.test(t.replace(/\s/g, ""));
const num = (t) => Number(String(t).replace(/[^\d]/g, "")) || 0;
const norm = (t) =>
  (t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const PROMO = /\b(COMBO|DAY|NOCHE|2X1|2X|3X|PROMO|X2|X3|BALDE|MENU|MEGA|HH|LIBRE)\b/;

function extraerMenu(html) {
  // El nombre puede venir en <div> (Desembarco) o <p> (Tasty); el precio en <div>.
  const heads = [...html.matchAll(/elementor-heading-title[^>]*>([^<]+)<\/(?:div|p)>/g)].map((m) => decode(m[1])).filter(Boolean);
  const out = [];
  for (let i = 0; i < heads.length; i++) {
    if (!esPrecio(heads[i])) continue;
    let j = i - 1;
    while (j >= 0 && esPrecio(heads[j])) j--;
    if (j >= 0 && heads[j].length > 2) out.push({ nombre: heads[j], precio: num(heads[i]) });
  }
  // dedup por nombre (primer precio)
  const seen = new Set();
  return out.filter((p) => (seen.has(norm(p.nombre)) ? false : seen.add(norm(p.nombre))));
}

async function tangoGeneral() {
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "lrecchini@eldesembarco.com", password: "cdp2026" }),
  });
  const ck = (login.headers.get("set-cookie") || "").split(";")[0];
  const r = await fetch(`${BASE}/api/precios`, { headers: { cookie: ck } });
  const j = await r.json();
  if (!j.ok) throw new Error("api/precios: " + (j.error || "sin ok"));
  return { general: j.general || [], source: j.source };
}

// mejor match en Tango para un nombre web: exacto normalizado > contiene, prefiere el "simple"
function matchTango(web, general) {
  const w = norm(web);
  const exact = general.filter((g) => norm(g.nombre) === w);
  if (exact.length) return exact.sort((a, b) => a.nombre.length - b.nombre.length)[0];
  const cont = general
    .filter((g) => norm(g.nombre).includes(w) && w.length >= 4)
    .sort((a, b) => (PROMO.test(norm(a.nombre)) - PROMO.test(norm(b.nombre))) || a.nombre.length - b.nombre.length);
  return cont[0] || null;
}

const money = (n) => "$" + Math.round(n).toLocaleString("es-AR");

(async () => {
  const { general, source } = await tangoGeneral();
  console.log(`Tango: ${general.length} productos (source=${source})\n`);

  for (const menu of MENUS) {
    const html = await (await fetch(menu.url)).text();
    const web = extraerMenu(html);
    console.log(`\n================ ${menu.marca} — ${menu.url}`);
    console.log(`Productos en la web: ${web.length}`);
    const rows = web.map((p) => {
      const t = matchTango(p.nombre, general);
      const diff = t ? Math.round(((t.precio - p.precio) / p.precio) * 100) : null;
      return { ...p, tango: t?.precio ?? null, tnombre: t?.nombre ?? null, diff };
    });
    const matched = rows.filter((r) => r.tango != null);
    const iguales = matched.filter((r) => Math.abs(r.diff) <= 5).length;
    console.log(`Matchean con Tango: ${matched.length}/${web.length}  ·  ≈iguales (±5%): ${iguales}\n`);
    console.log("  " + "PRODUCTO".padEnd(26) + "WEB".padEnd(11) + "TANGO".padEnd(11) + "DIF");
    for (const r of matched.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)).slice(0, 25)) {
      const flag = Math.abs(r.diff) <= 5 ? "ok" : Math.abs(r.diff) <= 20 ? "~" : "‼";
      console.log(
        "  " + r.nombre.slice(0, 25).padEnd(26) + money(r.precio).padEnd(11) + money(r.tango).padEnd(11) + `${r.diff > 0 ? "+" : ""}${r.diff}% ${flag}  [${r.tnombre?.slice(0, 22)}]`
      );
    }
    const noMatch = rows.filter((r) => r.tango == null).map((r) => r.nombre);
    if (noMatch.length) console.log(`\n  Sin match en Tango (${noMatch.length}): ${noMatch.slice(0, 12).join(" · ")}`);
  }
})().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
