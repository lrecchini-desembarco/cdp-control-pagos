"use client";

import { useEffect, useState } from "react";
import { Card, ErrorState, Skeleton } from "@/components/ui/primitives";
import type { ResumenAnulados } from "@/lib/anulados";

const money = (n: number) => "$" + Math.round(n).toLocaleString("es-AR");
const moneyC = (n: number) => {
  const a = Math.abs(n);
  const s = a >= 1e9 ? (n / 1e9).toFixed(2).replace(".", ",") + " mil M" : a >= 1e6 ? (n / 1e6).toFixed(1).replace(".", ",") + " M" : a >= 1e3 ? Math.round(n / 1e3) + " k" : String(Math.round(n));
  return "$" + s;
};
const int = (n: number) => Math.round(n).toLocaleString("es-AR");
const pct = (n: number) => (n * 100).toFixed(n >= 0.1 ? 0 : 1) + "%";
const hh = (h: number) => String(h).padStart(2, "0") + "h";
const PERIODOS: [number, string][] = [[7, "7 días"], [15, "15 días"], [30, "30 días"], [60, "60 días"]];

export default function AnuladosView() {
  const [dias, setDias] = useState(30);
  const [data, setData] = useState<ResumenAnulados | null>(null);
  const [estado, setEstado] = useState<"cargando" | "ok" | "error">("cargando");
  const [err, setErr] = useState("");

  async function cargar(d = dias) {
    setEstado("cargando");
    try {
      const j = await (await fetch(`/api/anulados?dias=${d}`, { cache: "no-store" })).json();
      if (!j.ok) throw new Error(j.error || "No se pudo cargar.");
      setData(j as ResumenAnulados); setEstado("ok");
    } catch (e) { setErr(e instanceof Error ? e.message : "Error"); setEstado("error"); }
  }
  useEffect(() => { cargar(dias); }, [dias]);

  const tipoImp = (t: string) => data?.porTipo.find((x) => x.tipo === t)?.importe ?? 0;
  const maxProd = Math.max(1, ...(data?.porProducto.map((p) => p.importe) ?? [1]));
  const maxLocal = Math.max(1, ...(data?.porLocal.map((l) => l.importe) ?? [1]));
  const maxHora = Math.max(1, ...(data?.porHora.map((h) => h.importe) ?? [1]));
  const maxResp = Math.max(1, ...(data?.porResponsable.map((r) => r.importe) ?? [1]));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold text-ink">Anulados y devoluciones</h1>
          <p className="mt-0.5 max-w-2xl text-sm text-muted">Cuánta plata se anula, devuelve o invita (comp) — sobre qué productos, cuándo, en qué local y quién autoriza. Control anti-fuga, de las comandas de Tango.</p>
        </div>
        <div data-tour="anul-periodo" className="flex gap-1">
          {PERIODOS.map(([d, l]) => (
            <button key={d} onClick={() => setDias(d)} className={`rounded-md px-2.5 py-1 text-2xs font-medium ${dias === d ? "bg-ink/[0.06] text-ink" : "text-muted hover:bg-ink/[0.03]"}`}>{l}</button>
          ))}
        </div>
      </div>

      {estado === "cargando" && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}</div>}
      {estado === "error" && <ErrorState msg={err} onRetry={() => cargar()} />}

      {estado === "ok" && data && (
        <>
          <div data-tour="anul-kpis" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Total anulado/devuelto" value={moneyC(data.total)} full={money(data.total)} sub={`${int(data.totalN)} movimientos`} tone="bad" />
            <Kpi label="Anulado" value={moneyC(tipoImp("Anulado"))} full={money(tipoImp("Anulado"))} />
            <Kpi label="Devolución" value={moneyC(tipoImp("Devolución"))} full={money(tipoImp("Devolución"))} />
            <Kpi label="Invitación (comp)" value={moneyC(tipoImp("Invitación"))} full={money(tipoImp("Invitación"))} />
          </div>

          <div className="rounded-md border border-line bg-ink/[0.02] px-3 py-2 text-2xs text-muted">
            💡 El monto, producto, hora y local son exactos. El <b>“responsable”</b> Tango lo carga parcial (mucho “sin dato” o por rol); el mejor dato de control es <b>“quién autoriza”</b>.
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Por producto */}
            <div data-tour="anul-producto"><Card className="overflow-hidden">
              <p className="border-b border-line px-4 py-2.5 text-2xs font-medium uppercase tracking-wide text-faint">Qué se anula/devuelve más (por producto)</p>
              <div className="max-h-80 overflow-auto">
                <Tabla filas={data.porProducto.slice(0, 40).map((p) => ({ k: p.clave, imp: p.importe, n: p.n }))} max={maxProd} />
              </div>
            </Card></div>

            {/* Por local */}
            <div data-tour="anul-local"><Card className="overflow-hidden">
              <p className="border-b border-line px-4 py-2.5 text-2xs font-medium uppercase tracking-wide text-faint">Por local ({data.porLocal.length})</p>
              <div className="max-h-80 overflow-auto">
                <Tabla filas={data.porLocal.map((l) => ({ k: l.local, imp: l.importe, n: l.n }))} max={maxLocal} />
              </div>
            </Card></div>
          </div>

          {/* Por hora */}
          <Card className="p-4" >
            <p className="mb-3 text-2xs font-medium uppercase tracking-wide text-faint">Por hora — cuándo se concentran</p>
            <div className="flex items-end gap-1" style={{ height: 100 }}>
              {data.porHora.map((h) => (
                <div key={h.hora} className="group relative flex flex-1 flex-col items-center justify-end" title={`${hh(h.hora)}: ${money(h.importe)} · ${int(h.n)} mov`}>
                  <div className="w-full rounded-t bg-bad/60 group-hover:bg-bad" style={{ height: `${Math.max(1, (h.importe / maxHora) * 84)}px` }} />
                  <span className="mt-1 text-[9px] text-faint">{h.hora}</span>
                </div>
              ))}
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Responsable */}
            <div data-tour="anul-quien"><Card className="overflow-hidden">
              <p className="border-b border-line px-4 py-2.5 text-2xs font-medium uppercase tracking-wide text-faint">Responsable (quién anuló)</p>
              <div className="max-h-72 overflow-auto">
                <Tabla filas={data.porResponsable.map((r) => ({ k: r.clave, imp: r.importe, n: r.n }))} max={maxResp} />
              </div>
            </Card></div>

            {/* Autoriza */}
            <Card className="overflow-hidden">
              <p className="border-b border-line px-4 py-2.5 text-2xs font-medium uppercase tracking-wide text-faint">Quién autoriza las anulaciones ({data.porAutoriza.length})</p>
              <div className="max-h-72 overflow-auto">
                {data.porAutoriza.length === 0 ? (
                  <p className="px-4 py-6 text-center text-2xs text-faint">Sin autorizante cargado en el período.</p>
                ) : (
                  <table className="w-full text-left text-sm">
                    <tbody>
                      {data.porAutoriza.map((r) => (
                        <tr key={r.clave} className="border-b border-line/70 last:border-0 hover:bg-ink/[0.02]">
                          <td className="px-4 py-2 text-ink">{r.clave}</td>
                          <td className="px-3 py-2 text-right font-mono text-2xs text-muted">{int(r.n)} anul.</td>
                          <td className="px-3 py-2 text-right font-mono text-xs font-medium text-ink">{moneyC(r.importe)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function Tabla({ filas, max }: { filas: { k: string; imp: number; n: number }[]; max: number }) {
  return (
    <table className="w-full text-left text-sm">
      <tbody>
        {filas.map((f) => (
          <tr key={f.k} className="border-b border-line/70 last:border-0 hover:bg-ink/[0.02]">
            <td className="px-4 py-2 text-ink">{f.k}</td>
            <td className="px-3 py-2 text-right font-mono text-2xs text-muted">{int(f.n)}</td>
            <td className="px-3 py-2">
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-20 overflow-hidden rounded-full bg-ink/10"><div className="h-full rounded-full bg-bad/60" style={{ width: `${Math.max(2, (f.imp / max) * 100)}%` }} /></div>
                <span className="font-mono text-xs font-medium text-ink">{moneyC(f.imp)}</span>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Kpi({ label, value, sub, full, tone }: { label: string; value: string; sub?: string; full?: string; tone?: "bad" }) {
  return (
    <Card className="p-3.5">
      <p className="text-2xs font-medium uppercase tracking-wide text-faint">{label}</p>
      <p className={`mt-1 font-display text-2xl font-semibold ${tone === "bad" ? "text-bad" : "text-ink"}`} title={full}>{value}</p>
      {sub && <p className="mt-0.5 text-2xs text-muted">{sub}</p>}
    </Card>
  );
}
