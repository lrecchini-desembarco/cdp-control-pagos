"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, Field, inputClass, Skeleton } from "@/components/ui/primitives";
import { descargarCSV } from "@/lib/exportar-csv";

interface Insumo { code: string; nombre: string; }
interface LocalCmp { sucursal: string; tipo: "propio" | "franquicia"; operativo: boolean; porInsumo: Record<string, number>; pedido: number; venta: number; }
interface Resumen { insumos: Insumo[]; locales: LocalCmp[]; }

const fmt = (n: number) => Math.round(n).toLocaleString("es-AR");
const isoMinus = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };

export default function PedidosView() {
  const [desde, setDesde] = useState(isoMinus(6));
  const [hasta, setHasta] = useState(isoMinus(0));
  const [data, setData] = useState<Resumen | null>(null);
  const [estado, setEstado] = useState<"loading" | "ok" | "error">("loading");
  const [err, setErr] = useState("");
  const [tipo, setTipo] = useState<"todos" | "propio" | "franquicia">("todos");
  const [verNoOp, setVerNoOp] = useState(false);
  const [puedeEditar, setPuedeEditar] = useState(false);
  const [locales, setLocales] = useState<LocalCmp[]>([]);
  const [detalle, setDetalle] = useState<LocalCmp | null>(null);

  async function cargar(d = desde, h = hasta) {
    setEstado("loading"); setErr("");
    try {
      const j = await (await fetch(`/api/pedidos?desde=${d}&hasta=${h}`)).json();
      if (!j.ok) throw new Error(j.error || "No se pudo cargar.");
      setData(j); setLocales(j.locales); setEstado("ok");
    } catch (e) { setErr(e instanceof Error ? e.message : "Error."); setEstado("error"); }
  }
  useEffect(() => {
    cargar();
    // ¿puede editar? (admin/operaciones): el GET de config responde 200; comparacion -> 403.
    fetch("/api/locales-config").then((r) => setPuedeEditar(r.ok)).catch(() => {});
    // eslint-disable-next-line
  }, []);

  // Guardar override (tipo u operativo) de un local.
  async function guardar(nombre: string, patch: { tipo?: "propio" | "franquicia"; operativo?: boolean }) {
    // update optimista
    setLocales((ls) => ls.map((l) => (l.sucursal === nombre ? { ...l, ...patch } : l)));
    try {
      await fetch("/api/locales-config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nombre, ...patch }) });
    } catch {}
  }

  const filtrados = useMemo(() => {
    let ls = locales;
    if (!verNoOp) ls = ls.filter((l) => l.operativo);
    if (tipo !== "todos") ls = ls.filter((l) => l.tipo === tipo);
    return ls;
  }, [locales, tipo, verNoOp]);

  const kpis = useMemo(() => {
    const ped = filtrados.reduce((s, l) => s + l.pedido, 0);
    const ven = filtrados.reduce((s, l) => s + l.venta, 0);
    const prop = filtrados.filter((l) => l.tipo === "propio");
    return {
      pedido: ped, venta: ven,
      nLocales: filtrados.length,
      pedidoProp: prop.reduce((s, l) => s + l.pedido, 0),
      pedidoFranq: ped - prop.reduce((s, l) => s + l.pedido, 0),
    };
  }, [filtrados]);

  function exportar() {
    if (!data) return;
    const cols = ["Local", "Tipo", "Operativo", ...data.insumos.map((i) => i.nombre), "Pedido CDP", "Venta (u)", "Pedido/Venta %"];
    const filas = filtrados.map((l) => [
      l.sucursal, l.tipo, l.operativo ? "sí" : "no",
      ...data.insumos.map((i) => Math.round(l.porInsumo[i.code] ?? 0)),
      Math.round(l.pedido), Math.round(l.venta),
      l.venta ? Math.round((l.pedido / l.venta) * 100) : "",
    ]);
    descargarCSV("cdp_vs_ventas_por_local", cols, filas);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold text-ink">CDP vs Ventas por local</h1>
          <p className="mt-0.5 max-w-2xl text-sm text-muted">
            Lo que cada local <b>pidió al CDP</b> (Raven, en vivo: Bolas + Tuki) contra lo que <b>vendió</b> (Tango),
            separado por <b>propios vs franquicias</b>. {puedeEditar && "Podés reclasificar y marcar locales no operativos."}
          </p>
        </div>
        <button onClick={exportar} disabled={!filtrados.length}
          className="shrink-0 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:border-action/40 hover:text-action disabled:opacity-40">
          ⬇ Exportar
        </button>
      </div>

      <Card className="p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Desde"><input type="date" className={inputClass} value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} /></Field>
          <Field label="Hasta"><input type="date" className={inputClass} value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} /></Field>
          <div className="flex items-end">
            <button onClick={() => cargar()} className="rounded-lg bg-action px-4 py-2 text-sm font-medium text-white hover:bg-action-700">Actualizar</button>
          </div>
          <Field label="Tipo">
            <select className={inputClass} value={tipo} onChange={(e) => setTipo(e.target.value as any)}>
              <option value="todos">Todos</option>
              <option value="propio">Solo propios</option>
              <option value="franquicia">Solo franquicias</option>
            </select>
          </Field>
          <label className="flex items-end gap-2 pb-2 text-sm text-ink">
            <input type="checkbox" checked={verNoOp} onChange={(e) => setVerNoOp(e.target.checked)} />
            Ver no operativos
          </label>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Pedido al CDP" value={fmt(kpis.pedido)} sub="unidades insumo" />
        <Kpi label="Venta (Tango)" value={fmt(kpis.venta)} sub="unidades vendidas" />
        <Kpi label="Locales" value={String(kpis.nLocales)} />
        <Kpi label="Pedido propios / franq." value={`${fmt(kpis.pedidoProp)} / ${fmt(kpis.pedidoFranq)}`} sub="unidades" />
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
                  <th className="px-3 py-2 text-center font-medium">Oper.</th>
                  {data?.insumos.map((i) => <th key={i.code} className="px-3 py-2 text-right font-medium">{i.nombre}</th>)}
                  <th className="px-4 py-2 text-right font-medium">Pedido</th>
                  <th className="px-4 py-2 text-right font-medium">Venta</th>
                  <th className="px-4 py-2 text-right font-medium">Ped/Vta</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.length === 0 ? (
                  <tr><td colSpan={(data?.insumos.length ?? 0) + 6} className="px-4 py-6 text-center text-faint">Sin locales en el filtro.</td></tr>
                ) : filtrados.slice(0, 600).map((l) => (
                  <tr key={l.sucursal} onClick={() => setDetalle(l)}
                    className={`cursor-pointer border-b border-line last:border-0 hover:bg-ink/5 ${!l.operativo ? "opacity-45" : ""}`}>
                    <td className="px-4 py-2 text-ink">{l.sucursal}{!l.operativo && <span className="ml-1 text-2xs text-bad">· no op.</span>}</td>
                    <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
                      {puedeEditar ? (
                        <select value={l.tipo} onChange={(e) => guardar(l.sucursal, { tipo: e.target.value as any })}
                          className={`rounded border border-line bg-surface px-1.5 py-0.5 text-2xs ${l.tipo === "propio" ? "text-action" : "text-muted"}`}>
                          <option value="propio">Propio</option>
                          <option value="franquicia">Franquicia</option>
                        </select>
                      ) : (
                        <span className={`rounded-full px-2 py-0.5 text-2xs font-medium ${l.tipo === "propio" ? "bg-action/10 text-action" : "bg-ink/5 text-muted"}`}>{l.tipo === "propio" ? "Propio" : "Franquicia"}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={l.operativo} disabled={!puedeEditar}
                        onChange={(e) => guardar(l.sucursal, { operativo: e.target.checked })} title="Operativo" />
                    </td>
                    {data?.insumos.map((i) => <td key={i.code} className="px-3 py-2 text-right font-mono tnum text-muted">{fmt(l.porInsumo[i.code] ?? 0)}</td>)}
                    <td className="px-4 py-2 text-right font-mono tnum font-semibold text-ink">{fmt(l.pedido)}</td>
                    <td className="px-4 py-2 text-right font-mono tnum text-muted">{fmt(l.venta)}</td>
                    <td className="px-4 py-2 text-right font-mono tnum text-faint">{l.venta ? `${Math.round((l.pedido / l.venta) * 100)}%` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="text-2xs text-faint">
        Datos reales: <b>Pedido</b> = Raven (Bolas + Tuki). <b>Venta</b> = unidades vendidas en Tango (todos los productos).
        "Ped/Vta" es un indicador relativo (el detalle unidad-a-unidad por insumo necesita la receta de menú).
        Clasificación propio/franquicia del maestro oficial; {puedeEditar ? "editable acá" : "solo lectura para tu rol"}.
      </p>

      {detalle && data && <DetalleLocal l={detalle} insumos={data.insumos} onClose={() => setDetalle(null)} />}
    </div>
  );
}

function DetalleLocal({ l, insumos, onClose }: { l: LocalCmp; insumos: Insumo[]; onClose: () => void }) {
  const maxPed = Math.max(1, ...insumos.map((i) => l.porInsumo[i.code] ?? 0));
  const ratio = l.venta ? Math.round((l.pedido / l.venta) * 100) : null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-card border border-line bg-surface p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-ink">{l.sucursal}</h2>
            <div className="mt-1 flex items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-2xs font-medium ${l.tipo === "propio" ? "bg-action/10 text-action" : "bg-ink/5 text-muted"}`}>{l.tipo === "propio" ? "Propio" : "Franquicia"}</span>
              <span className={`rounded-full px-2 py-0.5 text-2xs font-medium ${l.operativo ? "bg-ok/10 text-ok" : "bg-bad/10 text-bad"}`}>{l.operativo ? "Operativo" : "No operativo"}</span>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg px-2 text-lg text-muted hover:text-ink">✕</button>
        </div>

        {/* Pedido vs Venta */}
        <div className="mt-4 grid grid-cols-3 gap-3">
          <Kpi label="Pedido al CDP" value={fmt(l.pedido)} sub="u insumo" />
          <Kpi label="Venta (Tango)" value={fmt(l.venta)} sub="u vendidas" />
          <Kpi label="Pedido / Venta" value={ratio != null ? `${ratio}%` : "—"} />
        </div>

        {/* Desglose por insumo */}
        <p className="mt-4 mb-2 text-2xs font-medium uppercase tracking-wide text-faint">Pedido por insumo</p>
        <div className="space-y-2">
          {insumos.map((i) => {
            const v = l.porInsumo[i.code] ?? 0;
            return (
              <div key={i.code} className="flex items-center gap-3">
                <span className="w-40 shrink-0 truncate text-sm text-ink">{i.nombre}</span>
                <div className="relative h-2.5 flex-1 rounded bg-ink/[0.04]">
                  <div className="h-full rounded bg-action" style={{ width: `${(v / maxPed) * 100}%` }} />
                </div>
                <span className="w-16 shrink-0 text-right font-mono tnum text-sm text-ink">{fmt(v)}</span>
              </div>
            );
          })}
        </div>
        <p className="mt-4 text-2xs text-faint">
          El detalle unidad-a-unidad (venta traducida a insumo por receta) se habilita cuando esté la receta de menú.
        </p>
      </div>
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
