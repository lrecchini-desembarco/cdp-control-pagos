"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, ErrorState, Skeleton } from "@/components/ui/primitives";
import type { ResumenMozos } from "@/lib/mozos";

const money = (n: number) => "$" + Math.round(n).toLocaleString("es-AR");
const moneyC = (n: number) => {
  const a = Math.abs(n);
  const s = a >= 1e9 ? (n / 1e9).toFixed(2).replace(".", ",") + " mil M" : a >= 1e6 ? (n / 1e6).toFixed(1).replace(".", ",") + " M" : a >= 1e3 ? Math.round(n / 1e3) + " k" : String(Math.round(n));
  return "$" + s;
};
const int = (n: number) => Math.round(n).toLocaleString("es-AR");
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const PERIODOS: [number, string][] = [[7, "7 días"], [15, "15 días"], [30, "30 días"], [60, "60 días"]];

export default function MozosView() {
  const [dias, setDias] = useState(30);
  const [data, setData] = useState<ResumenMozos | null>(null);
  const [estado, setEstado] = useState<"cargando" | "ok" | "error">("cargando");
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");

  async function cargar(d = dias) {
    setEstado("cargando");
    try {
      const j = await (await fetch(`/api/mozos?dias=${d}`, { cache: "no-store" })).json();
      if (!j.ok) throw new Error(j.error || "No se pudo cargar.");
      setData(j as ResumenMozos); setEstado("ok");
    } catch (e) { setErr(e instanceof Error ? e.message : "Error"); setEstado("error"); }
  }
  useEffect(() => { cargar(dias); }, [dias]);

  const maxMozo = Math.max(1, ...(data?.porMozo.map((m) => m.importe) ?? [1]));
  const filtro = norm(q.trim());
  const detalle = useMemo(() => {
    if (!data) return [];
    if (!filtro) return data.detalle;
    return data.detalle.filter((d) => norm(d.mozo + " " + d.local).includes(filtro));
  }, [data, filtro]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold text-ink">Mozos</h1>
          <p className="mt-0.5 max-w-2xl text-sm text-muted">Ventas y ticket promedio por mozo, de las comandas de Tango. Filtrable por local.</p>
        </div>
        <div data-tour="mozos-periodo" className="flex gap-1">
          {PERIODOS.map(([d, l]) => (
            <button key={d} onClick={() => setDias(d)} className={`rounded-md px-2.5 py-1 text-2xs font-medium ${dias === d ? "bg-ink/[0.06] text-ink" : "text-muted hover:bg-ink/[0.03]"}`}>{l}</button>
          ))}
        </div>
      </div>

      {estado === "cargando" && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}</div>}
      {estado === "error" && <ErrorState msg={err} onRetry={() => cargar()} />}

      {estado === "ok" && data && (
        <>
          <div data-tour="mozos-kpis" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Ticket promedio" value={money(data.ticketProm)} sub="por comanda" />
            <Kpi label="Mozos" value={int(data.mozos)} sub="nombres distintos" />
            <Kpi label="Locales" value={int(data.locales)} sub="con mozo cargado" />
            <Kpi label="Facturación" value={moneyC(data.totalImporte)} full={money(data.totalImporte)} sub={`últimos ${dias} días`} />
          </div>

          <div className="rounded-md border border-line bg-ink/[0.02] px-3 py-2 text-2xs text-muted">
            💡 Ojo: muchos locales cargan el mozo de forma genérica ("CAJA", "MOZO2") o repetida entre sucursales. El ranking muestra los datos tal cual vienen de Tango — miralo <b>por local</b> para que tenga sentido.
          </div>

          {/* Ranking de mozos */}
          <div data-tour="mozos-ranking"><Card className="overflow-hidden">
            <p className="border-b border-line px-4 py-2.5 text-2xs font-medium uppercase tracking-wide text-faint">Ranking de mozos (por ventas)</p>
            <div className="max-h-80 overflow-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-surface"><tr className="border-b border-line text-2xs uppercase tracking-wide text-faint">
                  <th className="px-4 py-2 font-medium">Mozo</th>
                  <th className="px-3 py-2 text-right font-medium">Locales</th>
                  <th className="px-3 py-2 text-right font-medium">Tickets</th>
                  <th className="px-3 py-2 text-right font-medium">Ticket prom.</th>
                  <th className="px-3 py-2 font-medium">Facturación</th>
                </tr></thead>
                <tbody>
                  {data.porMozo.map((m) => (
                    <tr key={m.mozo} className="border-b border-line/70 last:border-0 hover:bg-ink/[0.02]">
                      <td className="px-4 py-2 text-ink">{m.mozo}</td>
                      <td className="px-3 py-2 text-right font-mono text-2xs text-muted">{m.locales}</td>
                      <td className="px-3 py-2 text-right font-mono text-2xs text-muted">{int(m.tickets)}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-ink">{money(m.ticketProm)}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-ink/10"><div className="h-full rounded-full bg-action/70" style={{ width: `${Math.max(2, (m.importe / maxMozo) * 100)}%` }} /></div>
                          <span className="font-mono text-xs font-medium text-ink">{moneyC(m.importe)}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card></div>

          {/* Detalle mozo × local */}
          <div data-tour="mozos-detalle"><Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2">
              <p className="text-2xs font-medium uppercase tracking-wide text-faint">Detalle por local y mozo</p>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar mozo o local…" className="w-52 rounded-md border border-line bg-surface px-2.5 py-1 text-2xs text-ink placeholder:text-faint focus:border-action" />
            </div>
            <div className="max-h-[28rem] overflow-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-surface"><tr className="border-b border-line text-2xs uppercase tracking-wide text-faint">
                  <th className="px-4 py-2 font-medium">Local</th>
                  <th className="px-3 py-2 font-medium">Mozo</th>
                  <th className="px-3 py-2 text-right font-medium">Tickets</th>
                  <th className="px-3 py-2 text-right font-medium">Ticket prom.</th>
                  <th className="px-3 py-2 text-right font-medium">Facturación</th>
                </tr></thead>
                <tbody>
                  {detalle.length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-6 text-center text-2xs text-faint">Nada coincide con “{q}”.</td></tr>
                  ) : detalle.map((d) => (
                    <tr key={`${d.idSucursal}|${d.mozo}`} className="border-b border-line/70 last:border-0 hover:bg-ink/[0.02]">
                      <td className="px-4 py-2 text-ink">{d.local}</td>
                      <td className="px-3 py-2 text-muted">{d.mozo}</td>
                      <td className="px-3 py-2 text-right font-mono text-2xs text-muted">{int(d.tickets)}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-ink">{money(d.ticketProm)}</td>
                      <td className="px-3 py-2 text-right font-mono text-2xs text-muted">{moneyC(d.importe)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card></div>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, sub, full }: { label: string; value: string; sub?: string; full?: string }) {
  return (
    <Card className="p-3.5">
      <p className="text-2xs font-medium uppercase tracking-wide text-faint">{label}</p>
      <p className="mt-1 font-display text-2xl font-semibold text-ink" title={full}>{value}</p>
      {sub && <p className="mt-0.5 text-2xs text-muted">{sub}</p>}
    </Card>
  );
}
