import type { GoogleRating } from "./google-ratings";

/**
 * Consulta el rating actual de Google por placeId (Places Details API, clásica).
 * Server-only. Requiere GOOGLE_PLACES_API_KEY. Solo pide los campos de rating
 * (fields=rating,user_ratings_total) para que el costo sea el mínimo.
 *
 * OJO costo: es una API paga de Google. Por eso se llama SOLO desde el refresco
 * (cron semanal), se cachea en KV, y nunca en el render de la pantalla.
 */

const DETAILS = "https://maps.googleapis.com/maps/api/place/details/json";

export const googlePlacesConfigurado = () => Boolean(process.env.GOOGLE_PLACES_API_KEY);

async function unRating(placeId: string, key: string): Promise<GoogleRating | null> {
  try {
    const u = new URL(DETAILS);
    u.searchParams.set("place_id", placeId);
    u.searchParams.set("fields", "rating,user_ratings_total");
    u.searchParams.set("key", key);
    const r = await fetch(u.toString(), { cache: "no-store" });
    if (!r.ok) return null;
    const j = (await r.json()) as { status?: string; result?: { rating?: number; user_ratings_total?: number } };
    if (j.status !== "OK" || !j.result) return null;
    const score = Number(j.result.rating);
    const reviews = Number(j.result.user_ratings_total);
    if (!Number.isFinite(score)) return null;
    return { score, reviews: Number.isFinite(reviews) ? reviews : 0 };
  } catch {
    return null;
  }
}

/** Trae los ratings live de una lista de placeIds (en tandas, para no saturar). */
export async function fetchRatingsLive(placeIds: string[]): Promise<Record<string, GoogleRating>> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return {};
  const out: Record<string, GoogleRating> = {};
  const LOTE = 8;
  for (let i = 0; i < placeIds.length; i += LOTE) {
    const tanda = placeIds.slice(i, i + LOTE);
    const res = await Promise.all(tanda.map((pid) => unRating(pid, key)));
    res.forEach((r, k) => { if (r) out[tanda[k]] = r; });
  }
  return out;
}
