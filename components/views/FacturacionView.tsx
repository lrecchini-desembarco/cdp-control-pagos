"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, Button, inputClass, Skeleton, EmptyState, Badge } from "@/components/ui/primitives";
import { descargarCSV } from "@/lib/exportar-csv";

interface FactProducto { sku: string; nombre: string; marca: string; unidades: number; precio: number; facturacion: number; acumulado?: number; clase?: "A" | "B" | "C"; costoUnit?: number; margen?: number; margenPct?: number; tieneCosto?: boolean; tieneReceta?: boolean; }
interface FactLocal { sucursal: string; marca: string; unidades: number; facturacion: number; cobertura: number; margen: number; }
interface FactMarca { marca: string; unidades: number; facturacion: number; }
interface FactTurno { turno: string; unidades: number; facturacion: number; }
interface FactDia { fecha: string; unidades: number; facturacion: number; }
interface Datos {
  ok: boolean; source: string; ventasSource?: string; preciosSource?: string; refFecha: string;
  total: number; unidades: number; unidadesConPrecio: number; cobertura: number; ticketProm: number;
  exacta?: boolean; coberturaImporte?: number;
  margenTotal: number; facturacionConCosto: number; coberturaCosto: number;
  abc: { a: number; b: number; c: number };
  porProducto: FactProducto[]; porLocal: FactLocal[]; porMarca: FactMarca[]; porTurno: FactTurno[]; porDia: FactDia[];
}

const TURNO_LABEL: Record<string, string> = { mediodia: "Mediodía", tarde: "Tarde", noche: "Noche" };
const claseTone = (c?: string) => (c === "A" ? "bg-ok/10 text-ok" : c === "B" ? "bg-warn/15 text-warn" : "bg-ink/5 text-muted");

const MARCAS: Record<string, string> = { desembarco: "El Desembarco", tasty: "Mr Tasty", mila: "Mila & Go" };
const marcaLabel = (m: string) => MARCAS[m] ?? m;
const int = (n: number) => Math.round(n).toLocaleString("es-AR");
const money = (n: number) => "$" + Math.round(n).toLocaleString("es-AR");
const moneyC = (n: number) =>
  n >= 1_000_000_000 ? "$" + (n / 1_000_000_000).toFixed(2).replace(".", ",") + " mil M"
    : n >= 1_000_000 ? "$" + (n / 1_000_000).toFixed(1).replace(".", ",") + " M"
    : n >= 1_000 ? "$" + Math.round(n / 1_000) + " k"
    : "$" + Math.round(n);
const fecha = (iso: string) => (iso ? new Date(iso + "T00:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" }) : "—");
const LIMITE = 300;

export default function FacturacionView() {
  const [d, setD] = useState<Datos | null>(null);
  const [estado, setEstado] = useState<"loading" | "ok" | "error">("loading");
  const [errMsg, setErrMsg] = useState("");
  const [tab, setTab] = useState<"productos" | "locales" | "marcas" | "sin-receta">("productos");
  const [marca, setMarca] = useState("");
  const [q, setQ] = useState("");
  const [dias, setDias] = useState(30);
  const [tendMetric, setTendMetric] = useState<"facturacion" | "unidades">("facturacion");
  const [localSel, setLocalSel] = useState<string | null>(null);
  const [localData, setLocalData] = useState<Datos | null>(null);
  const [localLoading, setLocalLoading] = useState(false);

  async function abrirLocal(sucursal: string) {
    setLocalSel(sucursal); setLocalData(null); setLocalLoading(true);
    try {
      const j = await (await fetch(`/api/facturacion?dias=${dias}&sucursal=${encodeURIComponent(sucursal)}`)).json();
      if (j.ok) setLocalData(j);
    } finally { setLocalLoading(false); }
  }

  async function cargar(d = dias) {
    setEstado("loading");
    try {
      const j: Datos = await (await fetch(`/api/facturacion?dias=${d}`)).json();
      if (!j.ok) throw new Error((j as any).error || "No se pudo cargar.");
      setD(j); setEstado("ok");
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : "Error"); setEstado("error");
    }
  }
  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, []);

  // Lo real acá es ventas+precios (Tango), no el DATA_SOURCE global.
  const esMock = d?.ventasSource === "mock" || d?.preciosSource === "mock";

  const productos = useMemo(() => {
    let l = d?.porProducto ?? [];
    if (marca) l = l.filter((x) => x.marca === marca);
    const t = q.trim().toLowerCase();
    if (t) l = l.filter((x) => `${x.sku} ${x.nombre}`.toLowerCase().includes(t));
    return l;
  }, [d, marca, q]);
  const locales = useMemo(() => {
    let l = d?.porLocal ?? [];
    if (marca) l = l.filter((x) => x.marca === marca);
    const t = q.trim().toLowerCase();
    if (t) l = l.filter((x) => x.sucursal.toLowerCase().includes(t));
    return l;
  }, [d, marca, q]);

  // Chips de marca según lo que realmente hay en los datos (ej. Mila & Go no aparece
  // si no está en Tango, en vez de un filtro que siempre da 0).
  const marcasChips = useMemo(() => ["", ...(d?.porMarca ?? []).map((m) => m.marca)], [d]);

  // Productos que facturan pero NO tienen receta cargada (el hueco del margen). Ordenados por $.
  // OJO: "sin receta" = la receta no existe. Los que SÍ tienen receta pero le falta un insumo
  // en el maestro NO van acá: son "receta incompleta" (existen, hay que completarlas, no crearlas).
  const sinReceta = useMemo(() => productos.filter((p) => !p.tieneReceta).sort((a, b) => b.facturacion - a.facturacion), [productos]);
  const factSinReceta = useMemo(() => sinReceta.reduce((s, p) => s + p.facturacion, 0), [sinReceta]);
  const incompletas = useMemo(() => productos.filter((p) => p.tieneReceta && !p.tieneCosto), [productos]);

  const totalFilt = useMemo(() => (tab === "locales" ? locales : tab === "sin-receta" ? sinReceta : productos).reduce((s, x) => s + x.facturacion, 0), [tab, locales, productos, sinReceta]);

  function exportar() {
    if (tab === "locales") {
      descargarCSV("facturacion-locales", ["Local", "Marca", "Unidades", "Facturación estimada", "Margen bruto", "Cobertura %"],
        locales.map((l) => [l.sucursal, marcaLabel(l.marca), l.unidades, Math.round(l.facturacion), Math.round(l.margen), (l.cobertura * 100).toFixed(0)]));
    } else if (tab === "sin-receta") {
      descargarCSV("facturacion-sin-receta", ["SKU", "Producto", "Marca", "Unidades", "Precio", "Facturación estimada"],
        sinReceta.map((p) => [p.sku, p.nombre, marcaLabel(p.marca), p.unidades, Math.round(p.precio), Math.round(p.facturacion)]));
    } else if (tab === "productos") {
      descargarCSV("facturacion-productos", ["SKU", "Producto", "Marca", "Clase ABC", "Unidades", "Precio", "Facturación estimada", "Margen bruto", "Margen %"],
        productos.map((p) => [p.sku, p.nombre, marcaLabel(p.marca), p.clase ?? "", p.unidades, Math.round(p.precio), Math.round(p.facturacion), p.tieneCosto ? Math.round(p.margen ?? 0) : "", p.tieneCosto ? Math.round((p.margenPct ?? 0) * 100) : ""]));
    } else {
      descargarCSV("facturacion-marcas", ["Marca", "Unidades", "Facturación estimada"],
        (d?.porMarca ?? []).map((m) => [marcaLabel(m.marca), m.unidades, Math.round(m.facturacion)]));
    }
  }

  const maxFactProd = Math.max(1, ...productos.slice(0, LIMITE).map((p) => p.facturacion));
  const maxFactLoc = Math.max(1, ...locales.map((l) => l.facturacion));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold text-ink">Facturación</h1>
          <p className="mt-0.5 max-w-2xl text-sm text-muted">
            Cuánta plata mueve cada producto, local y marca.{" "}
            {d?.exacta
              ? "Importe real de cada comanda de Tango (IMPORTE_NETO)."
              : "Estimada con datos reales de Tango (precio × unidades)."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label data-tour="fact-periodo" className="flex items-center gap-1.5 text-2xs text-muted">
            Período
            <select className="rounded-md border border-line bg-surface px-2 py-1 text-2xs text-ink"
              value={dias} onChange={(e) => { const v = Number(e.target.value); setDias(v); cargar(v); }}>
              {[7, 15, 30].map((n) => <option key={n} value={n}>{n} días</option>)}
            </select>
          </label>
          {esMock ? <Badge tone="warn">datos de ejemplo</Badge> : <Badge tone="ok">en vivo · {d?.exacta ? "exacta" : "estimada"}</Badge>}
          {d && <span className="text-2xs text-faint">al {fecha(d.refFecha)}</span>}
        </div>
      </div>

      {/* Aviso: es estimada (precio efectivo, no el importe exacto de Tango) */}
      <Card className="border-l-4 border-l-action/50 bg-action/5 p-3">
        {d?.exacta ? (
          <p className="text-xs text-ink">
            <b className="text-action-700">Exacta:</b> el <b>importe real</b> de cada comanda que registró Tango (IMPORTE_NETO), no un estimado.
            El <b>margen bruto</b> = facturación − costo de receta (del módulo Costos); solo cubre lo que tiene receta cargada (mirá la cobertura).
          </p>
        ) : (
          <p className="text-xs text-ink">
            <b className="text-action-700">Estimada:</b> unidades reales × <b>precio efectivo</b> (última venta registrada por Tango), no el
            importe exacto de cada comanda. Es muy fiel para períodos recientes. La facturación <b>exacta</b> se activa cuando Sistemas
            exponga <code className="rounded bg-paper px-1">IMPORTE_NETO</code> (ya está el SQL listo) — y esta pantalla la toma sola.
            El <b>margen bruto</b> = facturación − costo de receta (del módulo Costos); solo cubre lo que tiene receta cargada (mirá la cobertura).
          </p>
        )}
      </Card>

      {/* KPIs */}
      <div data-tour="fact-kpis" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={d?.exacta ? "Facturación" : "Facturación estimada"} value={d ? moneyC(d.total) : "—"} full={d ? money(d.total) : undefined} tone="ok" sub={`últimos ${dias} días`} sensible />
        <Kpi label={d?.exacta ? "Margen bruto" : "Margen bruto estimado"} value={d ? moneyC(d.margenTotal) : "—"} full={d ? money(d.margenTotal) : undefined} tone={d ? "ok" : undefined}
          sub={d ? `${d.facturacionConCosto ? Math.round((d.margenTotal / d.facturacionConCosto) * 100) : 0}% · ${Math.round(d.coberturaCosto * 100)}% con receta` : "facturación − costo"} sensible />
        <Kpi label="$ por unidad" value={d ? money(d.ticketProm) : "—"} sub={d ? `${int(d.unidades)} unidades` : "precio promedio"} sensible />
        <Kpi label="Cobertura precio" value={d ? `${Math.round(d.cobertura * 100)}%` : "—"} tone={d && d.cobertura < 0.9 ? "warn" : undefined} sub="unidades con precio" />
      </div>

      {/* Facturación por turno */}
      {d && d.porTurno.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {d.porTurno.map((t) => (
            <Card key={t.turno} className="group p-3">
              <p className="text-2xs uppercase tracking-wide text-faint">{TURNO_LABEL[t.turno] ?? t.turno}</p>
              <p className="mt-0.5 font-display text-lg font-semibold text-ink"><MontoDual compact={moneyC(t.facturacion)} full={money(t.facturacion)} sensible /></p>
              <p className="text-2xs text-faint">{int(t.unidades)} u · {d.total ? Math.round((t.facturacion / d.total) * 100) : 0}% del total</p>
            </Card>
          ))}
        </div>
      )}

      {/* Tendencia diaria */}
      {d && d.porDia.length > 1 && (
        <Card className="p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-2xs font-medium uppercase tracking-wide text-faint">Tendencia diaria</p>
            <div className="flex gap-1">
              {([["facturacion", "Facturación"], ["unidades", "Unidades"]] as const).map(([id, label]) => (
                <button key={id} onClick={() => setTendMetric(id)}
                  className={`rounded-md border px-2 py-0.5 text-2xs font-medium ${tendMetric === id ? "border-action bg-action/10 text-action" : "border-line bg-surface text-muted hover:text-ink"}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <TendenciaChart dias={d.porDia} metric={tendMetric} />
        </Card>
      )}

      {/* Tabs */}
      <div data-tour="fact-tabs" className="flex gap-1.5">
        {([
          ["productos", "Por producto"],
          ["locales", "Por local"],
          ["marcas", "Por marca"],
          ["sin-receta", `Sin receta${sinReceta.length ? ` (${sinReceta.length})` : ""}`],
        ] as [typeof tab, string][]).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`rounded-lg border px-3.5 py-1.5 text-sm font-medium ${tab === id ? "border-action bg-action/10 text-action" : "border-line bg-surface text-muted hover:text-ink"}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Filtros */}
      {tab !== "marcas" && (
        <Card className="flex flex-wrap items-center gap-3 p-3">
          <div className="flex flex-wrap gap-1.5">
            {marcasChips.map((id) => (
              <button key={id} onClick={() => setMarca(id)}
                className={`rounded-full border px-3 py-1 text-2xs font-medium ${marca === id ? "border-action bg-action/10 text-action" : "border-line bg-surface text-muted hover:text-ink"}`}>
                {id === "" ? "Todas" : marcaLabel(id)}
              </button>
            ))}
          </div>
          <input className={`${inputClass} max-w-[220px] py-1`} placeholder={tab === "productos" ? "Buscar producto…" : "Buscar local…"} value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="ml-auto flex items-center gap-3">
            <span className="text-2xs text-faint">{tab === "productos" ? `${productos.length} productos` : tab === "sin-receta" ? `${sinReceta.length} sin receta` : `${locales.length} locales`} · {money(totalFilt)}</span>
            <Button variant="outline" onClick={exportar} disabled={estado !== "ok"}>⬇ Exportar</Button>
          </div>
        </Card>
      )}

      <Card className="overflow-hidden">
        {estado === "loading" ? (
          <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
        ) : estado === "error" ? (
          <div className="p-4 text-sm text-bad">No se pudo cargar la facturación. {errMsg}</div>
        ) : tab === "productos" ? (
          productos.length === 0 ? <EmptyState title="Sin productos" desc="No hay ventas para ese filtro." /> : (
            <>
            <p className="border-b border-line px-4 py-2 text-2xs text-muted">
              <b className="text-ok">Curva ABC:</b> {productos.filter((p) => p.clase === "A").length} producto(s) <b className="text-ok">A</b> hacen el grueso (hasta 80%) ·{" "}
              {productos.filter((p) => p.clase === "B").length} <b className="text-warn">B</b> (80–95%) ·{" "}
              {productos.filter((p) => p.clase === "C").length} <b className="text-muted">C</b> (la cola larga).
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead><tr className="border-b border-line text-2xs uppercase tracking-wide text-faint">
                  <th className="px-4 py-2 font-medium">#</th><th className="px-3 py-2 font-medium">Producto</th>
                  <th className="px-3 py-2 text-right font-medium">Unidades</th><th className="px-3 py-2 text-right font-medium">Precio</th>
                  <th className="px-3 py-2 font-medium">Facturación estimada</th><th className="px-3 py-2 text-right font-medium">Margen bruto</th>
                </tr></thead>
                <tbody>
                  {productos.slice(0, LIMITE).map((p, i) => (
                    <tr key={p.sku} className="border-b border-line/70 last:border-0 hover:bg-ink/[0.02]">
                      <td className="px-4 py-2 text-2xs text-faint tnum">{i + 1}</td>
                      <td className="px-3 py-2">
                        <span className={`mr-1.5 inline-block rounded px-1 py-px text-[9px] font-bold ${claseTone(p.clase)}`} title={`Clase ${p.clase} · acumulado ${Math.round((p.acumulado ?? 0) * 100)}%`}>{p.clase}</span>
                        <span className="font-medium text-ink">{p.nombre}</span><span className="ml-2 font-mono text-2xs text-faint">{p.sku}</span><span className="ml-2 text-2xs text-faint">{marcaLabel(p.marca)}</span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono tnum text-muted">{int(p.unidades)}</td>
                      <td className="px-3 py-2 text-right font-mono tnum text-muted"><span className="monto">{p.precio ? money(p.precio) : "—"}</span></td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-28 overflow-hidden rounded-full bg-ink/10"><div className="h-full rounded-full bg-ok/80" style={{ width: `${Math.max(2, (p.facturacion / maxFactProd) * 100)}%` }} /></div>
                          <span className="font-mono tnum font-medium text-ink monto">{money(p.facturacion)}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right">
                        {p.tieneCosto
                          ? <span className={`font-mono tnum font-medium ${(p.margen ?? 0) < 0 ? "text-bad" : "text-ok"}`}><span className="monto">{money(p.margen ?? 0)}</span> <span className="text-2xs text-faint">{Math.round((p.margenPct ?? 0) * 100)}%</span></span>
                          : p.tieneReceta
                            ? <span className="text-2xs text-warn" title="Tiene receta cargada pero le falta un insumo en el maestro para poder costearla. Completá el insumo en Insumos.">receta incompleta</span>
                            : <span className="text-2xs text-faint" title="No hay ninguna receta cargada para este producto">sin receta</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {productos.length > LIMITE && <p className="border-t border-line px-4 py-2.5 text-2xs text-faint">Mostrando los {LIMITE} de {int(productos.length)}. Exportá para ver todo.</p>}
            </div>
            </>
          )
        ) : tab === "locales" ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b border-line text-2xs uppercase tracking-wide text-faint">
                <th className="px-4 py-2 font-medium">#</th><th className="px-3 py-2 font-medium">Local</th>
                <th className="px-3 py-2 text-right font-medium">Unidades</th><th className="px-3 py-2 font-medium">Facturación estimada</th>
                <th className="px-3 py-2 text-right font-medium">Margen bruto</th><th className="px-3 py-2 text-right font-medium">Cobertura</th>
              </tr></thead>
              <tbody>
                {locales.map((l, i) => (
                  <tr key={l.sucursal} onClick={() => abrirLocal(l.sucursal)} title="Ver detalle del local"
                    className="cursor-pointer border-b border-line/70 last:border-0 hover:bg-action/[0.04]">
                    <td className="px-4 py-2 text-2xs text-faint tnum">{i + 1}</td>
                    <td className="px-3 py-2"><span className="font-medium text-ink">{l.sucursal}</span><span className="ml-2 text-2xs text-faint">{marcaLabel(l.marca)}</span><span className="ml-1.5 text-2xs text-faint">›</span></td>
                    <td className="px-3 py-2 text-right font-mono tnum text-muted">{int(l.unidades)}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-28 overflow-hidden rounded-full bg-ink/10"><div className="h-full rounded-full bg-ok/80" style={{ width: `${Math.max(2, (l.facturacion / maxFactLoc) * 100)}%` }} /></div>
                        <span className="font-mono tnum font-medium text-ink monto">{money(l.facturacion)}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right font-mono tnum text-ok"><span className="monto">{l.margen ? money(l.margen) : "—"}</span></td>
                    <td className="px-3 py-2 text-right"><span className={`text-2xs tnum ${l.cobertura < 0.9 ? "text-warn" : "text-faint"}`}>{Math.round(l.cobertura * 100)}%</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : tab === "sin-receta" ? (
          sinReceta.length === 0 ? <EmptyState title="Todo con receta" desc="Todos los productos que facturan ya tienen receta cargada. 👏" /> : (
            <>
            <p className="border-b border-line px-4 py-2.5 text-2xs text-muted">
              <b className="text-warn">Sin receta:</b> estos productos facturan pero <b>no tienen ninguna receta cargada</b> (no se pueden costear).
              Suman <b className="monto">{money(factSinReceta)}</b>{d && d.total ? ` (${Math.round((factSinReceta / d.total) * 100)}% de la facturación)` : ""}. Cargá su receta en{" "}
              <Link href="/recetas" className="font-medium text-action hover:underline">Recetas</Link> — de arriba hacia abajo, empezando por lo que más factura.
              {incompletas.length > 0 && <> Aparte hay <b>{incompletas.length}</b> con <b className="text-warn">receta incompleta</b> (tienen receta pero les falta un insumo en el maestro): aparecen en la lista de <b>Productos</b> marcadas y no suman margen hasta completarlas.</>}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead><tr className="border-b border-line text-2xs uppercase tracking-wide text-faint">
                  <th className="px-4 py-2 font-medium">#</th><th className="px-3 py-2 font-medium">Producto</th>
                  <th className="px-3 py-2 text-right font-medium">Unidades</th><th className="px-3 py-2 text-right font-medium">Precio</th>
                  <th className="px-3 py-2 font-medium">Facturación sin costear</th>
                </tr></thead>
                <tbody>
                  {sinReceta.slice(0, LIMITE).map((p, i) => (
                    <tr key={p.sku} className="border-b border-line/70 last:border-0 hover:bg-ink/[0.02]">
                      <td className="px-4 py-2 text-2xs text-faint tnum">{i + 1}</td>
                      <td className="px-3 py-2"><span className="font-medium text-ink">{p.nombre}</span><span className="ml-2 font-mono text-2xs text-faint">{p.sku}</span><span className="ml-2 text-2xs text-faint">{marcaLabel(p.marca)}</span></td>
                      <td className="px-3 py-2 text-right font-mono tnum text-muted">{int(p.unidades)}</td>
                      <td className="px-3 py-2 text-right font-mono tnum text-muted"><span className="monto">{p.precio ? money(p.precio) : "—"}</span></td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-28 overflow-hidden rounded-full bg-ink/10"><div className="h-full rounded-full bg-warn/70" style={{ width: `${Math.max(2, (p.facturacion / (sinReceta[0]?.facturacion || 1)) * 100)}%` }} /></div>
                          <span className="font-mono tnum font-medium text-ink monto">{money(p.facturacion)}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {sinReceta.length > LIMITE && <p className="border-t border-line px-4 py-2.5 text-2xs text-faint">Mostrando los {LIMITE} de {int(sinReceta.length)}. Exportá para ver todo.</p>}
            </div>
            </>
          )
        ) : (
          <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-3">
            {(d?.porMarca ?? []).map((m) => (
              <Card key={m.marca} className="group p-4">
                <p className="text-2xs uppercase tracking-wide text-faint">{marcaLabel(m.marca)}</p>
                <p className="mt-0.5 font-display text-2xl font-semibold text-ok"><MontoDual compact={moneyC(m.facturacion)} full={money(m.facturacion)} sensible /></p>
                <p className="text-2xs text-faint">{int(m.unidades)} unidades · {d && d.total ? Math.round((m.facturacion / d.total) * 100) : 0}% del total</p>
              </Card>
            ))}
          </div>
        )}
      </Card>

      {localSel && (
        <LocalModal sucursal={localSel} data={localData} loading={localLoading} dias={dias} onClose={() => setLocalSel(null)} />
      )}
    </div>
  );
}

// Detalle de un local: KPIs, tendencia y productos top — con los mismos datos
// (getFacturacion filtrado por sucursal). Modal.
function LocalModal({ sucursal, data, loading, dias, onClose }: { sucursal: string; data: Datos | null; loading: boolean; dias: number; onClose: () => void }) {
  const marca = data?.porMarca[0]?.marca;
  const margenPct = data && data.facturacionConCosto ? Math.round((data.margenTotal / data.facturacionConCosto) * 100) : 0;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" onClick={onClose}>
      <div className="my-6 w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
        <Card className="p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold text-ink">{sucursal}</h2>
              <p className="text-2xs text-faint">{marca ? marcaLabel(marca) + " · " : ""}últimos {dias} días · facturación estimada</p>
            </div>
            <button onClick={onClose} className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted hover:bg-ink/5" aria-label="Cerrar">✕</button>
          </div>

          {loading || !data ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <MiniKpi label="Facturación" value={money(data.total)} tone="ok" sensible />
                <MiniKpi label="Margen bruto" value={money(data.margenTotal)} sub={`${margenPct}%`} tone="ok" sensible />
                <MiniKpi label="Unidades" value={int(data.unidades)} />
                <MiniKpi label="$ por unidad" value={money(data.ticketProm)} sensible />
              </div>

              {data.porDia.length > 1 && (
                <div>
                  <p className="mb-2 text-2xs font-medium uppercase tracking-wide text-faint">Facturación diaria</p>
                  <TendenciaChart dias={data.porDia} metric="facturacion" />
                </div>
              )}

              <div>
                <p className="mb-1.5 text-2xs font-medium uppercase tracking-wide text-faint">Top productos de este local</p>
                <div className="overflow-x-auto rounded-lg border border-line">
                  <table className="w-full text-left text-sm">
                    <thead><tr className="border-b border-line text-2xs uppercase tracking-wide text-faint">
                      <th className="px-3 py-2 font-medium">Producto</th><th className="px-3 py-2 text-right font-medium">Unidades</th>
                      <th className="px-3 py-2 text-right font-medium">Facturación</th><th className="px-3 py-2 text-right font-medium">Margen</th>
                    </tr></thead>
                    <tbody>
                      {data.porProducto.slice(0, 12).map((p) => (
                        <tr key={p.sku} className="border-b border-line/70 last:border-0">
                          <td className="px-3 py-1.5"><span className="font-medium text-ink">{p.nombre}</span><span className="ml-1.5 font-mono text-2xs text-faint">{p.sku}</span></td>
                          <td className="px-3 py-1.5 text-right font-mono tnum text-muted">{int(p.unidades)}</td>
                          <td className="px-3 py-1.5 text-right font-mono tnum text-ink">{money(p.facturacion)}</td>
                          <td className="px-3 py-1.5 text-right font-mono tnum text-ok">{p.tieneCosto ? money(p.margen ?? 0) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function MiniKpi({ label, value, sub, tone, sensible }: { label: string; value: string; sub?: string; tone?: "ok"; sensible?: boolean }) {
  return (
    <div className="rounded-lg border border-line bg-ink/[0.02] p-2.5">
      <p className="text-2xs uppercase tracking-wide text-faint">{label}</p>
      <p className={`mt-0.5 font-display text-base font-semibold leading-tight tnum ${tone === "ok" ? "text-ok" : "text-ink"}`}><span className={sensible ? "monto" : ""}>{value}</span>{sub && <span className="ml-1 text-2xs font-normal text-faint">{sub}</span>}</p>
    </div>
  );
}

// Tendencia diaria: una sola serie (facturación o unidades) en barras. Sin leyenda
// (el título la nombra); hover por barra; línea de promedio; último día destacado.
function TendenciaChart({ dias, metric }: { dias: FactDia[]; metric: "facturacion" | "unidades" }) {
  const N = dias.length;
  const vals = dias.map((d) => d[metric]);
  const max = Math.max(1, ...vals);
  const avg = vals.reduce((s, v) => s + v, 0) / (N || 1);
  // viewBox con ancho REALISTA (no el mínimo 320): con pocos días (7/15) el SVG se
  // estiraba al ancho del contenedor y escalaba el texto y las barras ~4-5x (etiquetas
  // gigantes pisando las barras). Con un ancho base alto el factor de escala queda ~1-2x.
  const W = Math.max(760, N * 28);
  // `top` es una banda reservada ARRIBA para la etiqueta del máximo: así nunca se
  // monta sobre la barra más alta (que llega justo a y=top).
  const H = 132, top = 22, plotH = 84, base = top + plotH;
  const step = W / N;
  const barW = Math.min(46, step * 0.5);
  const fmt = (v: number) => (metric === "facturacion" ? moneyC(v) : int(v));
  const yAvg = base - (avg / max) * plotH;
  const labelIdx = new Set([0, N > 2 ? Math.floor(N / 2) : -1, N - 1]);
  // La etiqueta del promedio va del lado OPUESTO al pico, para no pisar la barra alta.
  const iMax = vals.indexOf(max);
  const avgDer = iMax < N / 2; // pico a la izquierda -> "prom" a la derecha
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ minWidth: N > 16 ? W / 1.7 : undefined }} preserveAspectRatio="xMidYMid meet" role="img" aria-label={`Tendencia diaria de ${metric}`}>
        {/* máximo, en la banda superior reservada. Se oculta con privacidad si es plata. */}
        <text x={2} y={13} fontSize="10" className={`fill-faint ${metric === "facturacion" ? "monto" : ""}`}>{fmt(max)}</text>
        <line x1={0} x2={W} y1={yAvg} y2={yAvg} className="stroke-line" strokeDasharray="3 3" />
        <text x={avgDer ? W - 2 : 2} y={yAvg - 4} textAnchor={avgDer ? "end" : "start"} fontSize="10" className={`fill-faint ${metric === "facturacion" ? "monto" : ""}`}>prom {fmt(avg)}</text>
        <line x1={0} x2={W} y1={base} y2={base} className="stroke-line" />
        <g className="text-action">
          {dias.map((d, i) => {
            const h = Math.max(1, (d[metric] / max) * plotH);
            const x = i * step + (step - barW) / 2;
            return (
              <rect key={d.fecha} x={x} y={base - h} width={barW} height={h} rx={Math.min(3, barW / 2)}
                className="fill-current" opacity={0.85}>
                <title>{fecha(d.fecha)}: {fmt(d[metric])}{i === N - 1 ? " (parcial)" : ""}</title>
              </rect>
            );
          })}
        </g>
        {dias.map((d, i) => labelIdx.has(i) ? (
          <text key={d.fecha} x={i * step + step / 2} y={H - 3} textAnchor="middle" fontSize="10" className="fill-faint">{fecha(d.fecha)}</text>
        ) : null)}
      </svg>
    </div>
  );
}

function Kpi({ label, value, sub, tone, full, sensible }: { label: string; value: string; sub?: string; tone?: "ok" | "warn" | "bad"; full?: string; sensible?: boolean }) {
  const c = tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : tone === "bad" ? "text-bad" : "text-ink";
  return (
    <Card className="group p-3">
      <p className="text-2xs uppercase tracking-wide text-faint">{label}</p>
      <p className={`mt-0.5 font-display text-base font-semibold leading-tight tnum sm:text-2xl ${c}`}>
        {full
          ? <MontoDual compact={value} full={full} sensible={sensible} />
          : <span className={sensible ? "monto" : ""}>{value}</span>}
      </p>
      {sub && <p className="text-2xs text-faint">{sub}</p>}
    </Card>
  );
}

// Monto abreviado ("$5,13 mil M") que, al pasar el mouse por la card (grupo), muestra
// el número COMPLETO en el mismo lugar (no en tooltip). Respeta la privacidad (.monto).
function MontoDual({ compact, full, sensible }: { compact: string; full: string; sensible?: boolean }) {
  return (
    <span className={sensible ? "monto" : ""}>
      <span className="group-hover:hidden">{compact}</span>
      <span className="hidden whitespace-nowrap text-[0.7em] group-hover:inline">{full}</span>
    </span>
  );
}
