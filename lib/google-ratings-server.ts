import { readStore, writeStore } from "./store";
import { SNAPSHOT, type GoogleRating } from "./google-ratings";
import { fetchRatingsLive, googlePlacesConfigurado } from "./google-places";

/**
 * Ratings EFECTIVOS de Google (server): si hay API key + refresco cacheado, devuelve
 * lo live fusionado sobre el snapshot; si no, el snapshot solo. El fetch pago vive
 * en el refresco (cron), NUNCA en la lectura de pantalla.
 */

const KEY = "google-ratings-live";
const REFRESCO_DIAS = 6; // no re-consultar la API paga si el cache es más nuevo que esto

interface CacheLive {
  at: string; // ISO del último refresco
  data: Record<string, GoogleRating>;
}

export { googlePlacesConfigurado };

export interface RatingsEfectivos {
  live: boolean;             // true si estamos sirviendo datos live (no la foto)
  at: string | null;         // cuándo se refrescó lo live
  configurado: boolean;      // hay API key
  ratings: Record<string, GoogleRating>;
}

/** Lectura rápida (sin llamar a Google): cache-o-snapshot. */
export async function getRatingsEfectivos(): Promise<RatingsEfectivos> {
  const configurado = googlePlacesConfigurado();
  const cache = await readStore<CacheLive | null>(KEY, null);
  const live = configurado && !!cache && !!cache.data && Object.keys(cache.data).length > 0;
  const ratings = live ? { ...SNAPSHOT, ...cache!.data } : { ...SNAPSHOT };
  return { live, at: cache?.at ?? null, configurado, ratings };
}

const diasDesde = (iso?: string | null) =>
  iso ? (Date.now() - Date.parse(iso)) / 86_400_000 : Infinity;

/**
 * Refresca lo live desde la Places API y lo guarda en KV. Salta si el cache es
 * reciente (control de costo), salvo `force`. Devuelve qué pasó.
 */
export async function refrescarRatings(force = false): Promise<{ refreshed: boolean; count: number; at: string | null; motivo?: string }> {
  if (!googlePlacesConfigurado()) return { refreshed: false, count: 0, at: null, motivo: "sin GOOGLE_PLACES_API_KEY" };
  const cache = await readStore<CacheLive | null>(KEY, null);
  if (!force && diasDesde(cache?.at) < REFRESCO_DIAS) {
    return { refreshed: false, count: Object.keys(cache?.data ?? {}).length, at: cache?.at ?? null, motivo: "cache reciente" };
  }
  const placeIds = Object.keys(SNAPSHOT);
  const data = await fetchRatingsLive(placeIds);
  const at = new Date().toISOString();
  // Si la API no devolvió nada (key mala / cuota), NO pisamos el cache previo.
  if (Object.keys(data).length === 0) {
    return { refreshed: false, count: 0, at: cache?.at ?? null, motivo: "la API no devolvió datos" };
  }
  await writeStore<CacheLive>(KEY, { at, data });
  return { refreshed: true, count: Object.keys(data).length, at };
}
