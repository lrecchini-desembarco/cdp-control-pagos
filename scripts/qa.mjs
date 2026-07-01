// QA rápido de rutas/navegación. Detecta la clase de bug que da "404 This page
// could not be found": una ruta en el menú (Sidebar/roles) sin su page.tsx, o
// inconsistencias entre Sidebar, roles y las páginas reales de app/.
//
// Uso: node scripts/qa.mjs   (o npm run qa). Sale con código !=0 si hay problemas.
import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const rel = (p) => join(ROOT, p);
let problemas = 0;
const fail = (m) => { problemas++; console.log("  ✗ " + m); };
const ok = (m) => console.log("  ✓ " + m);

// 1) Catálogo de nav (NAV_CATALOG en roles.ts) y nav por rol (ROLES)
const roles = readFileSync(rel("lib/roles.ts"), "utf8");
const catalogo = roles.slice(roles.indexOf("NAV_CATALOG"));
const navHrefs = [...catalogo.matchAll(/href:\s*"([^"]+)"/g)].map((m) => m[1]);

const rolesNav = [...roles.matchAll(/nav:\s*\[([^\]]+)\]/g)]
  .flatMap((m) => [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]));
const rutasRoles = [...new Set(rolesNav)];

// 2) Páginas reales bajo app/ (carpetas con page.tsx)
function paginasApp(dir = rel("app"), base = "") {
  const out = [];
  for (const e of readdirSync(dir)) {
    const full = join(dir, e);
    if (!statSync(full).isDirectory()) continue;
    if (e.startsWith("(") || e === "api") continue; // grupos y api no son rutas de página
    const ruta = base + "/" + e;
    if (existsSync(join(full, "page.tsx"))) out.push(ruta);
    out.push(...paginasApp(full, ruta));
  }
  return out;
}
const paginas = new Set(paginasApp());
if (existsSync(rel("app/page.tsx"))) paginas.add("/");

console.log("== Rutas del catálogo (NAV_CATALOG) tienen su página ==");
for (const href of navHrefs) {
  const pagPath = href === "/" ? "app/page.tsx" : `app${href}/page.tsx`;
  if (existsSync(rel(pagPath))) ok(`${href}`);
  else fail(`${href} está en el catálogo pero NO existe ${pagPath} → daría 404`);
}

console.log("\n== Rutas de roles (lib/roles.ts) están en el catálogo ==");
for (const r of rutasRoles) {
  if (r === "/guia" || navHrefs.includes(r)) ok(`${r}`);
  else fail(`${r} está en roles pero no en NAV_CATALOG (no se vería / inconsistente)`);
}

console.log("\n== Páginas de app/ que NO están en el menú (info) ==");
const sinNav = [...paginas].filter((p) => !navHrefs.includes(p) && !["/login", "/review"].includes(p));
if (sinNav.length) console.log("  (ok si son públicas/intencionales): " + sinNav.join(", "));
else console.log("  ninguna");

console.log(`\n${problemas === 0 ? "✓ QA de rutas OK" : "✗ " + problemas + " problema(s)"} — recordá también: npx tsc --noEmit && npm run build`);
process.exit(problemas ? 1 : 0);
