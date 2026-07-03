import { PRODUCTS } from "../catalogo";
import { getMapeos } from "../mapeos-store";
import type { PedidoCdp, PedidosSource, RangoQuery } from "./types";

// Fuente REAL de pedidos al CDP. Pega al mismo endpoint que el explorador de
// Raven (server-side, así el token nunca llega al browser) por cada insumo del
// catálogo y cada fecha del rango, y traduce branch_code -> código canónico.

const BASE = process.env.RAVEN_BASE_URL ?? "https://api.ravenfood.app/data/items";
const TOKEN = process.env.RAVEN_TOKEN;

interface RavenResp {
  code: string;
  branches?: { branch_code: string; branch_name?: string; qty: number }[];
}

function rangoFechas(desde: string, hasta: string): string[] {
  const out: string[] = [];
  const d = new Date(desde);
  const fin = new Date(hasta);
  while (d <= fin) {
    out.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

async function traer(code: string, date: string): Promise<RavenResp | null> {
  const url = `${BASE}/${encodeURIComponent(code)}?date=${encodeURIComponent(date)}`;
  const headers: Record<string, string> = {};
  if (TOKEN) headers["Authorization"] = `Bearer ${TOKEN}`;
  const r = await fetch(url, { cache: "no-store", headers });
  if (r.status === 404) return null; // ese insumo no tiene pedidos ese día
  if (!r.ok) throw new Error(`Raven respondió ${r.status} para ${code}/${date}`);
  const j = await r.json();
  // Raven envuelve la respuesta en { data: { ..., branches } }; desenvolver.
  return (j?.data ?? j) as RavenResp;
}

export const ravenPedidosSource: PedidosSource = {
  async getPedidos(q: RangoQuery): Promise<PedidoCdp[]> {
    const fechas = rangoFechas(q.desde, q.hasta);
    const pedidos: PedidoCdp[] = [];
    // Mapeo branch_code -> sucursal, con los mapeos efectivos (incluye lo guardado).
    const sucPorRaven = new Map((await getMapeos()).sucursales.map((s) => [s.ravenCode, s]));

    // Una request por insumo y fecha. Se lanzan en paralelo y se toleran fallos
    // puntuales (un 404 = sin pedidos; un insumo nuevo no rompe el resto).
    const tareas: Promise<void>[] = [];
    for (const p of PRODUCTS) {
      for (const fecha of fechas) {
        tareas.push(
          traer(p.code, fecha)
            .then((resp) => {
              if (!resp?.branches) return;
              for (const b of resp.branches) {
                const suc = sucPorRaven.get(b.branch_code);
                // Identidad de sucursal = NOMBRE (lo tienen Raven y Tango): el cruce
                // reconcilia por nombre normalizado. Se incluyen TODAS las sucursales
                // (antes se descartaban las sin canónico -> puntos ciegos).
                const sucursal = suc?.nombre || b.branch_name || b.branch_code;
                pedidos.push({
                  fecha,
                  codigoCdp: p.code,
                  sucursalCanonico: sucursal,
                  unidades: Number(b.qty) || 0,
                });
              }
            })
            .catch((e) => {
              // Un fallo aislado no debe tumbar todo el cruce.
              console.error("[raven] ", e instanceof Error ? e.message : e);
            })
        );
      }
    }
    await Promise.all(tareas);
    return pedidos;
  },
};
