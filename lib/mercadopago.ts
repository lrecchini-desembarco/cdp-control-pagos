// Cobros de Mercado Pago (pagos aprobados) desde la API de MP. Server-only.
// Requiere MERCADOPAGO_ACCESS_TOKEN (access token de la cuenta MP). La API es paga /
// rate-limited: se llama SOLO en el refresco (cron), se agrega por día y se cachea en
// KV; la pantalla lee el cache, nunca pega a MP directo.
//
// Doc de la API: GET /v1/payments/search (paginado). Ver docs/mercadopago.md.

const API = "https://api.mercadopago.com";

export const mpConfigurado = () => Boolean(process.env.MERCADOPAGO_ACCESS_TOKEN);

/** Cobros de MP agregados de un día (una fila por día, ya sumada por medio/tipo/store). */
export interface CobroMPDia {
  fecha: string;                     // AAAA-MM-DD
  total: number;                     // suma de transaction_amount (aprobados)
  neto: number;                      // suma de net_received_amount (lo que MP libera)
  count: number;                     // cantidad de pagos
  porMedio: Record<string, number>;  // payment_method_id (visa, master, account_money…) -> monto
  porTipo: Record<string, number>;   // payment_type_id (credit_card, debit_card, account_money…) -> monto
  porStore: Record<string, number>;  // store_id -> monto (para mapear a local más adelante)
}

// MP trabaja en horario -03:00 (Argentina). El rango del día se arma con ese offset.
const rangoDia = (dia: string) => ({
  begin: `${dia}T00:00:00.000-03:00`,
  end: `${dia}T23:59:59.999-03:00`,
});

/**
 * Trae y agrega los pagos aprobados de UN día desde la API de MP (paginado).
 * Devuelve null si no hay token. Lanza si la API responde error (lo cachea el caller).
 */
export async function fetchCobrosDia(dia: string): Promise<CobroMPDia | null> {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token) return null;

  const { begin, end } = rangoDia(dia);
  const agg: CobroMPDia = { fecha: dia, total: 0, neto: 0, count: 0, porMedio: {}, porTipo: {}, porStore: {} };
  const limit = 100;
  let offset = 0;

  for (let guard = 0; guard < 500; guard++) {
    const u = new URL(`${API}/v1/payments/search`);
    u.searchParams.set("range", "date_approved");
    u.searchParams.set("begin_date", begin);
    u.searchParams.set("end_date", end);
    u.searchParams.set("status", "approved");
    u.searchParams.set("sort", "date_approved");
    u.searchParams.set("criteria", "asc");
    u.searchParams.set("limit", String(limit));
    u.searchParams.set("offset", String(offset));

    const r = await fetch(u.toString(), {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!r.ok) throw new Error(`MP ${r.status}: ${(await r.text().catch(() => "")).slice(0, 200)}`);
    const j = (await r.json()) as { results?: any[]; paging?: { total?: number } };
    const results = j.results ?? [];

    for (const p of results) {
      const amount = Number(p.transaction_amount) || 0;
      const neto = Number(p.transaction_details?.net_received_amount ?? amount) || 0;
      agg.total += amount;
      agg.neto += neto;
      agg.count++;
      const medio = String(p.payment_method_id ?? "otro");
      const tipo = String(p.payment_type_id ?? "otro");
      const store = String(p.store_id ?? "sin-store");
      agg.porMedio[medio] = (agg.porMedio[medio] ?? 0) + amount;
      agg.porTipo[tipo] = (agg.porTipo[tipo] ?? 0) + amount;
      agg.porStore[store] = (agg.porStore[store] ?? 0) + amount;
    }

    const total = Number(j.paging?.total ?? results.length);
    offset += limit;
    if (results.length === 0 || offset >= total) break;
  }

  return agg;
}
