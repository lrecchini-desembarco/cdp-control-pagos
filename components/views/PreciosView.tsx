"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, inputClass } from "@/components/ui/primitives";
import { descargarCSV } from "@/lib/exportar-csv";
import { fmtCompacto } from "@/lib/brands";

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

interface Comparacion {
  marca: string;
  nombre: string;
  precioWeb: number;
  precioTango: number | null;
  tangoNombre: string | null;
  tangoActualizado: string | null;
  diffPct: number | null;
  estado: "ok" | "dif" | "alerta" | "nomatch";
}

const money = (n: number) => "$" + Math.round(n || 0).toLocaleString("es-AR");
// Compacto para leer la magnitud (mil / M). El exacto va en el tooltip (title).
const moneyC = (n: number) => "$" + fmtCompacto(n || 0);
const Money = ({ n, bold, tone }: { n: number; bold?: boolean; tone?: string }) => {
  const Tag = bold ? "b" : "span";
  return <Tag title={money(n)} className={`font-mono tnum ${tone ?? (bold ? "text-ink" : "text-muted")}`}>{moneyC(n)}</Tag>;
};

// Activo en Tango = con venta en los últimos 30 días (por la fecha de "actualizado").
const HACE_30D = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
const esActivo = (actualizado?: string | null) => !!actualizado && actualizado >= HACE_30D;

function TagTango({ actualizado }: { actualizado?: string | null }) {
  if (!actualizado) return <span className="text-2xs text-faint">—</span>;
  const act = esActivo(actualizado);
  return (
    <span className={`rounded-full px-2 py-0.5 text-2xs font-medium ${act ? "bg-ok/10 text-ok" : "bg-warn/10 text-warn"}`}>
      {act ? "Activo" : "Inactivo"}
    </span>
  );
}

export default function PreciosView() {
  const [general, setGeneral] = useState<General[]>([]);
  const [sucursales, setSucursales] = useState<string[]>([]);
  const [source, setSource] = useState("");
  const [modo, setModo] = useState<"general" | "sucursal" | "web">("general");
  const [suc, setSuc] = useState("");
  const [filas, setFilas] = useState<Fila[]>([]);
  const [q, setQ] = useState("");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [comp, setComp] = useState<Comparacion[] | null>(null);
  const [compResumen, setCompResumen] = useState<any>(null);
  const [compCargando, setCompCargando] = useState(false);

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

  function verComparacion() {
    setModo("web");
    if (comp || compCargando) return; // lazy: una sola vez
    setCompCargando(true);
    fetch("/api/precios/comparar")
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) {
          setComp(j.filas || []);
          setCompResumen(j.resumen);
        } else setError(j.error || "No se pudo comparar con la web.");
      })
      .catch((e) => setError(String(e)))
      .finally(() => setCompCargando(false));
  }

  const t = q.trim().toLowerCase();
  const coincide = (n: string, s: string) => !t || n.toLowerCase().includes(t) || s.toLowerCase().includes(t);
  const compFil = useMemo(
    () => (comp ?? []).filter((c) => coincide(c.nombre, c.tangoNombre ?? "")),
    [comp, t]
  );
  const gen = useMemo(() => general.filter((p) => coincide(p.nombre, p.sku)), [general, t]);
  const fil = useMemo(() => filas.filter((p) => coincide(p.nombre, p.sku)), [filas, t]);

  const estadoTango = (a?: string | null) => (a ? (esActivo(a) ? "Activo" : "Inactivo") : "sin dato");

  function exportar() {
    if (modo === "general") {
      descargarCSV(
        "precios_general",
        ["Producto", "SKU", "Estado Tango", "Precio (c/imp.)", "Neto", "Mín sucursal", "Máx sucursal", "Sucursales", "Última venta"],
        gen.map((p) => [p.nombre, p.sku, estadoTango(p.actualizado), p.precio, p.precioNeto, p.min, p.max, p.sucursales, p.actualizado ?? ""])
      );
    } else if (modo === "sucursal") {
      descargarCSV(
        `precios_${suc || "sucursal"}`,
        ["Producto", "SKU", "Estado Tango", "Precio (c/imp.)", "Neto", "Actualizado"],
        fil.map((p) => [p.nombre, p.sku, estadoTango(p.actualizado), p.precio, p.precioNeto, p.actualizado ?? ""])
      );
    } else {
      descargarCSV(
        "precios_web_vs_tango",
        ["Producto (web)", "En web", "Estado Tango", "Web (lista)", "Tango (efectivo)", "Dif %", "Match Tango"],
        compFil
          .filter((c) => c.precioTango != null)
          .map((c) => [c.nombre, "sí", estadoTango(c.tangoActualizado), c.precioWeb, c.precioTango, c.diffPct, c.tangoNombre ?? ""])
      );
    }
  }

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
          <Tab activo={modo === "web"} onClick={verComparacion}>Web vs Tango</Tab>
        </div>
        {modo === "web" && compResumen && (
          <span className="text-2xs text-faint">
            {compResumen.matcheados}/{compResumen.web} match · {compResumen.ok} ≈ok · {compResumen.alerta} ‼
          </span>
        )}
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
        <button
          onClick={exportar}
          title="Descarga un CSV para abrir en Google Sheets (Archivo → Importar) o Excel"
          className="shrink-0 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-action/40 hover:text-action"
        >
          ⬇ Exportar (Sheets/Excel)
        </button>
      </Card>

      {error && <Card className="p-4 text-sm text-bad">{error}</Card>}

      {/* Tabla */}
      <Card className="overflow-hidden">
        {modo === "general" && (
          <Tabla
            cols={["Producto", "Tango", "Precio (c/imp.)", "Neto", "Rango entre sucursales", "Sucursales"]}
            vacio={cargando ? "Cargando…" : "Sin productos."}
            filas={gen.map((p) => [
              <Prod key="p" nombre={p.nombre} sku={p.sku} />,
              <TagTango key="t" actualizado={p.actualizado} />,
              <Money key="pr" n={p.precio} bold />,
              <Money key="n" n={p.precioNeto} />,
              <span key="r" title={p.min && p.max ? `${money(p.min)} – ${money(p.max)}` : ""} className="text-2xs text-faint">
                {p.min && p.max && p.min !== p.max ? `${moneyC(p.min)} – ${moneyC(p.max)}` : "—"}
              </span>,
              <span key="s" className="text-2xs text-faint">{p.sucursales}</span>,
            ])}
          />
        )}
        {modo === "sucursal" && (
          <Tabla
            cols={["Producto", "Tango", "Precio (c/imp.)", "Neto", "Actualizado"]}
            vacio={!suc ? "Elegí una sucursal arriba." : cargando ? "Cargando…" : "Sin productos en esta sucursal."}
            filas={fil.map((p) => [
              <Prod key="p" nombre={p.nombre} sku={p.sku} />,
              <TagTango key="t" actualizado={p.actualizado} />,
              <Money key="pr" n={p.precio} bold />,
              <Money key="n" n={p.precioNeto} />,
              <span key="a" className="text-2xs text-faint">{p.actualizado ?? "—"}</span>,
            ])}
          />
        )}
        {modo === "web" && (
          <Tabla
            cols={["Producto (web)", "En web", "Tango", "Web (lista)", "Tango (efectivo)", "Dif", "Match Tango"]}
            vacio={compCargando ? "Comparando con la web…" : "Sin datos."}
            filas={compFil
              .filter((c) => c.precioTango != null)
              .sort((a, b) => Math.abs(b.diffPct ?? 0) - Math.abs(a.diffPct ?? 0))
              .map((c) => [
                <span key="p" className="text-sm text-ink">{c.nombre}</span>,
                <span key="ew" className="rounded-full bg-ok/10 px-2 py-0.5 text-2xs font-medium text-ok">En menú</span>,
                <TagTango key="tg" actualizado={c.tangoActualizado} />,
                <Money key="w" n={c.precioWeb} bold />,
                <Money key="t" n={c.precioTango!} />,
                <Dif key="d" pct={c.diffPct} estado={c.estado} />,
                <span key="m" className="text-2xs text-faint">{c.tangoNombre}</span>,
              ])}
          />
        )}
      </Card>
      {modo === "web" && (
        <p className="text-2xs text-faint">
          Web = precio de <b>lista</b> (WooCommerce) · Tango = precio <b>efectivo</b> cobrado (incluye promos/combos).
          Los ‼ suelen ser productos que en Tango solo existen como combo/promo. Un patrón “Tango arriba” = carta web desactualizada.
        </p>
      )}
    </div>
  );
}

function Dif({ pct, estado }: { pct: number | null; estado: string }) {
  if (pct == null) return <span className="text-2xs text-faint">—</span>;
  const tono = estado === "ok" ? "text-ok" : estado === "dif" ? "text-warn" : "text-bad";
  const icono = estado === "ok" ? "" : estado === "alerta" ? " ‼" : "";
  return (
    <span className={`font-mono text-sm font-semibold tnum ${tono}`}>
      {pct > 0 ? "+" : ""}
      {pct}%{icono}
    </span>
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
