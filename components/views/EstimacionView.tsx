"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, ErrorState, Skeleton } from "@/components/ui/primitives";
import { descargarCSV } from "@/lib/exportar-csv";
import type { ResumenEstimacion } from "@/lib/estimacion";

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

const money = (n: number) => "$" + Math.round(n).toLocaleString("es-AR");
const moneyC = (n: number) => {
  const a = Math.abs(n);
  const s = a >= 1e9 ? (n / 1e9).toFixed(2).replace(".", ",") + " mil M" : a >= 1e6 ? (n / 1e6).toFixed(1).replace(".", ",") + " M" : a >= 1e3 ? Math.round(n / 1e3) + " k" : String(Math.round(n));
  return "$" + s;
};
const int = (n: number) => Math.round(n).toLocaleString("es-AR");
const num1 = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 1 });
const pct = (n: number) => (n * 100).toFixed(0) + "%";
const dm = (f: string) => { const [, m, d] = f.split("-"); return `${d}/${m}`; };
const HOR: [number, string][] = [[7, "próx. 7 días"], [14, "próx. 14 días"], [30, "próx. 30 días"]];

export default function EstimacionView() {
  const [dias, setDias] = useState(7);
  const [sucursal, setSucursal] = useState("");
  const [data, setData] = useState<ResumenEstimacion | null>(null);
  const [sucursales, setSucursales] = useState<string[]>([]);
  const [estado, setEstado] = useState<"cargando" | "ok" | "error">("cargando");
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");

  async function cargar(d = dias, suc = sucursal) {
    setEstado("cargando");
    try {
      const qs = new URLSearchParams({ dias: String(d) }); if (suc) qs.set("sucursal", suc);
      const j = await (await fetch(`/api/estimacion?${qs}`, { cache: "no-store" })).json();
      if (!j.ok) throw new Error(j.error || "No se pudo cargar.");
      setData(j as ResumenEstimacion);
      if ((j.sucursales?.length ?? 0) > sucursales.length) setSucursales(j.sucursales);
      setEstado("ok");
    } catch (e) { setErr(e instanceof Error ? e.message : "Error"); setEstado("error"); }
  }
  useEffect(() => { cargar(dias, sucursal); /* eslint-disable-next-line */ }, [dias, sucursal]);

  const maxCosto = Math.max(1, ...(data?.porInsumo.map((i) => i.costo) ?? [1]));
  const filtro = norm(q.trim());
  const insumos = useMemo(() => {
    if (!data) return [];
    if (!filtro) return data.porInsumo;
    return data.porInsumo.filter((i) => norm(i.nombre + " " + i.proveedor).includes(filtro));
  }, [data, filtro]);
  function exportar() {
    if (!data) return;
    descargarCSV(`estimacion-insumos-${data.futDesde}_${data.futHasta}${sucursal ? "-" + sucursal : ""}.csv`,
      ["insumo", "proveedor", "presentacion", "cantidad", "bultos_aprox", "costo_estimado"],
      insumos.map((i) => [i.nombre, i.proveedor, i.presentacion, Math.round(i.cantidad * 100) / 100, Math.round(i.bultos * 100) / 100, Math.round(i.costo)]));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold text-ink">Estimación de insumos</h1>
          <p className="mt-0.5 max-w-2xl text-sm text-muted">Cuánto de cada insumo vas a necesitar, pronosticando las ventas por día de semana y traduciéndolas con las recetas. Para planificar compras.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div data-tour="est-horizonte" className="flex gap-1">
            {HOR.map(([d, l]) => (
              <button key={d} onClick={() => setDias(d)} className={`rounded-md px-2.5 py-1 text-2xs font-medium ${dias === d ? "bg-ink/[0.06] text-ink" : "text-muted hover:bg-ink/[0.03]"}`}>{l}</button>
            ))}
          </div>
          <select data-tour="est-local" value={sucursal} onChange={(e) => setSucursal(e.target.value)} className="rounded-md border border-line bg-surface px-2 py-1 text-2xs text-ink">
            <option value="">Todos los locales</option>
            {sucursales.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {estado === "cargando" && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}</div>}
      {estado === "error" && <ErrorState msg={err} onRetry={() => cargar()} />}

      {estado === "ok" && data && (
        <>
          <div data-tour="est-kpis" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Costo estimado de insumos" value={moneyC(data.totalCosto)} full={money(data.totalCosto)} sub={`${dm(data.futDesde)} → ${dm(data.futHasta)}`} />
            <Kpi label="Insumos" value={int(data.porInsumo.length)} sub="a reponer" />
            <Kpi label="Unidades pronosticadas" value={int(data.totalUnidades)} sub="de venta" />
            <Kpi label="Cobertura de receta" value={pct(data.cobertura.pct)} sub="de las ventas estimables" tone={data.cobertura.pct < 0.5 ? "warn" : undefined} />
          </div>

          <div className="rounded-md border border-line bg-ink/[0.02] px-3 py-2 text-2xs text-muted">
            💡 Pronóstico por <b>día de semana</b> (mismos días recientes pesan más), historia {dm(data.histDesde)}–{dm(data.histHasta)}. Solo se estima lo que <b>tiene receta</b> ({pct(data.cobertura.pct)} de las ventas); el resto se lista abajo como "sin receta". El clima y días especiales se suman en una próxima versión.
          </div>

          {/* Por insumo */}
          <div data-tour="est-insumos"><Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2">
              <p className="text-2xs font-medium uppercase tracking-wide text-faint">Insumos a reponer ({insumos.length})</p>
              <div className="flex items-center gap-2">
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar insumo o proveedor…" className="w-48 rounded-md border border-line bg-surface px-2.5 py-1 text-2xs text-ink placeholder:text-faint focus:border-action" />
                <button onClick={exportar} className="rounded-md border border-line bg-surface px-2.5 py-1 text-2xs font-medium text-action hover:bg-action/5">Exportar CSV</button>
              </div>
            </div>
            <div className="max-h-[32rem] overflow-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-surface"><tr className="border-b border-line text-2xs uppercase tracking-wide text-faint">
                  <th className="px-4 py-2 font-medium">Insumo</th>
                  <th className="px-3 py-2 font-medium">Proveedor</th>
                  <th className="px-3 py-2 text-right font-medium">Cantidad</th>
                  <th className="px-3 py-2 text-right font-medium">Bultos aprox.</th>
                  <th className="px-3 py-2 font-medium">Costo estimado</th>
                </tr></thead>
                <tbody>
                  {insumos.length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-2xs text-faint">{q ? `Ningún insumo coincide con “${q}”.` : "Sin insumos estimables. ¿Hay ventas y recetas cargadas para este filtro?"}</td></tr>
                  ) : insumos.map((i) => (
                    <tr key={i.cod} className="border-b border-line/70 last:border-0 hover:bg-ink/[0.02]">
                      <td className="px-4 py-2 text-ink">{i.nombre} {i.presentacion && <span className="ml-1 text-2xs text-faint">· {i.presentacion}</span>}</td>
                      <td className="px-3 py-2 text-2xs text-muted">{i.proveedor || "—"}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-ink">{num1(i.cantidad)}</td>
                      <td className="px-3 py-2 text-right font-mono text-2xs text-muted">{i.bultos ? "≈ " + num1(i.bultos) : "—"}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-ink/10"><div className="h-full rounded-full bg-action/70" style={{ width: `${Math.max(2, (i.costo / maxCosto) * 100)}%` }} /></div>
                          <span className="font-mono text-xs font-medium text-ink">{money(i.costo)}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card></div>

          {/* Sin receta */}
          {data.sinReceta.length > 0 && (
            <Card className="overflow-hidden">
              <p className="border-b border-line px-4 py-2.5 text-2xs font-medium uppercase tracking-wide text-warn">Ventas sin receta — no estimables ({data.sinReceta.length})</p>
              <div className="max-h-64 overflow-auto">
                <table className="w-full text-left text-sm">
                  <tbody>
                    {data.sinReceta.map((p) => (
                      <tr key={p.sku} className="border-b border-line/70 last:border-0">
                        <td className="px-4 py-2 text-ink">{p.nombre}</td>
                        <td className="px-3 py-2 text-right font-mono text-2xs text-muted">≈ {int(p.unidades)} u pronost.</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="border-t border-line px-4 py-2 text-2xs text-faint">Cargá su receta en Recetas para que entren a la estimación.</p>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, sub, full, tone }: { label: string; value: string; sub?: string; full?: string; tone?: "warn" }) {
  return (
    <Card className="p-3.5">
      <p className="text-2xs font-medium uppercase tracking-wide text-faint">{label}</p>
      <p className={`mt-1 font-display text-2xl font-semibold ${tone === "warn" ? "text-warn" : "text-ink"}`} title={full}>{value}</p>
      {sub && <p className="mt-0.5 text-2xs text-muted">{sub}</p>}
    </Card>
  );
}
