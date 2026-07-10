"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, Button, Skeleton, Badge, EmptyState } from "@/components/ui/primitives";
import { descargarCSV } from "@/lib/exportar-csv";

interface CobroMPDia {
  fecha: string; total: number; neto: number; count: number;
  porMedio: Record<string, number>; porTipo: Record<string, number>; porStore: Record<string, number>;
}
interface Datos { ok: boolean; configurado: boolean; at: string | null; dias: CobroMPDia[]; error?: string }

const money = (n: number) => "$" + Math.round(n).toLocaleString("es-AR");
const int = (n: number) => Math.round(n).toLocaleString("es-AR");
const fechaCorta = (iso: string) => (iso ? new Date(iso + "T00:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" }) : "—");
const cuando = (iso: string | null) => (iso ? new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");

// Nombres lindos para los tipos/medios de MP.
const TIPO: Record<string, string> = {
  credit_card: "Tarjeta crédito", debit_card: "Tarjeta débito", account_money: "Dinero en cuenta (MP/QR)",
  ticket: "Efectivo (Pago Fácil/Rapipago)", bank_transfer: "Transferencia", atm: "Cajero", otro: "Otro",
};
const tipoLabel = (t: string) => TIPO[t] ?? t;

function sumar(dias: CobroMPDia[], campo: "porMedio" | "porTipo" | "porStore"): [string, number][] {
  const m: Record<string, number> = {};
  for (const d of dias) for (const [k, v] of Object.entries(d[campo])) m[k] = (m[k] ?? 0) + v;
  return Object.entries(m).sort((a, b) => b[1] - a[1]);
}

export default function MercadoPagoView() {
  const [d, setD] = useState<Datos | null>(null);
  const [estado, setEstado] = useState<"loading" | "ok" | "error">("loading");
  const [dias, setDias] = useState(14);

  async function cargar(n = dias) {
    setEstado("loading");
    try {
      const j: Datos = await (await fetch(`/api/mercadopago?dias=${n}`)).json();
      if (!j.ok) throw new Error(j.error || "No se pudo cargar.");
      setD(j); setEstado("ok");
    } catch { setEstado("error"); }
  }
  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, []);

  const total = useMemo(() => (d?.dias ?? []).reduce((s, x) => s + x.total, 0), [d]);
  const neto = useMemo(() => (d?.dias ?? []).reduce((s, x) => s + x.neto, 0), [d]);
  const count = useMemo(() => (d?.dias ?? []).reduce((s, x) => s + x.count, 0), [d]);
  const porTipo = useMemo(() => (d ? sumar(d.dias, "porTipo") : []), [d]);
  const porMedio = useMemo(() => (d ? sumar(d.dias, "porMedio") : []), [d]);
  const porStore = useMemo(() => (d ? sumar(d.dias, "porStore") : []), [d]);
  const maxTipo = Math.max(1, ...porTipo.map(([, v]) => v));

  const hayDatos = (d?.dias?.length ?? 0) > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold text-ink">Cobros · Mercado Pago</h1>
          <p className="mt-0.5 max-w-2xl text-sm text-muted">
            Lo que cobró Mercado Pago (pagos aprobados), por medio de pago y por día. Para conciliar contra lo que registró Tango.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {d?.configurado ? <Badge tone="ok">conectado</Badge> : <Badge tone="warn">sin conectar</Badge>}
          {d?.at && <span className="text-2xs text-faint">actualizado {cuando(d.at)}</span>}
        </div>
      </div>

      {estado === "loading" ? (
        <Card className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</Card>
      ) : estado === "error" ? (
        <Card className="p-4 text-sm text-bad">No se pudo cargar Mercado Pago.</Card>
      ) : !d?.configurado ? (
        <Card className="border-l-4 border-l-warn/60 bg-warn/5 p-5">
          <p className="font-display text-sm font-semibold text-ink">Falta conectar Mercado Pago</p>
          <p className="mt-1.5 max-w-2xl text-xs text-muted">
            Para traer los cobros hay que cargar el <b>access token</b> de la cuenta de MP en la variable{" "}
            <code className="rounded bg-paper px-1">MERCADOPAGO_ACCESS_TOKEN</code> (en Vercel) y redeploy. El token se saca del panel
            de Mercado Pago → Tus integraciones → Credenciales de producción. Ver <code className="rounded bg-paper px-1">docs/mercadopago.md</code>.
            Es de solo lectura de pagos; el dato se refresca solo (cron) y se cachea.
          </p>
        </Card>
      ) : !hayDatos ? (
        <EmptyState title="Sin cobros todavía" desc="Está conectado pero aún no se cacheó ningún día. El refresco corre por cron; podés forzarlo entrando a /api/mercadopago/refresh?dias=8." />
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label={`Cobrado MP (${dias} días)`} value={money(total)} tone="ok" monto />
            <Kpi label="Neto liberado" value={money(neto)} sub="lo que MP acredita" monto />
            <Kpi label="Pagos" value={int(count)} sub="operaciones aprobadas" />
            <Kpi label="Ticket promedio" value={count ? money(total / count) : "—"} monto />
          </div>

          {/* Por tipo de pago */}
          <Card className="p-4">
            <p className="mb-3 text-2xs font-medium uppercase tracking-wide text-faint">Por tipo de pago</p>
            <div className="space-y-2">
              {porTipo.map(([t, v]) => (
                <div key={t} className="flex items-center gap-3">
                  <span className="w-48 shrink-0 truncate text-xs text-ink">{tipoLabel(t)}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink/10">
                    <div className="h-full rounded-full bg-action" style={{ width: `${Math.max(2, (v / maxTipo) * 100)}%` }} />
                  </div>
                  <span className="w-28 shrink-0 text-right font-mono tnum text-sm text-ink monto">{money(v)}</span>
                  <span className="w-10 shrink-0 text-right text-2xs text-faint">{total ? Math.round((v / total) * 100) : 0}%</span>
                </div>
              ))}
            </div>
          </Card>

          {/* Por día */}
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5">
              <p className="text-2xs font-medium uppercase tracking-wide text-faint">Por día</p>
              <Button variant="outline" onClick={() => descargarCSV("cobros-mp", ["Fecha", "Cobrado", "Neto", "Pagos"], d.dias.map((x) => [x.fecha, Math.round(x.total), Math.round(x.neto), x.count]))}>⬇ Exportar</Button>
            </div>
            <div className="overflow-x-auto border-t border-line">
              <table className="w-full text-left text-sm">
                <thead><tr className="border-b border-line text-2xs uppercase tracking-wide text-faint">
                  <th className="px-4 py-2 font-medium">Fecha</th><th className="px-3 py-2 text-right font-medium">Cobrado</th>
                  <th className="px-3 py-2 text-right font-medium">Neto</th><th className="px-3 py-2 text-right font-medium">Pagos</th>
                </tr></thead>
                <tbody>
                  {[...d.dias].reverse().map((x) => (
                    <tr key={x.fecha} className="border-b border-line/70 last:border-0 hover:bg-ink/[0.02]">
                      <td className="px-4 py-2 text-ink">{fechaCorta(x.fecha)}</td>
                      <td className="px-3 py-2 text-right font-mono tnum text-ink monto">{money(x.total)}</td>
                      <td className="px-3 py-2 text-right font-mono tnum text-muted monto">{money(x.neto)}</td>
                      <td className="px-3 py-2 text-right font-mono tnum text-muted">{int(x.count)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Por store (para mapear a local más adelante) */}
          {porStore.length > 1 && (
            <Card className="p-4">
              <p className="mb-2 text-2xs font-medium uppercase tracking-wide text-faint">Por store de MP</p>
              <p className="mb-2 text-2xs text-faint">Los store_id de Mercado Pago. Cuando confirmemos el mapeo store → local, se muestra por local.</p>
              <div className="flex flex-wrap gap-2">
                {porStore.slice(0, 30).map(([s, v]) => (
                  <span key={s} className="rounded-full border border-line px-2.5 py-1 text-2xs text-muted">{s}: <b className="text-ink monto">{money(v)}</b></span>
                ))}
              </div>
            </Card>
          )}

          {/* Conciliación con Tango (pendiente) */}
          <Card className="border-l-4 border-l-line p-4">
            <p className="font-display text-sm font-semibold text-ink">Conciliación con Tango</p>
            <p className="mt-1 text-xs text-muted">
              El siguiente paso es cruzar estos cobros de MP contra lo que Tango registró como cobrado por QR/MP, y marcar diferencias.
              Falta habilitar la vista de cobros de Tango (<code className="rounded bg-paper px-1">GRANT SELECT ON dbo.vw_CobrosDiarios TO cdp_lectura</code>,
              en el pedido a Sistemas). Apenas esté, se activa la comparación día por día acá.
            </p>
          </Card>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, sub, tone, monto }: { label: string; value: string; sub?: string; tone?: "ok"; monto?: boolean }) {
  return (
    <Card className="p-3">
      <p className="text-2xs uppercase tracking-wide text-faint">{label}</p>
      <p className={`mt-0.5 font-display text-base font-semibold leading-tight tnum sm:text-2xl ${tone === "ok" ? "text-ok" : "text-ink"} ${monto ? "monto" : ""}`}>{value}</p>
      {sub && <p className="text-2xs text-faint">{sub}</p>}
    </Card>
  );
}
