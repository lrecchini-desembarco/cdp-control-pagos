"use client";

import { useEffect, useMemo, useState } from "react";
import { TURNOS } from "@/lib/turnos";
import { BRANDS, brandById, fmtInt, todayISO } from "@/lib/brands";
import { Card, EmptyState, ErrorState, Field, inputClass, Skeleton } from "@/components/ui/primitives";
import { descargarCSV } from "@/lib/exportar-csv";

interface Articulo {
  sku: string;
  nombre: string;
  marca: string;
  porTurno: Record<string, number>;
  total: number;
}
interface Data {
  articulos: Articulo[];
  totalPorTurno: Record<string, number>;
  total: number;
  sucursales: { canonico: string; nombre: string }[];
}
type Status = "loading" | "ok" | "error";

function isoMinusDays(iso: string, n: number) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export default function VentasView() {
  const hoy = todayISO();
  const [desde, setDesde] = useState(isoMinusDays(hoy, 6));
  const [hasta, setHasta] = useState(hoy);
  const [marca, setMarca] = useState("");
  const [sucursal, setSucursal] = useState("");
  const [q, setQ] = useState("");
  const [data, setData] = useState<Data>({ articulos: [], totalPorTurno: {}, total: 0, sucursales: [] });
  const [status, setStatus] = useState<Status>("loading");
  const [errMsg, setErrMsg] = useState("");

  async function cargar() {
    setStatus("loading");
    try {
      const params = new URLSearchParams({ desde, hasta });
      if (marca) params.set("marca", marca);
      if (sucursal) params.set("sucursal", sucursal);
      const j = await (await fetch(`/api/ventas?${params}`)).json();
      if (!j.ok) throw new Error(j.error ?? "No se pudieron leer las ventas.");
      setData({ articulos: j.articulos, totalPorTurno: j.totalPorTurno, total: j.total, sucursales: j.sucursales });
      setStatus("ok");
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : "Error.");
      setStatus("error");
    }
  }
  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desde, hasta, marca, sucursal]);

  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? data.articulos.filter((a) => a.nombre.toLowerCase().includes(t) || a.sku.includes(t)) : data.articulos;
  }, [data.articulos, q]);

  const pct = (n: number) => (data.total ? Math.round((n / data.total) * 100) : 0);

  function exportar() {
    const cols = ["Artículo", "Código", "Marca", ...TURNOS.map((t) => t.label), "Total"];
    const filas = visibles.map((a) => [
      a.nombre,
      a.sku,
      a.marca,
      ...TURNOS.map((t) => a.porTurno[t.slug] ?? 0),
      a.total,
    ]);
    descargarCSV(`ventas_${desde}_a_${hasta}`, cols, filas);
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-xl font-semibold text-ink">Ventas por turno</h1>
        <p className="mt-0.5 text-sm text-muted">
          Unidades vendidas de cada artículo, desglosadas por turno. Filtrá por fecha, marca y sucursal.
        </p>
      </div>

      {/* Filtros */}
      <Card className="p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Desde">
            <input type="date" className={inputClass} value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} />
          </Field>
          <Field label="Hasta">
            <input type="date" className={inputClass} value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} />
          </Field>
          <Field label="Sucursal">
            <select className={inputClass} value={sucursal} onChange={(e) => setSucursal(e.target.value)}>
              <option value="">Todas</option>
              {data.sucursales.map((s) => (
                <option key={s.canonico} value={s.canonico}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Buscar artículo">
            <input className={inputClass} placeholder="Nombre o código…" value={q} onChange={(e) => setQ(e.target.value)} />
          </Field>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-2xs font-medium uppercase tracking-wide text-faint">Marca</span>
          <Chip active={marca === ""} onClick={() => setMarca("")}>Todas</Chip>
          {BRANDS.map((b) => (
            <Chip key={b.id} active={marca === b.id} onClick={() => setMarca(b.id)}>
              {b.name}
            </Chip>
          ))}
        </div>
      </Card>

      {/* KPIs por turno */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Total vendido" value={fmtInt(data.total)} sub="en el período" />
        {TURNOS.map((t) => (
          <Kpi
            key={t.slug}
            label={t.label}
            value={fmtInt(data.totalPorTurno[t.slug] ?? 0)}
            sub={`${pct(data.totalPorTurno[t.slug] ?? 0)}% del total`}
          />
        ))}
      </div>

      {/* Tabla artículo × turno */}
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2">
          <span className="text-2xs font-medium uppercase tracking-wide text-faint">
            {status === "ok" ? `${visibles.length} artículos` : "Cargando…"}
          </span>
          {status === "ok" && visibles.length > 0 && (
            <button
              onClick={exportar}
              title="Descarga un CSV para abrir en Google Sheets (Archivo → Importar) o Excel"
              className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-action/40 hover:text-action"
            >
              ⬇ Exportar (Sheets/Excel)
            </button>
          )}
        </div>
        {status === "loading" ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : status === "error" ? (
          <div className="p-4">
            <ErrorState msg={errMsg} onRetry={cargar} />
          </div>
        ) : visibles.length === 0 ? (
          <div className="p-6">
            <EmptyState title="Sin ventas para este filtro" desc="Probá con otro rango, marca o sucursal." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-2xs uppercase tracking-wide text-faint">
                  <th className="px-4 py-2 font-medium">Artículo</th>
                  {TURNOS.map((t) => (
                    <th key={t.slug} className="px-4 py-2 text-right font-medium">
                      {t.label}
                    </th>
                  ))}
                  <th className="px-4 py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((a) => (
                  <tr key={a.sku} className="border-b border-line/70 last:border-0 hover:bg-ink/[0.015]">
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center gap-2">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: marcaColor(a.marca) }} />
                        <span className="text-ink">{a.nombre}</span>
                        <span className="font-mono text-2xs text-faint">{a.sku}</span>
                      </span>
                    </td>
                    {TURNOS.map((t) => {
                      const v = a.porTurno[t.slug] ?? 0;
                      return (
                        <td key={t.slug} className="px-4 py-2.5 text-right font-mono tnum text-muted">
                          {fmtInt(v)}
                          <span className="ml-1 text-2xs text-faint">{a.total ? `${Math.round((v / a.total) * 100)}%` : ""}</span>
                        </td>
                      );
                    })}
                    <td className="px-4 py-2.5 text-right font-mono font-medium tnum text-ink">{fmtInt(a.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function marcaColor(marca: string): string {
  try {
    return brandById(marca as any).color;
  } catch {
    return "#9aa0a6";
  }
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="p-4">
      <p className="text-2xs font-medium uppercase tracking-wide text-faint">{label}</p>
      <p className="mt-1 font-display text-2xl font-semibold tnum text-ink">{value}</p>
      {sub && <p className="mt-0.5 text-2xs text-faint">{sub}</p>}
    </Card>
  );
}

function Chip({ children, active, onClick }: { children: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 text-2xs font-medium transition-colors ${
        active ? "border-action bg-action/10 text-action" : "border-line text-muted hover:bg-ink/5"
      }`}
    >
      {children}
    </button>
  );
}
