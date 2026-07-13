"use client";

import { useEffect, useState } from "react";
import { Card, ErrorState, Skeleton } from "@/components/ui/primitives";
import type { ResumenHoras } from "@/lib/horas";

const money = (n: number) => "$" + Math.round(n).toLocaleString("es-AR");
const moneyC = (n: number) => {
  const a = Math.abs(n);
  const s = a >= 1e9 ? (n / 1e9).toFixed(2).replace(".", ",") + " mil M" : a >= 1e6 ? (n / 1e6).toFixed(1).replace(".", ",") + " M" : a >= 1e3 ? Math.round(n / 1e3) + " k" : String(Math.round(n));
  return "$" + s;
};
const int = (n: number) => Math.round(n).toLocaleString("es-AR");
const hh = (h: number) => String(h).padStart(2, "0") + "h";

const PERIODOS: [number, string][] = [[7, "7 días"], [15, "15 días"], [30, "30 días"], [60, "60 días"]];

export default function HorasView() {
  const [dias, setDias] = useState(30);
  const [data, setData] = useState<ResumenHoras | null>(null);
  const [estado, setEstado] = useState<"cargando" | "ok" | "error">("cargando");
  const [err, setErr] = useState("");

  async function cargar(d = dias) {
    setEstado("cargando");
    try {
      const j = await (await fetch(`/api/horas?dias=${d}`, { cache: "no-store" })).json();
      if (!j.ok) throw new Error(j.error || "No se pudo cargar.");
      setData(j as ResumenHoras); setEstado("ok");
    } catch (e) { setErr(e instanceof Error ? e.message : "Error"); setEstado("error"); }
  }
  useEffect(() => { cargar(dias); }, [dias]);

  // Rango horario con actividad (para no dibujar 24 horas si el grueso está en 8..2).
  const horas = data?.porHora ?? [];
  const activas = horas.filter((h) => h.importe > 0);
  const desdeH = activas.length ? Math.min(...activas.map((h) => h.hora)) : 0;
  const hastaH = activas.length ? Math.max(...activas.map((h) => h.hora)) : 23;
  const visibles = horas.filter((h) => h.hora >= desdeH && h.hora <= hastaH);
  const maxImp = Math.max(1, ...visibles.map((h) => h.importe));
  const maxTk = Math.max(1, ...visibles.map((h) => h.tickets));
  const maxDiaTk = Math.max(1, ...(data?.porDia.map((d) => d.tickets) ?? [1]));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold text-ink">Ticket y horarios</h1>
          <p className="mt-0.5 max-w-2xl text-sm text-muted">Cuánto vale cada ticket y a qué hora se mueve la venta. Sale de los comprobantes de Tango (importe + cantidad de tickets por hora).</p>
        </div>
        <div data-tour="horas-periodo" className="flex gap-1">
          {PERIODOS.map(([d, l]) => (
            <button key={d} onClick={() => setDias(d)} className={`rounded-md px-2.5 py-1 text-2xs font-medium ${dias === d ? "bg-ink/[0.06] text-ink" : "text-muted hover:bg-ink/[0.03]"}`}>{l}</button>
          ))}
        </div>
      </div>

      {estado === "cargando" && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}</div>}
      {estado === "error" && <ErrorState msg={err} onRetry={() => cargar()} />}

      {estado === "ok" && data && (
        <>
          <div data-tour="horas-kpis" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Ticket promedio" value={money(data.ticketProm)} sub="por comprobante" />
            <Kpi label="Tickets" value={int(data.totalTickets)} sub={`últimos ${dias} días`} />
            <Kpi label="Facturación" value={moneyC(data.totalImporte)} full={money(data.totalImporte)} sub="del período" />
            <Kpi label="Hora pico" value={hh(data.horaPico)} sub="más facturación" />
          </div>

          {!data.conNombres && (
            <div className="rounded-md border border-warn/25 bg-warn/[0.06] px-3 py-2 text-2xs text-warn">
              📊 Mostrando el ritmo del <b>grupo</b>. El desglose por local aparece apenas el próximo push cargue el nombre de las sucursales al cache.
            </div>
          )}

          {/* Por local */}
          {data.conNombres && data.porLocal.length > 0 && (
            <div data-tour="horas-local"><Card className="overflow-hidden">
              <p className="border-b border-line px-4 py-2.5 text-2xs font-medium uppercase tracking-wide text-faint">Ticket promedio por local ({data.porLocal.length})</p>
              <div className="max-h-96 overflow-auto">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-surface"><tr className="border-b border-line text-2xs uppercase tracking-wide text-faint">
                    <th className="px-4 py-2 font-medium">Local</th>
                    <th className="px-3 py-2 text-right font-medium">Tickets</th>
                    <th className="px-3 py-2 text-right font-medium">Ticket prom.</th>
                    <th className="px-3 py-2 text-right font-medium">Facturación</th>
                  </tr></thead>
                  <tbody>
                    {data.porLocal.map((l) => (
                      <tr key={l.idSucursal} className="border-b border-line/70 last:border-0 hover:bg-ink/[0.02]">
                        <td className="px-4 py-2 text-ink">{l.nombre}</td>
                        <td className="px-3 py-2 text-right font-mono text-2xs text-muted">{int(l.tickets)}</td>
                        <td className="px-3 py-2 text-right font-mono text-xs font-medium text-ink">{money(l.ticketProm)}</td>
                        <td className="px-3 py-2 text-right font-mono text-2xs text-muted">{moneyC(l.importe)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card></div>
          )}

          {/* Ritmo por hora */}
          <div data-tour="horas-ritmo"><Card className="p-4">
            <p className="mb-3 text-2xs font-medium uppercase tracking-wide text-faint">Ritmo por hora — cuánto se factura</p>
            <div className="flex items-end gap-1" style={{ height: 120 }}>
              {visibles.map((h) => (
                <div key={h.hora} className="group relative flex flex-1 flex-col items-center justify-end" title={`${hh(h.hora)} · ${money(h.importe)} · ${int(h.tickets)} tickets · ticket prom ${money(h.ticketProm)}`}>
                  <div className={`w-full rounded-t ${h.hora === data.horaPico ? "bg-action" : "bg-action/60"} group-hover:bg-action`} style={{ height: `${Math.max(2, (h.importe / maxImp) * 104)}px` }} />
                  <span className="mt-1 text-[9px] text-faint">{h.hora}</span>
                </div>
              ))}
            </div>
          </Card></div>

          {/* Ticket promedio por hora */}
          <div data-tour="horas-ticket"><Card className="p-4">
            <p className="mb-3 text-2xs font-medium uppercase tracking-wide text-faint">Ticket promedio por hora</p>
            <div className="space-y-1">
              {visibles.map((h) => (
                <div key={h.hora} className="flex items-center gap-2" title={`${int(h.tickets)} tickets`}>
                  <span className="w-8 shrink-0 text-2xs text-faint">{hh(h.hora)}</span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-ink/[0.06]">
                    <div className="h-full rounded-full bg-ok/70" style={{ width: `${Math.max(1, (h.ticketProm / Math.max(1, ...visibles.map((x) => x.ticketProm))) * 100)}%` }} />
                  </div>
                  <span className="w-20 shrink-0 text-right font-mono text-2xs text-ink">{money(h.ticketProm)}</span>
                </div>
              ))}
            </div>
          </Card></div>

          {/* Tickets por día */}
          <Card className="p-4">
            <p className="mb-3 text-2xs font-medium uppercase tracking-wide text-faint">Tickets por día</p>
            <div className="flex items-end gap-0.5" style={{ height: 80 }}>
              {data.porDia.map((d) => (
                <div key={d.fecha} className="group relative flex-1" title={`${d.fecha}: ${int(d.tickets)} tickets · ${money(d.importe)}`}>
                  <div className="w-full rounded-t bg-ink/30 group-hover:bg-ink/50" style={{ height: `${Math.max(2, (d.tickets / maxDiaTk) * 80)}px` }} />
                </div>
              ))}
            </div>
            <div className="mt-1 flex justify-between text-2xs text-faint"><span>{data.porDia[0]?.fecha}</span><span>{data.porDia[data.porDia.length - 1]?.fecha}</span></div>
          </Card>
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
