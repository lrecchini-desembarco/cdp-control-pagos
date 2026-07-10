"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/primitives";
import { descargarCSV } from "@/lib/exportar-csv";
import { parseNumero } from "@/lib/num";
import { armarClaveSuc } from "@/lib/sucursal-key";

// Cruce de COMPRAS (lo que cada local compró/recibió) contra las VENTAS de Tango del
// mismo período. Ingesta flexible: auto-detecta las columnas del CSV que subas, así
// funciona con el formato que tengas (export de Tango, del ERP, o armado a mano).

interface Compra {
  fecha: string;        // ISO yyyy-mm-dd (normalizada)
  proveedor: string;
  sucursal: string;
  codigo: string;
  descripcion: string;
  cantidad: number;
  importe: number;      // $ de la línea (0 si el CSV no lo trae)
  comprobante: string;
}

// Sinónimos aceptados por columna (encabezado normalizado -> campo).
const SINONIMOS: Record<keyof Omit<Compra, never>, string[]> = {
  fecha: ["fecha", "emision", "dia"],
  proveedor: ["proveedor", "razon social", "vendedor", "fabricante"],
  sucursal: ["sucursal", "local", "boca", "deposito", "destino", "punto de venta"],
  codigo: ["codigo", "cod", "sku", "articulo id", "id articulo", "ean"],
  descripcion: ["descripcion", "detalle", "articulo", "producto", "insumo", "nombre", "concepto"],
  cantidad: ["cantidad", "cant", "unidades", "qty", "bultos"],
  importe: ["importe", "total", "monto", "subtotal", "neto", "precio total", "valor"],
  comprobante: ["comprobante", "factura", "remito", "orden", "oc", "numero", "nro", "documento", "comp"],
};

const normH = (s: string) =>
  (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

const money = (n: number) => Math.round(n).toLocaleString("es-AR");

const num = parseNumero;

// dd/mm/aaaa · dd-mm-aa · aaaa-mm-dd -> ISO. "" si no matchea.
function isoDe(s: string): string {
  s = (s || "").trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
  if (m) {
    let [, d, mo, y] = m;
    if (y.length === 2) y = "20" + y;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return "";
}

// Parser CSV con delimitador dado, respeta comillas.
function parseCSV(text: string, delim: string): string[][] {
  const rows: string[][] = [];
  let field = "", row: string[] = [], inQ = false;
  text = text.replace(/^﻿/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === delim) { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (field !== "" || row.length) { row.push(field); rows.push(row); row = []; field = ""; }
      if (c === "\r" && text[i + 1] === "\n") i++;
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

type Campo = keyof typeof SINONIMOS;
const CAMPOS: Campo[] = ["fecha", "proveedor", "sucursal", "codigo", "descripcion", "cantidad", "importe", "comprobante"];
const ETIQUETA: Record<Campo, string> = {
  fecha: "fecha", proveedor: "proveedor", sucursal: "local/sucursal", codigo: "código",
  descripcion: "descripción", cantidad: "cantidad", importe: "importe $", comprobante: "comprobante",
};

export default function ComprasView() {
  const [compras, setCompras] = useState<Compra[]>([]);
  const [detectadas, setDetectadas] = useState<Partial<Record<Campo, boolean>>>({});
  const [archivo, setArchivo] = useState("");
  const [ventasSuc, setVentasSuc] = useState<{ sucursal: string; unidades: number }[]>([]);
  const [rango, setRango] = useState<{ desde: string; hasta: string } | null>(null);
  const [manual, setManual] = useState<{ desde: string; hasta: string }>({ desde: "", hasta: "" });
  const [tab, setTab] = useState<"cobertura" | "proveedor" | "insumo" | "sucursal">("insumo");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  const tieneSuc = !!detectadas.sucursal;
  const tieneProv = !!detectadas.proveedor;
  const tieneImporte = !!detectadas.importe;

  async function fetchVentas(desde: string, hasta: string) {
    if (!desde || !hasta) return;
    setCargando(true);
    try {
      const j = await (await fetch(`/api/ventas/sucursales?desde=${desde}&hasta=${hasta}`)).json();
      setVentasSuc(j.ok ? j.sucursales : []);
      if (!j.ok) setError("Compras cargadas, pero no pude traer ventas de Tango: " + (j.error || ""));
    } catch (e) {
      setError("Compras cargadas, pero falló Tango: " + String(e));
    } finally {
      setCargando(false);
    }
  }

  async function subir(file?: File) {
    if (!file) return;
    setError(""); setVentasSuc([]); setRango(null);
    setArchivo(file.name);
    const text = await file.text();
    const firstLine = text.replace(/^﻿/, "").split(/\r?\n/)[0] || "";
    const delim = (firstLine.split(";").length > firstLine.split(",").length) ? ";" : ",";
    const rows = parseCSV(text, delim);
    if (rows.length < 2) return setError("El CSV está vacío o no se pudo leer.");

    const head = rows[0].map(normH);
    const idxDe = (campo: Campo): number => {
      for (const syn of SINONIMOS[campo]) {
        const i = head.findIndex((h) => h === syn || h.includes(syn));
        if (i >= 0) return i;
      }
      return -1;
    };
    const idx = Object.fromEntries(CAMPOS.map((c) => [c, idxDe(c)])) as Record<Campo, number>;
    const det = Object.fromEntries(CAMPOS.map((c) => [c, idx[c] >= 0])) as Record<Campo, boolean>;
    setDetectadas(det);

    // Mínimo indispensable: algo que identifique el insumo + una cantidad.
    if (idx.codigo < 0 && idx.descripcion < 0) {
      return setError("No encontré una columna de código ni de descripción del insumo. Revisá los encabezados del CSV (podés renombrarlos: 'codigo', 'descripcion', 'cantidad', 'local', 'proveedor', 'importe').");
    }
    if (idx.cantidad < 0 && idx.importe < 0) {
      return setError("No encontré 'cantidad' ni 'importe'. El CSV necesita al menos una de las dos para poder sumar.");
    }

    const g = (r: string[], i: number) => (i >= 0 ? (r[i] ?? "") : "");
    const parsed: Compra[] = rows.slice(1)
      .filter((r) => r.some((c) => c && c.trim() !== ""))
      .map((r) => ({
        fecha: isoDe(g(r, idx.fecha)),
        proveedor: g(r, idx.proveedor).trim(),
        sucursal: g(r, idx.sucursal).trim(),
        codigo: g(r, idx.codigo).trim(),
        descripcion: g(r, idx.descripcion).trim(),
        cantidad: num(g(r, idx.cantidad)),
        importe: num(g(r, idx.importe)),
        comprobante: g(r, idx.comprobante).trim(),
      }));
    setCompras(parsed);
    setTab(det.sucursal ? "cobertura" : det.proveedor ? "proveedor" : "insumo");

    // Cruce vs ventas: solo tiene sentido si hay local. Período: de la fecha, o manual.
    if (det.sucursal) {
      const isos = parsed.map((p) => p.fecha).filter(Boolean).sort();
      if (isos.length) {
        const desde = isos[0], hasta = isos[isos.length - 1];
        setRango({ desde, hasta });
        setManual({ desde, hasta });
        fetchVentas(desde, hasta);
      }
    }
  }

  const porInsumo = useMemo(() => {
    const m = new Map<string, { codigo: string; descripcion: string; cantidad: number; importe: number; refs: Set<string> }>();
    for (const c of compras) {
      const key = c.codigo || c.descripcion;
      const a = m.get(key) ?? { codigo: c.codigo, descripcion: c.descripcion || c.codigo, cantidad: 0, importe: 0, refs: new Set() };
      a.cantidad += c.cantidad; a.importe += c.importe;
      a.refs.add(tieneProv ? c.proveedor : c.sucursal);
      if (!a.descripcion && c.descripcion) a.descripcion = c.descripcion;
      m.set(key, a);
    }
    return Array.from(m.values()).sort((a, b) => b.importe - a.importe || b.cantidad - a.cantidad);
  }, [compras, tieneProv]);

  const porProveedor = useMemo(() => {
    const m = new Map<string, { proveedor: string; lineas: number; cantidad: number; importe: number; insumos: Set<string> }>();
    for (const c of compras) {
      const k = c.proveedor || "(sin proveedor)";
      const a = m.get(k) ?? { proveedor: k, lineas: 0, cantidad: 0, importe: 0, insumos: new Set() };
      a.lineas++; a.cantidad += c.cantidad; a.importe += c.importe; a.insumos.add(c.codigo || c.descripcion);
      m.set(k, a);
    }
    return Array.from(m.values()).sort((a, b) => b.importe - a.importe);
  }, [compras]);

  const porSucursal = useMemo(() => {
    const m = new Map<string, { sucursal: string; lineas: number; cantidad: number; importe: number }>();
    for (const c of compras) {
      const k = c.sucursal || "(sin local)";
      const a = m.get(k) ?? { sucursal: k, lineas: 0, cantidad: 0, importe: 0 };
      a.lineas++; a.cantidad += c.cantidad; a.importe += c.importe;
      m.set(k, a);
    }
    return Array.from(m.values()).sort((a, b) => b.importe - a.importe || b.cantidad - a.cantidad);
  }, [compras]);

  // Auditoría de cobertura: local con compra ↔ con ventas (Tango).
  const cobertura = useMemo(() => {
    // Misma reconciliación que el Cruce: no fusiona "Mrt X" con el "X" de El Desembarco.
    const clave = armarClaveSuc([...compras.map((c) => c.sucursal).filter(Boolean), ...ventasSuc.map((v) => v.sucursal)]);
    const compBy = new Map<string, { disp: string; cant: number; imp: number }>();
    for (const c of compras) {
      if (!c.sucursal) continue;
      const n = clave(c.sucursal);
      const a = compBy.get(n) ?? { disp: c.sucursal, cant: 0, imp: 0 };
      a.cant += c.cantidad; a.imp += c.importe; compBy.set(n, a);
    }
    const venBy = new Map<string, { disp: string; u: number }>();
    for (const v of ventasSuc) {
      const n = clave(v.sucursal);
      const a = venBy.get(n) ?? { disp: v.sucursal, u: 0 };
      a.u += v.unidades; venBy.set(n, a);
    }
    const claves = new Set(Array.from(compBy.keys()).concat(Array.from(venBy.keys())));
    const filas = Array.from(claves).map((n) => {
      const tc = compBy.has(n), tv = venBy.has(n);
      return {
        sucursal: compBy.get(n)?.disp ?? venBy.get(n)?.disp ?? n,
        compra: tc, ventas: tv,
        estado: tc && tv ? "OK" : tc ? "COMPRA SIN VENTAS" : "VENTAS SIN COMPRA",
        cantidad: tc ? Math.round(compBy.get(n)!.cant) : 0,
        importe: tc ? Math.round(compBy.get(n)!.imp) : 0,
        unidades: tv ? Math.round(venBy.get(n)!.u) : 0,
      };
    });
    const orden = { "COMPRA SIN VENTAS": 0, "VENTAS SIN COMPRA": 1, OK: 2 } as Record<string, number>;
    return filas.sort((a, b) => orden[a.estado] - orden[b.estado] || a.sucursal.localeCompare(b.sucursal));
  }, [compras, ventasSuc]);

  const alertas = cobertura.filter((c) => c.estado === "COMPRA SIN VENTAS").length;
  const totalImporte = useMemo(() => compras.reduce((s, c) => s + c.importe, 0), [compras]);

  function exportar() {
    if (tab === "cobertura")
      descargarCSV("compras_cobertura", ["Local", "Tiene compra", "Tiene ventas", "Estado", "Cantidad comprada", "Importe comprado", "Unidades vendidas"],
        cobertura.map((c) => [c.sucursal, c.compra ? "sí" : "no", c.ventas ? "sí" : "no", c.estado, c.cantidad, c.importe, c.unidades]));
    else if (tab === "proveedor")
      descargarCSV("compras_por_proveedor", ["Proveedor", "Líneas", "Insumos", "Cantidad", "Importe"],
        porProveedor.map((p) => [p.proveedor, p.lineas, p.insumos.size, Math.round(p.cantidad), Math.round(p.importe)]));
    else if (tab === "sucursal")
      descargarCSV("compras_por_local", ["Local", "Líneas", "Cantidad", "Importe"],
        porSucursal.map((p) => [p.sucursal, p.lineas, Math.round(p.cantidad), Math.round(p.importe)]));
    else
      descargarCSV("compras_por_insumo", ["Código", "Insumo", "Cantidad total", "Importe total", tieneProv ? "Proveedores" : "Locales"],
        porInsumo.map((p) => [p.codigo, p.descripcion, Math.round(p.cantidad), Math.round(p.importe), p.refs.size]));
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-xl font-semibold text-ink">Compras vs Ventas</h1>
        <p className="mt-0.5 max-w-2xl text-sm text-muted">
          Subí el CSV de compras (lo que cada local compró/recibió) y audita la cobertura contra las ventas de
          Tango del mismo período: qué locales compraron y no registran ventas (y viceversa). Exportable a Google Sheets/Excel.
        </p>
      </div>

      {/* Carga + mini-tutorial */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="cursor-pointer rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:border-action/40 hover:text-action">
            Elegir CSV de compras…
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => subir(e.target.files?.[0])} />
          </label>
          {archivo && <span className="text-2xs text-faint">{archivo}</span>}
          {rango && <span className="text-2xs text-faint">· período {rango.desde} → {rango.hasta}</span>}
          {cargando && <span className="text-2xs text-action">trayendo ventas…</span>}
        </div>

        {/* Columnas detectadas (feedback de que entendió el archivo) */}
        {compras.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {CAMPOS.map((c) => (
              <span key={c} className={`rounded-full px-2 py-0.5 text-2xs font-medium ${detectadas[c] ? "bg-ok/10 text-ok" : "bg-ink/5 text-faint line-through"}`}>
                {detectadas[c] ? "✓ " : "— "}{ETIQUETA[c]}
              </span>
            ))}
          </div>
        )}
      </Card>

      {error && <Card className="p-3 text-sm text-bad">{error}</Card>}

      {/* Estado vacío = mini-tutorial */}
      {compras.length === 0 && !error && (
        <Card className="p-5">
          <p className="font-display text-sm font-semibold text-ink">Cómo usarlo (3 pasos)</p>
          <ol className="mt-3 space-y-2.5 text-sm text-muted">
            <li className="flex gap-2"><b className="text-action">1.</b> <span>Conseguí el CSV de compras: exportalo de Tango/ERP, o si tenés Excel, guardalo como <b>CSV</b> (Archivo → Guardar como → CSV).</span></li>
            <li className="flex gap-2"><b className="text-action">2.</b> <span>Tocá <b>“Elegir CSV de compras…”</b> y subilo. La pantalla <b>detecta las columnas solas</b> y te muestra cuáles reconoció.</span></li>
            <li className="flex gap-2"><b className="text-action">3.</b> <span>Mirá las pestañas (<b>Cobertura, Por proveedor, Por insumo, Por local</b>) y exportá la que quieras con <b>⬇ Exportar</b>.</span></li>
          </ol>
          <div className="mt-4 rounded-lg border border-line bg-paper/60 p-3">
            <p className="text-2xs font-medium uppercase tracking-wide text-faint">Columnas que reconoce (flexible)</p>
            <p className="mt-1 text-xs text-muted">
              <b>fecha</b> · <b>proveedor</b> · <b>local/sucursal</b> · <b>código</b> · <b>descripción</b> · <b>cantidad</b> · <b>importe $</b> · <b>comprobante</b>.
              Acepta separador <code className="rounded bg-paper px-1">;</code> o <code className="rounded bg-paper px-1">,</code> y números en formato argentino (1.234,56).
              Mínimo necesita <b>código o descripción</b> + <b>cantidad o importe</b>. Para el cruce contra ventas necesita la columna <b>local/sucursal</b>.
            </p>
          </div>
        </Card>
      )}

      {compras.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Líneas de compra" value={String(compras.length)} />
            <Kpi label={tieneProv ? "Proveedores" : "Locales"} value={String(tieneProv ? porProveedor.length : porSucursal.length)} />
            <Kpi label="Insumos" value={String(porInsumo.length)} />
            {tieneImporte
              ? <Kpi label="$ Total comprado" value={"$" + money(totalImporte)} money />
              : <Kpi label={tieneSuc ? "🔴 Compra sin ventas" : "Comprobantes"} value={tieneSuc ? (cargando ? "…" : String(alertas)) : String(new Set(compras.map((c) => c.comprobante).filter(Boolean)).size)} tone={tieneSuc && alertas ? "bad" : undefined} />}
          </div>

          <Card className="flex flex-wrap items-center gap-3 p-3">
            <div className="flex flex-wrap gap-1 rounded-lg border border-line p-0.5">
              {tieneSuc && <Tab activo={tab === "cobertura"} onClick={() => setTab("cobertura")}>Cobertura (audit)</Tab>}
              {tieneProv && <Tab activo={tab === "proveedor"} onClick={() => setTab("proveedor")}>Por proveedor</Tab>}
              <Tab activo={tab === "insumo"} onClick={() => setTab("insumo")}>Por insumo</Tab>
              {tieneSuc && <Tab activo={tab === "sucursal"} onClick={() => setTab("sucursal")}>Por local</Tab>}
            </div>
            <button
              onClick={exportar}
              title="Exporta la pestaña activa a CSV (Excel / Google Sheets)"
              className="ml-auto shrink-0 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:border-action/40 hover:text-action"
            >
              ⬇ Exportar {tab === "cobertura" ? "cobertura" : tab === "proveedor" ? "por proveedor" : tab === "sucursal" ? "por local" : "por insumo"}
            </button>
          </Card>

          {/* Cruce vs ventas sin fecha en el CSV: pedir período manual */}
          {tab === "cobertura" && tieneSuc && !rango && (
            <Card className="flex flex-wrap items-end gap-3 p-3">
              <span className="text-2xs text-faint">El CSV no trae fecha. Elegí el período para traer las ventas de Tango:</span>
              <label className="text-2xs text-faint">Desde<input type="date" value={manual.desde} onChange={(e) => setManual((m) => ({ ...m, desde: e.target.value }))} className="ml-1 rounded border border-line bg-surface px-2 py-1 text-xs text-ink" /></label>
              <label className="text-2xs text-faint">Hasta<input type="date" value={manual.hasta} onChange={(e) => setManual((m) => ({ ...m, hasta: e.target.value }))} className="ml-1 rounded border border-line bg-surface px-2 py-1 text-xs text-ink" /></label>
              <button onClick={() => { setRango(manual); fetchVentas(manual.desde, manual.hasta); }} disabled={!manual.desde || !manual.hasta}
                className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:border-action/40 hover:text-action disabled:opacity-40">
                Traer ventas
              </button>
            </Card>
          )}

          <Card className="overflow-hidden">
            {tab === "cobertura" && tieneSuc && (
              <Tabla cols={["Local", "Compra", "Ventas", "Estado", "Cant. comprada", "Importe $", "Unidades vend."]}
                filas={cobertura.map((c) => [
                  <span key="s" className="text-sm text-ink">{c.sucursal}</span>,
                  <span key="c">{c.compra ? "✅" : "—"}</span>,
                  <span key="v">{c.ventas ? "✅" : "—"}</span>,
                  <Estado key="e" v={c.estado} />,
                  <span key="q" className="font-mono tnum text-muted">{money(c.cantidad)}</span>,
                  <span key="i" className="font-mono tnum text-muted monto">{tieneImporte ? "$" + money(c.importe) : "—"}</span>,
                  <span key="u" className="font-mono tnum text-muted">{money(c.unidades)}</span>,
                ])} />
            )}
            {tab === "proveedor" && tieneProv && (
              <Tabla cols={["Proveedor", "Líneas", "Insumos", "Cantidad", "Importe $"]}
                filas={porProveedor.map((p) => [
                  <span key="p" className="text-sm text-ink">{p.proveedor}</span>,
                  <span key="l" className="font-mono tnum text-faint">{p.lineas}</span>,
                  <span key="n" className="font-mono tnum text-faint">{p.insumos.size}</span>,
                  <b key="q" className="font-mono tnum text-ink">{money(p.cantidad)}</b>,
                  <b key="i" className="font-mono tnum text-ink monto">{tieneImporte ? "$" + money(p.importe) : "—"}</b>,
                ])} />
            )}
            {tab === "insumo" && (
              <Tabla cols={["Código", "Insumo", "Cantidad total", "Importe $", tieneProv ? "Proveedores" : "Locales"]}
                filas={porInsumo.map((p) => [
                  <span key="c" className="font-mono text-2xs text-faint">{p.codigo || "—"}</span>,
                  <span key="d" className="text-sm text-ink">{p.descripcion}</span>,
                  <b key="q" className="font-mono tnum text-ink">{money(p.cantidad)}</b>,
                  <b key="i" className="font-mono tnum text-ink monto">{tieneImporte ? "$" + money(p.importe) : "—"}</b>,
                  <span key="r" className="text-2xs text-faint">{p.refs.size}</span>,
                ])} />
            )}
            {tab === "sucursal" && tieneSuc && (
              <Tabla cols={["Local", "Líneas", "Cantidad", "Importe $"]}
                filas={porSucursal.map((p) => [
                  <span key="s" className="text-sm text-ink">{p.sucursal}</span>,
                  <span key="l" className="font-mono tnum text-faint">{p.lineas}</span>,
                  <b key="q" className="font-mono tnum text-ink">{money(p.cantidad)}</b>,
                  <b key="i" className="font-mono tnum text-ink monto">{tieneImporte ? "$" + money(p.importe) : "—"}</b>,
                ])} />
            )}
          </Card>

          {tab === "cobertura" && tieneSuc && (
            <p className="text-2xs text-faint">
              "COMPRA SIN VENTAS" = el local compró/recibió pero no registra ventas en Tango en el período (revisar: merma, robo, o falta de carga). "VENTAS
              SIN COMPRA" = vende pero no figura compra en el período (se abastece por otra vía). El cruce es a nivel <b>local</b>;
              el detalle unidad-a-unidad insumo↔producto necesita la receta (BOM).
            </p>
          )}
        </>
      )}
    </div>
  );
}

function Estado({ v }: { v: string }) {
  const tono = v === "OK" ? "bg-ok/10 text-ok" : v === "COMPRA SIN VENTAS" ? "bg-bad/10 text-bad" : "bg-warn/10 text-warn";
  return <span className={`rounded-full px-2 py-0.5 text-2xs font-medium ${tono}`}>{v}</span>;
}

function Kpi({ label, value, tone, money }: { label: string; value: string; tone?: "bad"; money?: boolean }) {
  return (
    <Card className="p-3">
      <p className="text-2xs uppercase tracking-wide text-faint">{label}</p>
      <p className={`mt-0.5 font-display text-lg font-semibold ${tone === "bad" ? "text-bad" : "text-ink"} ${money ? "monto" : ""}`}>{value}</p>
    </Card>
  );
}

function Tab({ children, activo, onClick }: { children: React.ReactNode; activo: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${activo ? "bg-action text-white" : "text-muted hover:text-ink"}`}>
      {children}
    </button>
  );
}

function Tabla({ cols, filas }: { cols: string[]; filas: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-line">
            {cols.map((c, i) => (
              <th key={c} className={`px-4 py-2.5 text-2xs font-medium uppercase tracking-wide text-faint ${i > 3 ? "text-right" : ""}`}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.length === 0 ? (
            <tr><td colSpan={cols.length} className="px-4 py-6 text-center text-sm text-faint">Sin datos.</td></tr>
          ) : (
            filas.slice(0, 800).map((f, i) => (
              <tr key={i} className="border-b border-line last:border-0 hover:bg-ink/5">
                {f.map((c, j) => (
                  <td key={j} className={`px-4 py-2 align-middle ${j > 3 ? "text-right" : ""}`}>{c}</td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
