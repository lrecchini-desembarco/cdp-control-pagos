import ratings from "./google-ratings.json";

// Snapshot del rating de Google por local (placeId), extraído del Excel "Maps".
// Es una foto (enero 2026); para verlo en vivo habría que reimportar/conectar API.
export interface GoogleRating {
  score: number;
  reviews: number;
}

const data = ratings as Record<string, GoogleRating>;

/** Saca el placeId de un link writereview?placeid=... */
export function placeIdDeUrl(url?: string | null): string | null {
  if (!url) return null;
  const m = url.match(/[?&]placeid=([^&]+)/i);
  return m ? decodeURIComponent(m[1]) : null;
}

export function ratingDeUrl(url?: string | null): GoogleRating | null {
  const pid = placeIdDeUrl(url);
  return pid ? data[pid] ?? null : null;
}

/** Promedio ponderado por cantidad de reseñas sobre una lista de URLs (locales cargados). */
export function resumenGoogle(urls: (string | null | undefined)[]): {
  locales: number;
  promedio: number;
  totalReviews: number;
} {
  let sumW = 0,
    rev = 0,
    n = 0;
  for (const u of urls) {
    const r = ratingDeUrl(u);
    if (r) {
      sumW += r.score * r.reviews;
      rev += r.reviews;
      n++;
    }
  }
  return { locales: n, promedio: rev ? sumW / rev : 0, totalReviews: rev };
}
