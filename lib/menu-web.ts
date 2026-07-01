// Scraper del menú web (WordPress/Elementor) + comparación contra Tango.
// Puro (fetch + parse + match), sin deps de la app, para que lo usen tanto el
// endpoint /api/precios/comparar como el script scripts/comparar-precios-web.mjs.

export interface WebProducto {
  marca: string;
  nombre: string;
  precio: number; // PVP de lista (con impuestos) que figura en la web
}

export interface Comparacion {
  marca: string;
  nombre: string; // nombre en la web
  precioWeb: number;
  precioTango: number | null;
  tangoNombre: string | null;
  tangoActualizado: string | null; // última venta del match en Tango (para el tag activo/inactivo)
  diffPct: number | null; // (tango - web) / web
  estado: "ok" | "dif" | "alerta" | "nomatch";
}

// Menús a scrapear (editable). La web = precio de lista al público.
export const MENUS_WEB: { marca: string; url: string }[] = [
  { marca: "El Desembarco", url: "https://eldesembarco.com/menu/" },
  { marca: "Mr. Tasty", url: "https://mrtasty.com.ar/menu-amba/" },
];

const decode = (t: string) =>
  t.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#8217;/g, "'").replace(/&nbsp;/g, " ").trim();
const esPrecio = (t: string) => /^\$\s?[\d][\d.,]*$/.test(t.replace(/\s/g, ""));
const num = (t: string) => Number(String(t).replace(/[^\d]/g, "")) || 0;
export const norm = (t: string) =>
  (t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const PROMO = /\b(COMBO|DAY|NOCHE|2X1|2X|3X|PROMO|X2|X3|BALDE|MENU|MEGA|HH|LIBRE|BOX|ADICIONAL|EXTRA)\b/;

// Extrae {nombre, precio} de un menú Elementor (nombre en <div>/<p>, precio en <div>).
export function extraerMenu(html: string, marca: string): WebProducto[] {
  const heads = Array.from(html.matchAll(/elementor-heading-title[^>]*>([^<]+)<\/(?:div|p)>/g))
    .map((m) => decode(m[1]))
    .filter(Boolean);
  const out: WebProducto[] = [];
  for (let i = 0; i < heads.length; i++) {
    if (!esPrecio(heads[i])) continue;
    let j = i - 1;
    while (j >= 0 && esPrecio(heads[j])) j--;
    if (j >= 0 && heads[j].length > 2) out.push({ marca, nombre: heads[j], precio: num(heads[i]) });
  }
  const seen = new Set<string>();
  return out.filter((p) => (seen.has(norm(p.nombre)) ? false : (seen.add(norm(p.nombre)), true)));
}

export async function scrapearMenus(menus = MENUS_WEB): Promise<WebProducto[]> {
  const todo: WebProducto[] = [];
  for (const m of menus) {
    try {
      const res = await fetch(m.url, { cache: "no-store" });
      if (!res.ok) continue;
      todo.push(...extraerMenu(await res.text(), m.marca));
    } catch {
      // sitio caído / bloqueado: seguimos con lo que haya
    }
  }
  return todo;
}

// Mejor match en Tango: exacto normalizado > contiene, evitando promos/combos.
export function matchTango(web: string, tango: { nombre: string; precio: number; actualizado?: string }[]) {
  const w = norm(web);
  const exact = tango.filter((g) => norm(g.nombre) === w);
  if (exact.length) return exact.sort((a, b) => a.nombre.length - b.nombre.length)[0];
  if (w.length < 4) return null;
  const cont = tango
    .filter((g) => norm(g.nombre).includes(w))
    .sort(
      (a, b) =>
        (Number(PROMO.test(norm(a.nombre))) - Number(PROMO.test(norm(b.nombre)))) || a.nombre.length - b.nombre.length
    );
  return cont[0] || null;
}

export function comparar(
  web: WebProducto[],
  tango: { nombre: string; precio: number; actualizado?: string }[]
): Comparacion[] {
  return web.map((p) => {
    const t = matchTango(p.nombre, tango);
    const diffPct = t && p.precio ? Math.round(((t.precio - p.precio) / p.precio) * 100) : null;
    let estado: Comparacion["estado"] = "nomatch";
    if (t && diffPct != null) estado = Math.abs(diffPct) <= 5 ? "ok" : Math.abs(diffPct) <= 20 ? "dif" : "alerta";
    return {
      marca: p.marca,
      nombre: p.nombre,
      precioWeb: p.precio,
      precioTango: t?.precio ?? null,
      tangoNombre: t?.nombre ?? null,
      tangoActualizado: t?.actualizado ?? null,
      diffPct,
      estado,
    };
  });
}
