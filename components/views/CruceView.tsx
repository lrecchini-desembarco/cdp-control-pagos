"use client";

import { useEffect, useMemo, useState } from "react";
import { buildCruce } from "@/lib/mock";
import { BRANDS, brandById, fmtInt, fmtPct, severidad } from "@/lib/brands";
import type { BrandId, CruceRow } from "@/lib/types";
import { Badge, Card, EmptyState, Field, inputClass } from "@/components/ui/primitives";
import DetalleModal from "@/components/views/DetalleModal";

type RowDev = CruceRow & { dev: number; pct: number };

type Sort = "desvio" | "producto" | "sucursal";

const toneOf = (s: "ok" | "warn" | "bad") => s;

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

export default function CruceView() {
  const all = useMemo(() => buildCruce(), []);
  const dates = useMemo(
    () => Array.from(new Set(all.map((r) => r.fecha))).sort().reverse(),
    [all]
  );
  const [brand, setBrand] = useState<BrandId | "all">("all");
  const [fecha, setFecha] = useState<string>(dates[0]);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("desvio");
  const [detalle, setDetalle] = useState<RowDev | null>(null);

  // Deep-link desde Alertas: /cruce?fecha=2026-06-29&q=Flores&brand=tasty
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const f = sp.get("fecha");
    if (f && dates.includes(f)) setFecha(f);
    const b = sp.get("brand");
    if (b) setBrand(b as BrandId | "all");
    const query = sp.get("q");
    if (query) setQ(query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows = useMemo(() => {
    let r: CruceRow[] = all.filter((x) => x.fecha === fecha);
    if (brand !== "all") r = r.filter((x) => x.brand === brand);
    if (q.trim()) {
      const t = q.toLowerCase();
      r = r.filter(
        (x) =>
          x.producto.toLowerCase().includes(t) ||
          x.sucursal.toLowerCase().includes(t)
      );
    }
    const withDev = r.map((x) => {
      const dev = x.pedidoCdp - x.ventaEquiv;
      const pct = x.pedidoCdp ? dev / x.pedidoCdp : 0;
      return { ...x, dev, pct };
    });
    withDev.sort((a, b) => {
      if (sort === "desvio") return Math.abs(b.pct) - Math.abs(a.pct);
      if (sort === "producto") return a.producto.localeCompare(b.producto);
      return a.sucursal.localeCompare(b.sucursal);
    });
    return withDev;
  }, [all, brand, fecha, q, sort]);

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
          <h1 className="font-display text-xl font-semibold text-ink">
            Cruce CDP vs ventas
          </h1>
          <p className="mt-0.5 text-sm text-muted">
            Lo que cada sucursal pidió al CDP contra lo que vendió, traducido a insumo.
          </p>
        </div>
      </div>

      {/* Filtros — reconocer mejor que recordar (Nielsen #6) */}
      <Card className="p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <Field label="Fecha de entrega">
            <select className={inputClass} value={fecha} onChange={(e) => setFecha(e.target.value)}>
              {dates.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
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
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Pedido al CDP" value={fmtInt(kpis.pedido)} />
        <Kpi label="Venta equivalente" value={fmtInt(kpis.venta)} />
        <Kpi
          label="Desvío neto"
          value={fmtPct(kpis.neto)}
          tone={severidad(kpis.neto)}
        />
        <Kpi
          label="Fuera de tolerancia"
          value={`${kpis.fuera} / ${kpis.total}`}
          tone={kpis.fuera === 0 ? "ok" : kpis.fuera > kpis.total / 3 ? "bad" : "warn"}
        />
      </div>

      {/* Tabla */}
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <span className="text-2xs font-medium uppercase tracking-wide text-faint">
            {rows.length} líneas · tocá una para ver el detalle
          </span>
          <Legend />
        </div>
        {rows.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="Sin datos para este filtro"
              desc="Probá con otra fecha o sacá la búsqueda. Si esperabas resultados, revisá que la sucursal esté activa y mapeada."
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
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn" | "bad";
}) {
  const color =
    tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : tone === "bad" ? "text-bad" : "text-ink";
  return (
    <Card className="p-4">
      <p className="text-2xs font-medium uppercase tracking-wide text-faint">{label}</p>
      <p className={`mt-1 font-display text-2xl font-semibold tnum ${color}`}>{value}</p>
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
