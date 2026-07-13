"use client";

import { useEffect, useState } from "react";
import { Card, ErrorState, Skeleton } from "@/components/ui/primitives";
import type { ResumenCobros } from "@/lib/cobros";

const money = (n: number) => "$" + Math.round(n).toLocaleString("es-AR");
const moneyC = (n: number) => {
  const a = Math.abs(n);
  const s = a >= 1e9 ? (n / 1e9).toFixed(2).replace(".", ",") + " mil M" : a >= 1e6 ? (n / 1e6).toFixed(1).replace(".", ",") + " M" : a >= 1e3 ? Math.round(n / 1e3) + " k" : String(Math.round(n));
  return "$" + s;
};
const pct = (n: number) => (n * 100).toFixed(n >= 0.1 ? 0 : 1) + "%";
const int = (n: number) => Math.round(n).toLocaleString("es-AR");

const COLOR_FAM: Record<string, string> = {
  "Efectivo": "bg-ok/80", "Tarjetas": "bg-action/80", "MercadoPago / QR": "bg-sky-500/80",
  "PedidosYa": "bg-warn/80", "Rappi": "bg-orange-500/80", "Otros": "bg-ink/40",
};

const PERIODOS: [number, string][] = [[7, "7 días"], [15, "15 días"], [30, "30 días"], [60, "60 días"]];

export default function CobrosView() {
  const [dias, setDias] = useState(30);
  const [data, setData] = useState<ResumenCobros | null>(null);
  const [estado, setEstado] = useState<"cargando" | "ok" | "error">("cargando");
  const [err, setErr] = useState("");

  async function cargar(d = dias) {
    setEstado("cargando");
    try {
      const j = await (await fetch(`/api/cobros?dias=${d}`, { cache: "no-store" })).json();
      if (!j.ok) throw new Error(j.error || "No se pudo cargar.");
      setData(j as ResumenCobros); setEstado("ok");
    } catch (e) { setErr(e instanceof Error ? e.message : "Error"); setEstado("error"); }
  }
  useEffect(() => { cargar(dias); }, [dias]);

  const maxMedio = Math.max(1, ...(data?.porMedio.map((m) => m.importe) ?? [1]));
  const maxDia = Math.max(1, ...(data?.porDia.map((d) => d.importe) ?? [1]));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold text-ink">Cobros · Medios de pago</h1>
          <p className="mt-0.5 max-w-2xl text-sm text-muted">Cuánta plata entró y por qué medio: efectivo, tarjetas, Mercado Pago/QR, PedidosYa, Rappi. Sale de los cierres de caja de Tango.</p>
        </div>
        <div data-tour="cobros-periodo" className="flex gap-1">
          {PERIODOS.map(([d, l]) => (
            <button key={d} onClick={() => setDias(d)} className={`rounded-md px-2.5 py-1 text-2xs font-medium ${dias === d ? "bg-ink/[0.06] text-ink" : "text-muted hover:bg-ink/[0.03]"}`}>{l}</button>
          ))}
        </div>
      </div>

      <div className="rounded-md border border-warn/25 bg-warn/[0.06] px-3 py-2 text-2xs text-warn" data-tour="cobros-nota">
        📊 Por ahora es el total del <b>grupo</b>. El desglose <b>por local</b> se enciende cuando Sistemas agregue el nombre de la sucursal a la vista (hoy Tango solo manda el número).
      </div>

      {estado === "cargando" && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}</div>}
      {estado === "error" && <ErrorState msg={err} onRetry={() => cargar()} />}

      {estado === "ok" && data && (
        <>
          <div data-tour="cobros-kpis" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Total cobrado" value={moneyC(data.total)} full={money(data.total)} sub={`últimos ${dias} días`} />
            <Kpi label="Medios de pago" value={String(data.medios)} sub="distintos" />
            <Kpi label="Locales" value={String(data.locales)} sub="con cobros" />
            <Kpi label="Efectivo" value={pct(famPct(data, "Efectivo"))} sub="del total" />
          </div>

          {/* Por familia */}
          <div data-tour="cobros-familias"><Card className="p-4">
            <p className="mb-3 text-2xs font-medium uppercase tracking-wide text-faint">Cómo te pagan (por tipo)</p>
            <div className="space-y-2.5">
              {data.porFamilia.map((f) => (
                <div key={f.familia} className="flex items-center gap-3">
                  <span className="w-32 shrink-0 text-xs text-ink">{f.familia}</span>
                  <div className="h-3 flex-1 overflow-hidden rounded-full bg-ink/[0.06]">
                    <div className={`h-full rounded-full ${COLOR_FAM[f.familia] ?? "bg-ink/40"}`} style={{ width: `${Math.max(1, f.pct * 100)}%` }} />
                  </div>
                  <span className="w-14 shrink-0 text-right text-2xs font-medium text-muted">{pct(f.pct)}</span>
                  <span className="w-24 shrink-0 text-right font-mono text-xs text-ink">{moneyC(f.importe)}</span>
                </div>
              ))}
            </div>
          </Card></div>

          {/* Por medio detallado */}
          <div data-tour="cobros-medios"><Card className="overflow-hidden">
            <p className="border-b border-line px-4 py-2.5 text-2xs font-medium uppercase tracking-wide text-faint">Detalle por medio de pago</p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead><tr className="border-b border-line text-2xs uppercase tracking-wide text-faint">
                  <th className="px-4 py-2 font-medium">Medio</th>
                  <th className="px-3 py-2 text-right font-medium">%</th>
                  <th className="px-3 py-2 font-medium">Importe</th>
                </tr></thead>
                <tbody>
                  {data.porMedio.map((m) => (
                    <tr key={m.medio} className="border-b border-line/70 last:border-0 hover:bg-ink/[0.02]">
                      <td className="px-4 py-2 text-ink">{m.medio} <span className="ml-1 text-2xs text-faint">· {m.familia}</span></td>
                      <td className="px-3 py-2 text-right font-mono text-2xs text-muted">{pct(m.pct)}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-ink/10"><div className="h-full rounded-full bg-action/70" style={{ width: `${Math.max(2, (m.importe / maxMedio) * 100)}%` }} /></div>
                          <span className="font-mono text-xs font-medium text-ink">{moneyC(m.importe)}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card></div>

          {/* Por día */}
          <Card className="p-4">
            <p className="mb-3 text-2xs font-medium uppercase tracking-wide text-faint">Cobros por día</p>
            <div className="flex items-end gap-0.5" style={{ height: 96 }}>
              {data.porDia.map((d) => (
                <div key={d.fecha} className="group relative flex-1" title={`${d.fecha}: ${money(d.importe)}`}>
                  <div className="w-full rounded-t bg-action/70 group-hover:bg-action" style={{ height: `${Math.max(2, (d.importe / maxDia) * 96)}px` }} />
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

function famPct(data: ResumenCobros, familia: string): number {
  return data.porFamilia.find((f) => f.familia === familia)?.pct ?? 0;
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
