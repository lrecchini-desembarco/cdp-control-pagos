"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, Button, inputClass, Skeleton, EmptyState, Badge } from "@/components/ui/primitives";
import { descargarCSV } from "@/lib/exportar-csv";

interface FactProducto { sku: string; nombre: string; marca: string; unidades: number; precio: number; facturacion: number; }
interface FactLocal { sucursal: string; marca: string; unidades: number; facturacion: number; cobertura: number; }
interface FactMarca { marca: string; unidades: number; facturacion: number; }
interface Datos {
  ok: boolean; source: string; ventasSource?: string; preciosSource?: string; refFecha: string;
  total: number; unidades: number; unidadesConPrecio: number; cobertura: number; ticketProm: number;
  porProducto: FactProducto[]; porLocal: FactLocal[]; porMarca: FactMarca[];
}

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
  const [tab, setTab] = useState<"productos" | "locales" | "marcas">("productos");
  const [marca, setMarca] = useState("");
  const [q, setQ] = useState("");

  async function cargar() {
    setEstado("loading");
    try {
      const j: Datos = await (await fetch("/api/facturacion")).json();
      if (!j.ok) throw new Error((j as any).error || "No se pudo cargar.");
      setD(j); setEstado("ok");
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : "Error"); setEstado("error");
    }
  }
  useEffect(() => { cargar(); }, []);

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

  const totalFilt = useMemo(() => (tab === "locales" ? locales : productos).reduce((s, x) => s + x.facturacion, 0), [tab, locales, productos]);

  function exportar() {
    if (tab === "locales") {
      descargarCSV("facturacion-locales", ["Local", "Marca", "Unidades", "Facturación estimada", "Cobertura %"],
        locales.map((l) => [l.sucursal, marcaLabel(l.marca), l.unidades, Math.round(l.facturacion), (l.cobertura * 100).toFixed(0)]));
    } else if (tab === "productos") {
      descargarCSV("facturacion-productos", ["SKU", "Producto", "Marca", "Unidades", "Precio", "Facturación estimada"],
        productos.map((p) => [p.sku, p.nombre, marcaLabel(p.marca), p.unidades, Math.round(p.precio), Math.round(p.facturacion)]));
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
            Cuánta plata mueve cada producto, local y marca. Estimada con datos reales de Tango (precio × unidades).
          </p>
        </div>
        <div className="flex items-center gap-2">
          {esMock ? <Badge tone="warn">datos de ejemplo</Badge> : <Badge tone="ok">en vivo</Badge>}
          {d && <span className="text-2xs text-faint">últimos 30 días · al {fecha(d.refFecha)}</span>}
        </div>
      </div>

      {/* Aviso: es estimada (precio efectivo, no el importe exacto de Tango) */}
      <Card className="border-l-4 border-l-action/50 bg-action/5 p-3">
        <p className="text-xs text-ink">
          <b className="text-action-700">Estimada:</b> unidades reales × <b>precio efectivo</b> (última venta registrada por Tango), no el
          importe exacto de cada comanda. Es muy fiel para períodos recientes. La facturación <b>exacta</b> se activa cuando Sistemas
          exponga <code className="rounded bg-paper px-1">IMPORTE_NETO</code> (ya está el SQL listo) — y esta pantalla la toma sin cambios.
        </p>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Facturación estimada" value={d ? money(d.total) : "—"} tone="ok" sub="últimos 30 días" />
        <Kpi label="Unidades vendidas" value={d ? int(d.unidades) : "—"} />
        <Kpi label="$ por unidad" value={d ? money(d.ticketProm) : "—"} sub="precio promedio ponderado" />
        <Kpi label="Cobertura" value={d ? `${Math.round(d.cobertura * 100)}%` : "—"} tone={d && d.cobertura < 0.9 ? "warn" : undefined} sub="unidades con precio" />
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5">
        {([["productos", "Por producto"], ["locales", "Por local"], ["marcas", "Por marca"]] as const).map(([id, label]) => (
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
            {[["", "Todas"], ["desembarco", "El Desembarco"], ["tasty", "Mr Tasty"], ["mila", "Mila & Go"]].map(([id, label]) => (
              <button key={id} onClick={() => setMarca(id)}
                className={`rounded-full border px-3 py-1 text-2xs font-medium ${marca === id ? "border-action bg-action/10 text-action" : "border-line bg-surface text-muted hover:text-ink"}`}>
                {label}
              </button>
            ))}
          </div>
          <input className={`${inputClass} max-w-[220px] py-1`} placeholder={tab === "productos" ? "Buscar producto…" : "Buscar local…"} value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="ml-auto flex items-center gap-3">
            <span className="text-2xs text-faint">{tab === "productos" ? `${productos.length} productos` : `${locales.length} locales`} · {money(totalFilt)}</span>
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
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead><tr className="border-b border-line text-2xs uppercase tracking-wide text-faint">
                  <th className="px-4 py-2 font-medium">#</th><th className="px-3 py-2 font-medium">Producto</th>
                  <th className="px-3 py-2 text-right font-medium">Unidades</th><th className="px-3 py-2 text-right font-medium">Precio</th>
                  <th className="px-3 py-2 font-medium">Facturación estimada</th>
                </tr></thead>
                <tbody>
                  {productos.slice(0, LIMITE).map((p, i) => (
                    <tr key={p.sku} className="border-b border-line/70 last:border-0 hover:bg-ink/[0.02]">
                      <td className="px-4 py-2 text-2xs text-faint tnum">{i + 1}</td>
                      <td className="px-3 py-2"><span className="font-medium text-ink">{p.nombre}</span><span className="ml-2 font-mono text-2xs text-faint">{p.sku}</span><span className="ml-2 text-2xs text-faint">{marcaLabel(p.marca)}</span></td>
                      <td className="px-3 py-2 text-right font-mono tnum text-muted">{int(p.unidades)}</td>
                      <td className="px-3 py-2 text-right font-mono tnum text-muted">{p.precio ? money(p.precio) : "—"}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-28 overflow-hidden rounded-full bg-ink/10"><div className="h-full rounded-full bg-ok/80" style={{ width: `${Math.max(2, (p.facturacion / maxFactProd) * 100)}%` }} /></div>
                          <span className="font-mono tnum font-medium text-ink">{money(p.facturacion)}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {productos.length > LIMITE && <p className="border-t border-line px-4 py-2.5 text-2xs text-faint">Mostrando los {LIMITE} de {int(productos.length)}. Exportá para ver todo.</p>}
            </div>
          )
        ) : tab === "locales" ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b border-line text-2xs uppercase tracking-wide text-faint">
                <th className="px-4 py-2 font-medium">#</th><th className="px-3 py-2 font-medium">Local</th>
                <th className="px-3 py-2 text-right font-medium">Unidades</th><th className="px-3 py-2 font-medium">Facturación estimada</th>
                <th className="px-3 py-2 text-right font-medium">Cobertura</th>
              </tr></thead>
              <tbody>
                {locales.map((l, i) => (
                  <tr key={l.sucursal} className="border-b border-line/70 last:border-0 hover:bg-ink/[0.02]">
                    <td className="px-4 py-2 text-2xs text-faint tnum">{i + 1}</td>
                    <td className="px-3 py-2"><span className="font-medium text-ink">{l.sucursal}</span><span className="ml-2 text-2xs text-faint">{marcaLabel(l.marca)}</span></td>
                    <td className="px-3 py-2 text-right font-mono tnum text-muted">{int(l.unidades)}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-28 overflow-hidden rounded-full bg-ink/10"><div className="h-full rounded-full bg-ok/80" style={{ width: `${Math.max(2, (l.facturacion / maxFactLoc) * 100)}%` }} /></div>
                        <span className="font-mono tnum font-medium text-ink">{money(l.facturacion)}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right"><span className={`text-2xs tnum ${l.cobertura < 0.9 ? "text-warn" : "text-faint"}`}>{Math.round(l.cobertura * 100)}%</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-3">
            {(d?.porMarca ?? []).map((m) => (
              <Card key={m.marca} className="p-4">
                <p className="text-2xs uppercase tracking-wide text-faint">{marcaLabel(m.marca)}</p>
                <p className="mt-0.5 font-display text-2xl font-semibold text-ok">{moneyC(m.facturacion)}</p>
                <p className="text-2xs text-faint">{int(m.unidades)} unidades · {d && d.total ? Math.round((m.facturacion / d.total) * 100) : 0}% del total</p>
              </Card>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "ok" | "warn" | "bad" }) {
  const c = tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : tone === "bad" ? "text-bad" : "text-ink";
  return (
    <Card className="p-3">
      <p className="text-2xs uppercase tracking-wide text-faint">{label}</p>
      <p className={`mt-0.5 font-display text-2xl font-semibold ${c}`}>{value}</p>
      {sub && <p className="text-2xs text-faint">{sub}</p>}
    </Card>
  );
}
