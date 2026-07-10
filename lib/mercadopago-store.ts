import { readStore, writeStore } from "./store";
import { diasEntre } from "./tango-cache";
import { recentDates } from "./catalogo";
import { fetchCobrosDia, mpConfigurado, type CobroMPDia } from "./mercadopago";

// Cache de cobros MP por día (KV). El refresco (cron) trae los últimos N días y los
// cachea; la pantalla lee de acá. Días recientes cambian (entran pagos), por eso el
// refresco re-consulta los últimos días en cada corrida.

const KEY = (dia: string) => `mp-cobros:${dia}`;
const META = "mp-cobros-meta"; // { at: ISO }

export { mpConfigurado };

export interface CobrosMP {
  configurado: boolean;
  at: string | null;          // último refresco
  dias: CobroMPDia[];         // días con datos, ascendente
}

/** Lectura rápida del cache (sin pegar a MP). */
export async function getCobrosMP(desde: string, hasta: string): Promise<CobrosMP> {
  const dias = diasEntre(desde, hasta);
  const out: CobroMPDia[] = [];
  for (const d of dias) {
    const c = await readStore<CobroMPDia | null>(KEY(d), null);
    if (c) out.push(c);
  }
  const meta = await readStore<{ at: string } | null>(META, null);
  return { configurado: mpConfigurado(), at: meta?.at ?? null, dias: out };
}

/** Refresca los últimos N días desde la API de MP y los cachea. No-op sin token. */
export async function refrescarMP(nDias = 8): Promise<{ refreshed: number; at: string | null; motivo?: string }> {
  if (!mpConfigurado()) return { refreshed: 0, at: null, motivo: "sin MERCADOPAGO_ACCESS_TOKEN" };
  const dias = recentDates(Math.max(1, Math.min(nDias, 60)));
  let n = 0;
  for (const d of dias) {
    const c = await fetchCobrosDia(d); // puede lanzar si la API falla
    if (c) { await writeStore(KEY(d), c); n++; }
  }
  const at = new Date().toISOString();
  await writeStore(META, { at });
  return { refreshed: n, at };
}
