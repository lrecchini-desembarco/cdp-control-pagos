"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, Button, inputClass, Skeleton, EmptyState, Badge } from "@/components/ui/primitives";
import { descargarCSV } from "@/lib/exportar-csv";

interface LocalActividad {
  sucursal: string; marca: string; unidades: number; ultimaVenta: string;
  diasDesde: number; participacion: number; estado: "al-dia" | "atencion" | "sin-movimiento";
}
interface ProductoDormido {
  sku: string; nombre: string; sucursal: string; marca: string; precio: number; ultimaVenta: string; dias: number;
}
interface Datos {
  ok: boolean; source: string; ventasSource?: string; preciosSource?: string;
  ranking: { refFecha: string; ventana: { desde: string; hasta: string }; locales: LocalActividad[]; totalUnidades: number; sinMovimiento: number };
  dormidos: { refFecha: string; umbralDias: number; items: ProductoDormido[]; totalPares: number };
}

const MARCAS: Record<string, string> = { desembarco: "El Desembarco", tasty: "Mr Tasty", mila: "Mila & Go" };
const marcaLabel = (m: string) => MARCAS[m] ?? m;

const int = (n: number) => Math.round(n).toLocaleString("es-AR");
const money = (n: number) => "$" + Math.round(n).toLocaleString("es-AR");
const fecha = (iso: string) => (iso ? new Date(iso + "T00:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" }) : "—");

const estadoTone = { "al-dia": "ok", atencion: "warn", "sin-movimiento": "bad" } as const;
const estadoLabel = { "al-dia": "Al día", atencion: "Atención", "sin-movimiento": "Sin movimiento" } as const;

export default function ActividadView() {
  const [d, setD] = useState<Datos | null>(null);
  const [estado, setEstado] = useState<"loading" | "ok" | "error">("loading");
  const [errMsg, setErrMsg] = useState("");
  const [tab, setTab] = useState<"locales" | "dormidos">("locales");
  const [umbral, setUmbral] = useState(21);
  const [marca, setMarca] = useState("");
  const [q, setQ] = useState("");
  const [ordenLocal, setOrdenLocal] = useState<"volumen" | "frescura">("volumen");

  async function cargar(u = umbral) {
    setEstado("loading");
    try {
      const j: Datos = await (await fetch(`/api/actividad?umbral=${u}`)).json();
      if (!j.ok) throw new Error((j as any).error || "No se pudo cargar.");
      setD(j);
      setEstado("ok");
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : "Error");
      setEstado("error");
    }
  }
  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, []);

  const esMock = d?.ventasSource === "mock" || d?.preciosSource === "mock";

  const locales = useMemo(() => {
    let l = d?.ranking.locales ?? [];
    if (marca) l = l.filter((x) => x.marca === marca);
    const t = q.trim().toLowerCase();
    if (t) l = l.filter((x) => x.sucursal.toLowerCase().includes(t));
    l = [...l].sort((a, b) => (ordenLocal === "frescura" ? b.diasDesde - a.diasDesde || b.unidades - a.unidades : b.unidades - a.unidades));
    return l;
  }, [d, marca, q, ordenLocal]);

  const dormidos = useMemo(() => {
    let l = d?.dormidos.items ?? [];
    if (marca) l = l.filter((x) => x.marca === marca);
    const t = q.trim().toLowerCase();
    if (t) l = l.filter((x) => `${x.sku} ${x.nombre} ${x.sucursal}`.toLowerCase().includes(t));
    return l;
  }, [d, marca, q]);

  const maxPart = useMemo(() => Math.max(0.0001, ...(locales.map((l) => l.participacion))), [locales]);

  // La lista de dormidos puede ser enorme: se muestran los primeros N (los más
  // dormidos, que ya están ordenados); el CSV exporta TODOS.
  const LIMITE = 300;
  const dormidosVisibles = dormidos.slice(0, LIMITE);

  function exportarLocales() {
    descargarCSV("actividad-locales",
      ["Local", "Marca", "Unidades", "Participación %", "Última venta", "Días sin vender", "Estado"],
      locales.map((l) => [l.sucursal, marcaLabel(l.marca), l.unidades, (l.participacion * 100).toFixed(1), l.ultimaVenta, l.diasDesde, estadoLabel[l.estado]]));
  }
  function exportarDormidos() {
    descargarCSV("productos-dormidos",
      ["SKU", "Producto", "Local", "Marca", "Precio", "Última venta", "Días dormido"],
      dormidos.map((p) => [p.sku, p.nombre, p.sucursal, marcaLabel(p.marca), p.precio, p.ultimaVenta, p.dias]));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold text-ink">Actividad de ventas</h1>
          <p className="mt-0.5 max-w-2xl text-sm text-muted">
            Qué locales están vendiendo (y hace cuánto que no) y qué productos se durmieron. Datos reales de Tango.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {esMock ? <Badge tone="warn">datos de ejemplo</Badge> : <Badge tone="ok">en vivo</Badge>}
          {d && <span className="text-2xs text-faint">al {fecha(tab === "dormidos" ? d.dormidos.refFecha : d.ranking.refFecha)}</span>}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Unidades (30 días)" value={d ? int(d.ranking.totalUnidades) : "—"} />
        <Kpi label="Locales activos" value={d ? int(d.ranking.locales.length) : "—"} />
        <Kpi label="Sin movimiento" value={d ? int(d.ranking.sinMovimiento) : "—"} tone={d && d.ranking.sinMovimiento ? "bad" : undefined} sub="locales frenados" />
        <Kpi label="Productos dormidos" value={d ? int(d.dormidos.items.length) : "—"} tone={d && d.dormidos.items.length ? "warn" : undefined} sub={`≥ ${umbral} días sin vender`} />
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5">
        {([["locales", "Locales · frescura"], ["dormidos", "Productos dormidos"]] as const).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`rounded-lg border px-3.5 py-1.5 text-sm font-medium ${tab === id ? "border-action bg-action/10 text-action" : "border-line bg-surface text-muted hover:text-ink"}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Filtros */}
      <Card className="flex flex-wrap items-center gap-3 p-3">
        <div className="flex flex-wrap gap-1.5">
          {[["", "Todas"], ["desembarco", "El Desembarco"], ["tasty", "Mr Tasty"], ["mila", "Mila & Go"]].map(([id, label]) => (
            <button key={id} onClick={() => setMarca(id)}
              className={`rounded-full border px-3 py-1 text-2xs font-medium ${marca === id ? "border-action bg-action/10 text-action" : "border-line bg-surface text-muted hover:text-ink"}`}>
              {label}
            </button>
          ))}
        </div>
        <input className={`${inputClass} max-w-[220px] py-1`} placeholder={tab === "locales" ? "Buscar local…" : "Buscar producto o local…"} value={q} onChange={(e) => setQ(e.target.value)} />
        {tab === "dormidos" && (
          <label className="flex items-center gap-1.5 text-2xs text-muted">
            Sin vender hace ≥
            <select className="rounded-md border border-line bg-surface px-2 py-1 text-2xs text-ink"
              value={umbral} onChange={(e) => { const u = Number(e.target.value); setUmbral(u); cargar(u); }}>
              {[14, 21, 30, 60, 90].map((u) => <option key={u} value={u}>{u} días</option>)}
            </select>
          </label>
        )}
        {tab === "locales" && (
          <label className="flex items-center gap-1.5 text-2xs text-muted">
            Ordenar por
            <select className="rounded-md border border-line bg-surface px-2 py-1 text-2xs text-ink"
              value={ordenLocal} onChange={(e) => setOrdenLocal(e.target.value as any)}>
              <option value="volumen">Volumen</option>
              <option value="frescura">Frescura (más frenados primero)</option>
            </select>
          </label>
        )}
        <div className="ml-auto flex items-center gap-3">
          <span className="text-2xs text-faint">{tab === "locales" ? `${locales.length} locales` : `${dormidos.length} productos`}</span>
          <Button variant="outline" onClick={tab === "locales" ? exportarLocales : exportarDormidos} disabled={estado !== "ok"}>⬇ Exportar</Button>
        </div>
      </Card>

      {/* Contenido */}
      <Card className="overflow-hidden">
        {estado === "loading" ? (
          <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
        ) : estado === "error" ? (
          <div className="p-4 text-sm text-bad">No se pudo cargar la actividad. {errMsg}</div>
        ) : tab === "locales" ? (
          locales.length === 0 ? <EmptyState title="Sin locales" desc="No hay ventas para ese filtro en la ventana." /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-2xs uppercase tracking-wide text-faint">
                    <th className="px-4 py-2 font-medium">#</th>
                    <th className="px-3 py-2 font-medium">Local</th>
                    <th className="px-3 py-2 text-right font-medium">Unidades</th>
                    <th className="px-3 py-2 font-medium">Participación</th>
                    <th className="px-3 py-2 font-medium">Última venta</th>
                    <th className="px-3 py-2 font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {locales.map((l, i) => (
                    <tr key={l.sucursal} className={`border-b border-line/70 last:border-0 ${l.estado === "sin-movimiento" ? "bg-bad/[0.04]" : "hover:bg-ink/[0.02]"}`}>
                      <td className="px-4 py-2 text-2xs text-faint tnum">{i + 1}</td>
                      <td className="px-3 py-2">
                        <span className="font-medium text-ink">{l.sucursal}</span>
                        <span className="ml-2 text-2xs text-faint">{marcaLabel(l.marca)}</span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono tnum text-ink">{int(l.unidades)}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-ink/10">
                            <div className="h-full rounded-full bg-action" style={{ width: `${Math.max(2, (l.participacion / maxPart) * 100)}%` }} />
                          </div>
                          <span className="text-2xs text-faint tnum">{(l.participacion * 100).toFixed(1)}%</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-2xs text-muted">
                        {fecha(l.ultimaVenta)} {l.diasDesde > 0 && <span className="text-faint">· hace {l.diasDesde}d</span>}
                      </td>
                      <td className="px-3 py-2"><Badge tone={estadoTone[l.estado]}>{estadoLabel[l.estado]}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : dormidos.length === 0 ? (
          <EmptyState title="Nada dormido" desc={`Ningún producto lleva ${umbral}+ días sin venderse con este filtro. 👏`} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-2xs uppercase tracking-wide text-faint">
                  <th className="px-4 py-2 font-medium">Producto</th>
                  <th className="px-3 py-2 font-medium">Local</th>
                  <th className="px-3 py-2 text-right font-medium">Precio</th>
                  <th className="px-3 py-2 font-medium">Última venta</th>
                  <th className="px-3 py-2 text-right font-medium">Días dormido</th>
                </tr>
              </thead>
              <tbody>
                {dormidosVisibles.map((p) => (
                  <tr key={`${p.sku}-${p.sucursal}`} className="border-b border-line/70 last:border-0 hover:bg-ink/[0.02]">
                    <td className="px-4 py-2">
                      <span className="font-medium text-ink">{p.nombre}</span>
                      <span className="ml-2 font-mono text-2xs text-faint">{p.sku}</span>
                    </td>
                    <td className="px-3 py-2 text-2xs text-muted">{p.sucursal}<span className="ml-1.5 text-faint">· {marcaLabel(p.marca)}</span></td>
                    <td className="px-3 py-2 text-right font-mono tnum text-muted">{p.precio ? money(p.precio) : "—"}</td>
                    <td className="px-3 py-2 text-2xs text-muted">{fecha(p.ultimaVenta)}</td>
                    <td className="px-3 py-2 text-right">
                      <span className={`font-mono tnum font-semibold ${p.dias >= 60 ? "text-bad" : p.dias >= 30 ? "text-warn" : "text-muted"}`}>{p.dias}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {dormidos.length > LIMITE && (
              <p className="border-t border-line px-4 py-2.5 text-2xs text-faint">
                Mostrando los {LIMITE} más dormidos de {int(dormidos.length)}. Usá <b>Exportar</b> para bajar la lista completa.
              </p>
            )}
          </div>
        )}
      </Card>

      <p className="text-2xs text-faint">
        La frescura se mide contra la venta más reciente registrada (no contra el reloj), así el atraso normal de carga no marca todo como frenado.
        “Dormido” = ese producto tiene precio en el local (alguna vez vendió) pero no se vende hace {umbral}+ días: puede ser quiebre o candidato a baja.
      </p>
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
