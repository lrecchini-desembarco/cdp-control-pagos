"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, inputClass } from "@/components/ui/primitives";

interface General {
  sku: string;
  nombre: string;
  precio: number;
  precioNeto: number;
  min: number;
  max: number;
  sucursales: number;
  actualizado?: string;
}
interface Fila {
  sku: string;
  nombre: string;
  sucursal: string;
  precio: number;
  precioNeto: number;
  actualizado?: string;
}

const money = (n: number) => "$" + Math.round(n || 0).toLocaleString("es-AR");

export default function PreciosView() {
  const [general, setGeneral] = useState<General[]>([]);
  const [sucursales, setSucursales] = useState<string[]>([]);
  const [source, setSource] = useState("");
  const [modo, setModo] = useState<"general" | "sucursal">("general");
  const [suc, setSuc] = useState("");
  const [filas, setFilas] = useState<Fila[]>([]);
  const [q, setQ] = useState("");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/precios")
      .then((r) => r.json())
      .then((j) => {
        if (!j.ok) return setError(j.error || "No se pudieron leer los precios.");
        setGeneral(j.general || []);
        setSucursales(j.sucursales || []);
        setSource(j.source || "");
      })
      .catch((e) => setError(String(e)))
      .finally(() => setCargando(false));
  }, []);

  function elegirSucursal(s: string) {
    setSuc(s);
    if (!s) return setFilas([]);
    setCargando(true);
    fetch(`/api/precios?sucursal=${encodeURIComponent(s)}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) setFilas(j.porSucursal || []);
      })
      .finally(() => setCargando(false));
  }

  const t = q.trim().toLowerCase();
  const coincide = (n: string, s: string) => !t || n.toLowerCase().includes(t) || s.toLowerCase().includes(t);
  const gen = useMemo(() => general.filter((p) => coincide(p.nombre, p.sku)), [general, t]);
  const fil = useMemo(() => filas.filter((p) => coincide(p.nombre, p.sku)), [filas, t]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-semibold text-ink">Precios de productos</h1>
          <p className="mt-0.5 max-w-2xl text-sm text-muted">
            Precio vigente por producto (el efectivo de la última venta en Tango). Neto y con impuestos, general o por sucursal.
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-2xs font-medium ${
            source === "live" ? "bg-ok/10 text-ok" : "bg-warn/10 text-warn"
          }`}
        >
          {source === "live" ? "Tango en vivo" : "Datos de ejemplo"}
        </span>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <Kpi label="Productos" value={String(general.length)} />
        <Kpi label="Sucursales" value={String(sucursales.length)} />
        <Kpi label="Vista" value={modo === "general" ? "General" : suc || "Por sucursal"} />
      </div>

      {/* Controles */}
      <Card className="flex flex-wrap items-center gap-3 p-3">
        <div className="flex gap-1 rounded-lg border border-line p-0.5">
          <Tab activo={modo === "general"} onClick={() => setModo("general")}>General</Tab>
          <Tab activo={modo === "sucursal"} onClick={() => setModo("sucursal")}>Por sucursal</Tab>
        </div>
        {modo === "sucursal" && (
          <select
            className={`${inputClass} max-w-56`}
            value={suc}
            onChange={(e) => elegirSucursal(e.target.value)}
          >
            <option value="">Elegí una sucursal…</option>
            {sucursales.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        )}
        <input
          className={`${inputClass} ml-auto max-w-64`}
          placeholder="🔎 Buscar producto o SKU…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </Card>

      {error && <Card className="p-4 text-sm text-bad">{error}</Card>}

      {/* Tabla */}
      <Card className="overflow-hidden">
        {modo === "general" ? (
          <Tabla
            cols={["Producto", "Precio (c/imp.)", "Neto", "Rango entre sucursales", "Sucursales"]}
            vacio={cargando ? "Cargando…" : "Sin productos."}
            filas={gen.map((p) => [
              <Prod key="p" nombre={p.nombre} sku={p.sku} />,
              <b key="pr" className="font-mono tnum text-ink">{money(p.precio)}</b>,
              <span key="n" className="font-mono tnum text-muted">{money(p.precioNeto)}</span>,
              <span key="r" className="text-2xs text-faint">
                {p.min && p.max && p.min !== p.max ? `${money(p.min)} – ${money(p.max)}` : "—"}
              </span>,
              <span key="s" className="text-2xs text-faint">{p.sucursales}</span>,
            ])}
          />
        ) : (
          <Tabla
            cols={["Producto", "Precio (c/imp.)", "Neto", "Actualizado"]}
            vacio={!suc ? "Elegí una sucursal arriba." : cargando ? "Cargando…" : "Sin productos en esta sucursal."}
            filas={fil.map((p) => [
              <Prod key="p" nombre={p.nombre} sku={p.sku} />,
              <b key="pr" className="font-mono tnum text-ink">{money(p.precio)}</b>,
              <span key="n" className="font-mono tnum text-muted">{money(p.precioNeto)}</span>,
              <span key="a" className="text-2xs text-faint">{p.actualizado ?? "—"}</span>,
            ])}
          />
        )}
      </Card>
    </div>
  );
}

function Prod({ nombre, sku }: { nombre: string; sku: string }) {
  return (
    <span>
      <span className="text-sm text-ink">{nombre}</span>
      <span className="ml-2 font-mono text-2xs text-faint">{sku}</span>
    </span>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-3">
      <p className="text-2xs uppercase tracking-wide text-faint">{label}</p>
      <p className="mt-0.5 truncate font-display text-lg font-semibold text-ink">{value}</p>
    </Card>
  );
}

function Tab({ children, activo, onClick }: { children: React.ReactNode; activo: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
        activo ? "bg-action text-white" : "text-muted hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function Tabla({ cols, filas, vacio }: { cols: string[]; filas: React.ReactNode[][]; vacio: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-line">
            {cols.map((c, i) => (
              <th
                key={c}
                className={`px-4 py-2.5 text-2xs font-medium uppercase tracking-wide text-faint ${i > 0 ? "text-right" : ""}`}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.length === 0 ? (
            <tr>
              <td colSpan={cols.length} className="px-4 py-6 text-center text-sm text-faint">
                {vacio}
              </td>
            </tr>
          ) : (
            filas.slice(0, 500).map((f, i) => (
              <tr key={i} className="border-b border-line last:border-0 hover:bg-ink/5">
                {f.map((c, j) => (
                  <td key={j} className={`px-4 py-2 align-middle ${j > 0 ? "text-right" : ""}`}>
                    {c}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
