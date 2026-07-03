"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, Field, inputClass, Skeleton } from "@/components/ui/primitives";
import { descargarCSV } from "@/lib/exportar-csv";

interface Insumo { code: string; nombre: string; }
interface PedidoLocal { sucursal: string; propio: boolean; porInsumo: Record<string, number>; total: number; }
interface Resumen { insumos: Insumo[]; locales: PedidoLocal[]; totalPropios: number; totalNoPropios: number; total: number; }

const fmt = (n: number) => Math.round(n).toLocaleString("es-AR");
const isoMinus = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };

export default function PedidosView() {
  const [desde, setDesde] = useState(isoMinus(6));
  const [hasta, setHasta] = useState(isoMinus(0));
  const [data, setData] = useState<Resumen | null>(null);
  const [estado, setEstado] = useState<"loading" | "ok" | "error">("loading");
  const [err, setErr] = useState("");
  const [tipo, setTipo] = useState<"todos" | "propios" | "franquicias">("todos");

  async function cargar(d = desde, h = hasta) {
    setEstado("loading"); setErr("");
    try {
      const j = await (await fetch(`/api/pedidos?desde=${d}&hasta=${h}`)).json();
      if (!j.ok) throw new Error(j.error || "No se pudo cargar.");
      setData(j); setEstado("ok");
    } catch (e) { setErr(e instanceof Error ? e.message : "Error."); setEstado("error"); }
  }
  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, []);

  const locales = useMemo(() => {
    const all = data?.locales ?? [];
    return tipo === "propios" ? all.filter((l) => l.propio) : tipo === "franquicias" ? all.filter((l) => !l.propio) : all;
  }, [data, tipo]);

  const kpis = useMemo(() => {
    const total = locales.reduce((s, l) => s + l.total, 0);
    const propios = locales.filter((l) => l.propio);
    return {
      total,
      nLocales: locales.length,
      nPropios: propios.length,
      totalPropios: propios.reduce((s, l) => s + l.total, 0),
    };
  }, [locales]);

  function exportar() {
    if (!data) return;
    const cols = ["Local", "Tipo", ...data.insumos.map((i) => i.nombre), "Total pedido"];
    const filas = locales.map((l) => [
      l.sucursal, l.propio ? "Propio" : "Franquicia",
      ...data.insumos.map((i) => Math.round(l.porInsumo[i.code] ?? 0)),
      Math.round(l.total),
    ]);
    descargarCSV("pedidos_por_local", cols, filas);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold text-ink">Pedidos por local</h1>
          <p className="mt-0.5 max-w-2xl text-sm text-muted">
            Lo que cada local pidió al CDP (Raven, en vivo), separado por <b>propios vs franquicias</b>. Hoy trae
            Bolas Blend y Medallón Tuki (80g / 55g).
          </p>
        </div>
        <button onClick={exportar} disabled={!locales.length}
          className="shrink-0 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:border-action/40 hover:text-action disabled:opacity-40">
          ⬇ Exportar
        </button>
      </div>

      <Card className="p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Desde"><input type="date" className={inputClass} value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} /></Field>
          <Field label="Hasta"><input type="date" className={inputClass} value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} /></Field>
          <div className="flex items-end">
            <button onClick={() => cargar()} className="rounded-lg bg-action px-4 py-2 text-sm font-medium text-white hover:bg-action-700">Actualizar</button>
          </div>
          <Field label="Ver">
            <select className={inputClass} value={tipo} onChange={(e) => setTipo(e.target.value as any)}>
              <option value="todos">Todos</option>
              <option value="propios">Solo propios</option>
              <option value="franquicias">Solo franquicias</option>
            </select>
          </Field>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Total pedido" value={fmt(kpis.total)} sub="unidades" />
        <Kpi label="Locales" value={String(kpis.nLocales)} />
        <Kpi label="Propios" value={String(kpis.nPropios)} sub={`${fmt(kpis.totalPropios)} u`} />
        <Kpi label="Propios vs franq." value={kpis.total ? `${Math.round((kpis.totalPropios / kpis.total) * 100)}%` : "—"} sub="del total pedido" />
      </div>

      <Card className="overflow-hidden">
        {estado === "loading" ? (
          <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
        ) : estado === "error" ? (
          <div className="p-4 text-sm text-bad">{err}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-2xs uppercase tracking-wide text-faint">
                  <th className="px-4 py-2 font-medium">Local</th>
                  <th className="px-4 py-2 font-medium">Tipo</th>
                  {data?.insumos.map((i) => <th key={i.code} className="px-4 py-2 text-right font-medium">{i.nombre}</th>)}
                  <th className="px-4 py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {locales.length === 0 ? (
                  <tr><td colSpan={(data?.insumos.length ?? 0) + 3} className="px-4 py-6 text-center text-faint">Sin pedidos en el período.</td></tr>
                ) : locales.slice(0, 500).map((l) => (
                  <tr key={l.sucursal} className="border-b border-line last:border-0 hover:bg-ink/5">
                    <td className="px-4 py-2 text-ink">{l.sucursal}</td>
                    <td className="px-4 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-2xs font-medium ${l.propio ? "bg-action/10 text-action" : "bg-ink/5 text-muted"}`}>
                        {l.propio ? "Propio" : "Franquicia"}
                      </span>
                    </td>
                    {data?.insumos.map((i) => <td key={i.code} className="px-4 py-2 text-right font-mono tnum text-muted">{fmt(l.porInsumo[i.code] ?? 0)}</td>)}
                    <td className="px-4 py-2 text-right font-mono tnum font-semibold text-ink">{fmt(l.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="text-2xs text-faint">
        Datos reales de Raven (en vivo). La clasificación propio/franquicia sale de <code className="rounded bg-paper px-1">lib/propios.ts</code>
        {" "}(lista semilla, a confirmar/completar con operaciones). "Venta equivalente" (el cruce contra ventas) necesita la receta de menú.
      </p>
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="p-3">
      <p className="text-2xs uppercase tracking-wide text-faint">{label}</p>
      <p className="mt-0.5 font-display text-lg font-semibold text-ink">{value}</p>
      {sub && <p className="text-2xs text-faint">{sub}</p>}
    </Card>
  );
}
