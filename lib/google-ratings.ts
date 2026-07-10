import ratings from "./google-ratings.json";

// Snapshot del rating de Google por local (placeId), extraído del Excel "Maps".
// Es una foto (enero 2026); para verlo en vivo habría que reimportar/conectar API.
export interface GoogleRating {
  score: number;
  reviews: number;
}

const data = ratings as Record<string, GoogleRating>;

/** Snapshot bundleado (foto). El server lo fusiona con lo live si hay API key. */
export const SNAPSHOT: Record<string, GoogleRating> = data;

/** Saca el placeId de un link writereview?placeid=... */
export function placeIdDeUrl(url?: string | null): string | null {
  if (!url) return null;
  const m = url.match(/[?&]placeid=([^&]+)/i);
  return m ? decodeURIComponent(m[1]) : null;
}

// Todas las lecturas aceptan un `map` opcional: si viene (ratings live traídos del
// endpoint), se usa ese; si no, el snapshot bundleado. Así la view puede pasar el
// live sin cambiar la lógica.
export function ratingDeUrl(url?: string | null, map: Record<string, GoogleRating> = data): GoogleRating | null {
  const pid = placeIdDeUrl(url);
  return pid ? map[pid] ?? null : null;
}

/** Promedio ponderado por cantidad de reseñas sobre una lista de URLs (locales cargados). */
export function resumenGoogle(urls: (string | null | undefined)[], map: Record<string, GoogleRating> = data): {
  locales: number;
  promedio: number;
  totalReviews: number;
} {
  let sumW = 0,
    rev = 0,
    n = 0;
  for (const u of urls) {
    const r = ratingDeUrl(u, map);
    if (r) {
      sumW += r.score * r.reviews;
      rev += r.reviews;
      n++;
    }
  }
  return { locales: n, promedio: rev ? sumW / rev : 0, totalReviews: rev };
}
