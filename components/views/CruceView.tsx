"use client";

import { useEffect, useMemo, useState } from "react";
import { BRANDS, brandById, fmtInt, fmtPct, severidad, todayISO } from "@/lib/brands";
import type { BrandId, CruceRow, CruceComponente } from "@/lib/types";
import { Badge, Card, EmptyState, ErrorState, Field, inputClass, Skeleton } from "@/components/ui/primitives";
import DetalleModal from "@/components/views/DetalleModal";

type RowDev = CruceRow & { dev: number; pct: number; periodo?: string; dias?: number };

type Sort = "desvio" | "producto" | "sucursal";

const toneOf = (s: "ok" | "warn" | "bad") => s;

function isoMinusDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function DeviationBar({ pct }: { pct: number }) {
  // barra divergente centrada en 0: derecha = sobre-pedido, izquierda = sub-pedido
  const sev = severidad(pct);
  const color = sev === "ok" ? "#2E7D52" : sev === "warn" ? "#C8841C" : "#C0392B";
  const w = Math.min(50, Math.abs(pct) * 100); // % de medio ancho
  const right = pct >= 0;
  return (
    <div className="relative h-3 w-40 rounded bg-ink/[0.04]" title={fmtPct(pct)}>
      <div className="absolute left-1/2 top-0 h-full w-px bg-line" />
      <div
        className="absolute top-0 h-full rounded"
        style={{
          backgroundColor: color,
          width: `${w}%`,
          left: right ? "50%" : `${50 - w}%`,
        }}
      />
    </div>
  );
}

type Status = "loading" | "ok" | "error";

export default function CruceView() {
  const [all, setAll] = useState<CruceRow[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [errMsg, setErrMsg] = useState("");
  const [brand, setBrand] = useState<BrandId | "all">("all");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [ready, setReady] = useState(false);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("desvio");
  const [detalle, setDetalle] = useState<RowDev | null>(null);
  const [pedidosMock, setPedidosMock] = useState(false);

  // Inicialización (una vez): toma el rango y filtros de la URL si vienen por
  // deep-link, o usa los últimos 7 días por defecto.
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const hoy = todayISO();
    const f = sp.get("fecha");        // deep-link de un día (Alertas)
    const d = sp.get("desde");
    const h = sp.get("hasta");
    if (f) {
      setDesde(f);
      setHasta(f);
    } else {
      setDesde(d || isoMinusDays(hoy, 6));
      setHasta(h || hoy);
    }
    const b = sp.get("brand");
    if (b) setBrand(b as BrandId | "all");
    const query = sp.get("q");
    if (query) setQ(query);
    setReady(true);
  }, []);

  // Trae el cruce real (Raven + Tango) para el rango elegido.
  async function cargar(d = desde, h = hasta) {
    if (!d || !h) return;
    setStatus("loading");
    try {
      const r = await fetch(`/api/cruce?desde=${d}&hasta=${h}`);
      const j = await r.json();
      if (!j.ok) throw new Error(j.error ?? "No se pudo construir el cruce.");
      setAll(j.data as CruceRow[]);
      setPedidosMock(j.pedidosSource === "mock");
      setStatus("ok");
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : "Error desconocido.");
      setStatus("error");
    }
  }

  // Refetch cuando cambia el rango (después de inicializar).
  useEffect(() => {
    if (!ready) return;
    cargar(desde, hasta);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, desde, hasta]);

  const periodo = desde === hasta ? desde : `${desde} → ${hasta}`;
  const unDia = desde === hasta;

  // Consolida el período: una fila por sucursal+insumo, sumando pedido y venta
  // (y los componentes) de todos los días del rango.
  const rows = useMemo(() => {
    let base: CruceRow[] = all;
    if (brand !== "all") base = base.filter((x) => x.brand === brand);
    if (q.trim()) {
      const t = q.toLowerCase();
      base = base.filter(
        (x) => x.producto.toLowerCase().includes(t) || x.sucursal.toLowerCase().includes(t)
      );
    }

    const grupos = new Map<string, RowDev & { _comp: Map<string, CruceComponente>; _dias: Set<string> }>();
    for (const x of base) {
      const key = `${x.sucursal}::${x.codigoCdp}`;
      let g = grupos.get(key);
      if (!g) {
        g = {
          ...x,
          fecha: hasta, // fecha única válida (para el deep-link a Raven)
          periodo,
          pedidoCdp: 0,
          ventaEquiv: 0,
          componentes: [],
          dev: 0,
          pct: 0,
          dias: 0,
          _comp: new Map(),
          _dias: new Set(),
        };
        grupos.set(key, g);
      }
      g.pedidoCdp += x.pedidoCdp;
      g.ventaEquiv += x.ventaEquiv;
      g._dias.add(x.fecha);
      for (const c of x.componentes) {
        const prev = g._comp.get(c.sku);
        const vendidas = (prev?.vendidas ?? 0) + c.vendidas;
        g._comp.set(c.sku, { ...c, vendidas, subtotal: vendidas * c.factor });
      }
    }

    const out: RowDev[] = Array.from(grupos.values()).map((g) => {
      const dev = g.pedidoCdp - g.ventaEquiv;
      const pct = g.pedidoCdp ? dev / g.pedidoCdp : 0;
      const { _comp, _dias, ...rest } = g;
      return { ...rest, componentes: Array.from(_comp.values()), dias: _dias.size, dev, pct };
    });

    out.sort((a, b) => {
      if (sort === "desvio") return Math.abs(b.pct) - Math.abs(a.pct);
      if (sort === "producto") return a.producto.localeCompare(b.producto);
      return a.sucursal.localeCompare(b.sucursal);
    });
    return out;
  }, [all, brand, q, sort, hasta, periodo]);

  const kpis = useMemo(() => {
    const pedido = rows.reduce((s, r) => s + r.pedidoCdp, 0);
    const venta = rows.reduce((s, r) => s + r.ventaEquiv, 0);
    const fuera = rows.filter((r) => severidad(r.pct) !== "ok").length;
    const neto = pedido ? (pedido - venta) / pedido : 0;
    return { pedido, venta, fuera, total: rows.length, neto };
  }, [rows]);

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-semibold text-ink">Cruce CDP vs ventas</h1>
          <p className="mt-0.5 text-sm text-muted">
            Lo que cada sucursal pidió al CDP contra lo que vendió, traducido a insumo.
          </p>
        </div>
      </div>

      {/* Intro: qué compara y qué resuelve (para quien entra por primera vez) */}
      <Card className="border-l-4 border-l-action/50 p-4">
        <p className="text-sm text-ink">
          <span className="font-semibold">Qué compara:</span> por cada sucursal e insumo, las unidades
          que <span className="font-medium">pidió al CDP</span> (Raven) contra las que{" "}
          <span className="font-medium">vendió</span>, traducidas a insumo (ventas × receta de Mapeos).
          La diferencia es el <span className="font-medium">desvío</span>.
        </p>
        <div className="mt-2 grid gap-1.5 text-xs text-muted sm:grid-cols-2">
          <span className="inline-flex items-start gap-2">
            <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-bad" />
            <span><b className="text-ink">Sub-pedido</b> — vendió más de lo que pidió → riesgo de quiebre / faltante.</span>
          </span>
          <span className="inline-flex items-start gap-2">
            <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-warn" />
            <span><b className="text-ink">Sobre-pedido</b> — pidió más de lo que vendió → exceso de stock / merma.</span>
          </span>
        </div>
        <p className="mt-2 text-2xs text-faint">
          Qué hacer: elegí un rango de fechas, ordená por mayor desvío y tocá una fila para ver el
          desglose y saltar a Raven o a la receta.
        </p>
      </Card>

      {/* Aviso: pedidos simulados (Raven no está en vivo) → los desvíos no son reales */}
      {pedidosMock && status === "ok" && (
        <Card className="border-l-4 border-l-warn/60 bg-warn/5 p-3">
          <p className="text-xs text-ink">
            <b className="text-warn">Modo demo:</b> los pedidos son <b>simulados</b> — las ventas sí son reales de Tango,
            pero para pedidos reales de Raven falta activar <code className="rounded bg-paper px-1">PEDIDOS_SOURCE=live</code> en
            el entorno. Mientras tanto, <b>los desvíos no representan la operación real</b>.
          </p>
        </Card>
      )}

      {/* Filtros — reconocer mejor que recordar (Nielsen #6) */}
      <Card className="p-4">
        <div data-tour="cruce-filtros" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Desde">
            <input
              type="date"
              className={inputClass}
              value={desde}
              max={hasta || undefined}
              onChange={(e) => {
                const v = e.target.value;
                setDesde(v);
                if (hasta && v > hasta) setHasta(v);
              }}
            />
          </Field>
          <Field label="Hasta">
            <input
              type="date"
              className={inputClass}
              value={hasta}
              min={desde || undefined}
              onChange={(e) => {
                const v = e.target.value;
                setHasta(v);
                if (desde && v < desde) setDesde(v);
              }}
            />
          </Field>
          <Field label="Marca">
            <select
              className={inputClass}
              value={brand}
              onChange={(e) => setBrand(e.target.value as BrandId | "all")}
            >
              <option value="all">Todas</option>
              {BRANDS.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Buscar">
            <input
              className={inputClass}
              placeholder="Producto o sucursal…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </Field>
          <Field label="Ordenar por">
            <select className={inputClass} value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              <option value="desvio">Mayor desvío</option>
              <option value="producto">Producto</option>
              <option value="sucursal">Sucursal</option>
            </select>
          </Field>
        </div>
        {/* Atajos de rango */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-2xs font-medium uppercase tracking-wide text-faint">Rápido</span>
          {[
            { label: "Hoy", days: 0 },
            { label: "7 días", days: 6 },
            { label: "14 días", days: 13 },
            { label: "30 días", days: 29 },
          ].map((p) => {
            const hoy = todayISO();
            const d = isoMinusDays(hoy, p.days);
            const active = hasta === hoy && desde === d;
            return (
              <button
                key={p.label}
                onClick={() => {
                  setHasta(hoy);
                  setDesde(d);
                }}
                className={`rounded-full border px-2.5 py-1 text-2xs font-medium transition-colors ${
                  active ? "border-action bg-action/10 text-action" : "border-line text-muted hover:bg-ink/5"
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </Card>

      {/* KPIs */}
      <div data-tour="cruce-kpis" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Pedido al CDP" value={fmtInt(kpis.pedido)} sub={unDia ? desde : "en el período"} />
        <Kpi label="Venta equivalente" value={fmtInt(kpis.venta)} sub="traducida a insumo" />
        <Kpi label="Desvío neto" value={fmtPct(kpis.neto)} tone={severidad(kpis.neto)} sub="pedido vs venta" />
        <Kpi
          label="Fuera de tolerancia"
          value={`${kpis.fuera} / ${kpis.total}`}
          tone={kpis.fuera === 0 ? "ok" : kpis.fuera > kpis.total / 3 ? "bad" : "warn"}
          sub="líneas a revisar"
        />
      </div>

      {/* Tabla */}
      <Card className="overflow-hidden">
        <div data-tour="cruce-tabla" className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <span className="text-2xs font-medium uppercase tracking-wide text-faint">
            {status === "ok"
              ? `${rows.length} líneas · ${unDia ? periodo : `consolidado ${periodo}`} · tocá una para el detalle`
              : "Cargando…"}
          </span>
          <Legend />
        </div>
        {status === "loading" ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : status === "error" ? (
          <div className="p-4">
            <ErrorState msg={errMsg} onRetry={() => cargar()} />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="Sin datos para este rango"
              desc="Probá con otras fechas o sacá la búsqueda. Si esperabas resultados, revisá que la sucursal esté activa y mapeada."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-2xs uppercase tracking-wide text-faint">
                  <th className="px-4 py-2 font-medium">Sucursal</th>
                  <th className="px-4 py-2 font-medium">Producto CDP</th>
                  <th className="px-4 py-2 text-right font-medium">Pedido</th>
                  <th className="px-4 py-2 text-right font-medium">Venta eq.</th>
                  <th className="px-4 py-2 text-right font-medium">Desvío</th>
                  <th className="px-4 py-2 font-medium">Magnitud</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const sev = severidad(r.pct);
                  return (
                    <tr
                      key={i}
                      onClick={() => setDetalle(r)}
                      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setDetalle(r)}
                      tabIndex={0}
                      role="button"
                      aria-label={`Ver detalle de ${r.producto} en ${r.sucursal}`}
                      className="cursor-pointer border-b border-line/70 last:border-0 hover:bg-ink/[0.025]"
                    >
                      <td className="px-4 py-2.5">
                        <span className="inline-flex items-center gap-2">
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: brandById(r.brand).color }}
                          />
                          {r.sucursal}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="text-ink">{r.producto}</span>
                        <span className="ml-2 font-mono text-2xs text-faint">{r.codigoCdp}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tnum">{fmtInt(r.pedidoCdp)}</td>
                      <td className="px-4 py-2.5 text-right font-mono tnum text-muted">{fmtInt(r.ventaEquiv)}</td>
                      <td className="px-4 py-2.5 text-right">
                        <Badge tone={toneOf(sev)}>{fmtPct(r.pct)}</Badge>
                      </td>
                      <td className="px-4 py-2.5">
                        <DeviationBar pct={r.pct} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <DetalleModal row={detalle} onClose={() => setDetalle(null)} />
    </div>
  );
}

function Kpi({
  label,
  value,
  tone,
  sub,
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn" | "bad";
  sub?: string;
}) {
  const color =
    tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : tone === "bad" ? "text-bad" : "text-ink";
  return (
    <Card className="p-4">
      <p className="text-2xs font-medium uppercase tracking-wide text-faint">{label}</p>
      <p className={`mt-1 font-display text-2xl font-semibold tnum ${color}`}>{value}</p>
      {sub && <p className="mt-0.5 text-2xs text-faint">{sub}</p>}
    </Card>
  );
}

function Legend() {
  return (
    <div className="flex items-center gap-3 text-2xs text-muted">
      <span className="inline-flex items-center gap-1">
        <span className="h-2 w-3 rounded bg-ok" /> ≤5%
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="h-2 w-3 rounded bg-warn" /> 5–15%
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="h-2 w-3 rounded bg-bad" /> &gt;15%
      </span>
      <span className="ml-1 text-faint">← sub-pedido · sobre-pedido →</span>
    </div>
  );
}
