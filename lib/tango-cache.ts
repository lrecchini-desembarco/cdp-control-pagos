import { gzipSync, gunzipSync } from "zlib";
import { readStore } from "./store";
import type { VentaSku, PrecioProducto, RangoQuery } from "./sources/types";

// Cache de Tango en KV: la PC de carga EMPUJA ventas y precios al KV cada pocos
// minutos (salida HTTPS, nunca falla), y el dashboard los lee de acá — sin túnel.
// Ventas por día (comprimidas): cdp:tango-ventas:AAAA-MM-DD. Precios: cdp:tango-precios.
// Si falta algún día en el cache, el source cae al bridge (respaldo).

export function pack(obj: unknown): string {
  return gzipSync(Buffer.from(JSON.stringify(obj), "utf8")).toString("base64");
}
export function unpack<T>(s: string): T {
  return JSON.parse(gunzipSync(Buffer.from(s, "base64")).toString("utf8")) as T;
}

export function diasEntre(desde: string, hasta: string): string[] {
  const out: string[] = [];
  const d = new Date(desde + "T00:00:00");
  const fin = new Date(hasta + "T00:00:00");
  while (d <= fin) {
    out.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

/**
 * Ventas del rango desde el cache KV. Best-effort: devuelve los días que SÍ están
 * cacheados (el push guarda ~32 días; pedir un rango más largo NO rompe, muestra lo
 * disponible). Solo devuelve null si NO hay ningún día cacheado -> ahí sí prueba el
 * bridge. Así un túnel viejo/caído no tira "fetch failed" cuando el KV tiene los datos.
 */
export async function ventasDesdeCache(q: RangoQuery): Promise<VentaSku[] | null> {
  const dias = diasEntre(q.desde, q.hasta);
  const packs = await Promise.all(dias.map((dia) => readStore<string | null>(`tango-ventas:${dia}`, null)));
  const presentes = packs.filter((p): p is string => Boolean(p));
  if (presentes.length === 0) return null; // nada cacheado -> respaldo por bridge
  const out: VentaSku[] = [];
  for (const p of presentes) out.push(...unpack<VentaSku[]>(p));
  return out;
}

/** Precios desde el cache KV. null si no está cacheado (=> usar bridge). */
export async function preciosDesdeCache(): Promise<PrecioProducto[] | null> {
  const packed = await readStore<string | null>("tango-precios", null);
  return packed ? unpack<PrecioProducto[]>(packed) : null;
}
