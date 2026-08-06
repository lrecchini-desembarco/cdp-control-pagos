"use client";

import { useMemo, useState } from "react";
import { Card, inputClass } from "@/components/ui/primitives";
import { descargarCSV } from "@/lib/exportar-csv";
import { parseNumero } from "@/lib/num";
import { armarClaveSuc } from "@/lib/sucursal-key";
import { parseRemitosPdf, mergeRemitos, type Remito } from "@/lib/remitos";
import type { PdfItem } from "@/lib/bancos";

// Acepta PDFs de remitos del CDP directo (parseados client-side con pdfjs) y el
// CSV consolidado de scripts/parsear-remitos.py (fecha,marca,sucursal,codigo,...).
// Las cargas se ACUMULAN: se pueden subir varios archivos, incluso repetidos —
// un remito ya cargado (mismo número) no se duplica.

// pdfjs se carga on-demand (recién al procesar un PDF) para no pesar el bundle.
// Import NATIVO desde /public (no webpack): el .mjs de pdfjs-dist v5 rompe el
// require de webpack en `next dev` ("Object.defineProperty called on non-object").
let pdfjsMod: any = null;
async function extraerItemsPdf(buf: ArrayBuffer): Promise<PdfItem[][]> {
  if (!pdfjsMod) { pdfjsMod = await (Function("u", "return import(u)")("/pdf.min.mjs")); pdfjsMod.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs"; }
  const doc = await pdfjsMod.getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise;
  const pags: PdfItem[][] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent();
    pags.push(tc.items.map((i: any) => ({ s: String(i.str || "").trim(), x: i.transform?.[4] ?? 0, y: Math.round(i.transform?.[5] ?? 0) })).filter((i: PdfItem) => i.s));
  }
  return pags;
}

interface Carga { nombre: string; agregadas: number; duplicadas: number }

// Parser CSV mínimo que respeta comillas (descripciones con comas).
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let field = "",
    row: string[] = [],
    inQ = false;
  text = text.replace(/^﻿/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (field !== "" || row.length) { row.push(field); rows.push(row); row = []; field = ""; }
      if (c === "\r" && text[i + 1] === "\n") i++;
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const norm = (s: string) =>
  (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/^mrt\s+/, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const money = (n: number) => Math.round(n).toLocaleString("es-AR");
const isoDe = (ddmmaa: string) => {
  const m = ddmmaa.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
};

export default function RemitosView() {
  const [remitos, setRemitos] = useState<Remito[]>([]);
  const [cargas, setCargas] = useState<Carga[]>([]);
  const [ventasSuc, setVentasSuc] = useState<{ sucursal: string; unidades: number }[]>([]);
  const [rango, setRango] = useState<{ desde: string; hasta: string } | null>(null);
  const [tab, setTab] = useState<"cobertura" | "sucursal" | "insumo">("cobertura");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  const [leyendo, setLeyendo] = useState(false);

  // Un archivo (PDF o CSV) → líneas de remito. Tira Error con mensaje para el usuario.
  async function parsearArchivo(file: File): Promise<Remito[]> {
    if (/\.pdf$/i.test(file.name) || file.type === "application/pdf") {
      const parsed = parseRemitosPdf(await extraerItemsPdf(await file.arrayBuffer()));
      if (!parsed.length) throw new Error(`${file.name}: no encontré remitos en el PDF. ¿Es el PDF de remitos de entrega del CDP?`);
      return parsed;
    }
    const rows = parseCSV(await file.text());
    if (rows.length < 2) throw new Error(`${file.name}: el CSV está vacío o no se pudo leer.`);
    const head = rows[0].map((h) => norm(h));
    const idx = (name: string) => head.findIndex((h) => h.includes(name));
    const iF = idx("fecha"), iM = idx("marca"), iS = idx("sucursal"), iC = idx("codigo"), iD = idx("descripcion"), iQ = idx("cantidad"), iR = idx("remito");
    if (iS < 0 || iC < 0 || iQ < 0) {
      const esAuditoria = head.some((h) => h.includes("tiene remito") || h.includes("tiene ventas") || h === "estado");
      throw new Error(
        esAuditoria
          ? `${file.name}: ese es el CSV de AUDITORÍA (la salida de esta pantalla), no el de entrada. Subí los PDF de remitos o el DETALLE (remitos_consolidado.csv), que tiene columnas 'codigo' y 'cantidad' por fila.`
          : `${file.name}: faltan columnas (sucursal, codigo, cantidad). Subí los PDF de remitos del CDP o el DETALLE consolidado (remitos_consolidado.csv).`
      );
    }
    return rows.slice(1).filter((r) => r.length > iQ).map((r) => ({
      fecha: r[iF] ?? "",
      marca: r[iM] ?? "",
      sucursal: r[iS] ?? "",
      codigo: r[iC] ?? "",
      descripcion: r[iD] ?? "",
      cantidad: parseNumero(r[iQ]),
      remito: r[iR] ?? "",
    }));
  }

  async function subir(files: FileList | null) {
    if (!files?.length) return;
    setError("");
    setLeyendo(true);
    let acc = remitos;
    const nuevasCargas: Carga[] = [];
    const errores: string[] = [];
    for (const file of Array.from(files)) {
      try {
        const parsed = await parsearArchivo(file);
        const { total, agregadas, duplicadas } = mergeRemitos(acc, parsed);
        acc = total;
        nuevasCargas.push({ nombre: file.name, agregadas, duplicadas });
      } catch (e) {
        errores.push(e instanceof Error ? e.message : String(e));
      }
    }
    setLeyendo(false);
    setRemitos(acc);
    setCargas((prev) => [...prev, ...nuevasCargas]);
    if (errores.length) setError(errores.join(" · "));

    // rango de fechas de TODO lo acumulado → ventas de Tango para auditar cobertura
    const isos = acc.map((p) => isoDe(p.fecha)).filter(Boolean).sort();
    if (isos.length) {
      const desde = isos[0], hasta = isos[isos.length - 1];
      setRango({ desde, hasta });
      setCargando(true);
      try {
        const j = await (await fetch(`/api/ventas/sucursales?desde=${desde}&hasta=${hasta}`)).json();
        setVentasSuc(j.ok ? j.sucursales : []);
        if (!j.ok) setError((e) => [e, "Remitos cargados, pero no pude traer ventas de Tango: " + (j.error || "")].filter(Boolean).join(" · "));
      } catch (e) {
        setError((prev) => [prev, "Remitos cargados, pero falló Tango: " + String(e)].filter(Boolean).join(" · "));
      } finally {
        setCargando(false);
      }
    }
  }

  function limpiar() {
    setRemitos([]); setCargas([]); setVentasSuc([]); setRango(null); setError("");
  }

  const porSucursal = useMemo(() => {
    const m = new Map<string, { sucursal: string; lineas: number; cantidad: number }>();
    for (const r of remitos) {
      const a = m.get(r.sucursal) ?? { sucursal: r.sucursal, lineas: 0, cantidad: 0 };
      a.lineas++; a.cantidad += r.cantidad; m.set(r.sucursal, a);
    }
    return Array.from(m.values()).sort((a, b) => b.cantidad - a.cantidad);
  }, [remitos]);

  const porInsumo = useMemo(() => {
    const m = new Map<string, { codigo: string; descripcion: string; cantidad: number; suc: Set<string> }>();
    for (const r of remitos) {
      const a = m.get(r.codigo) ?? { codigo: r.codigo, descripcion: r.descripcion, cantidad: 0, suc: new Set() };
      a.cantidad += r.cantidad; a.suc.add(r.sucursal); m.set(r.codigo, a);
    }
    return Array.from(m.values()).sort((a, b) => b.cantidad - a.cantidad);
  }, [remitos]);

  // Auditoría de cobertura: sucursal con remito ↔ con ventas
  const cobertura = useMemo(() => {
    // Misma reconciliación que el Cruce: no fusiona "Mrt X" con el "X" de El Desembarco.
    const clave = armarClaveSuc([...remitos.map((r) => r.sucursal), ...ventasSuc.map((v) => v.sucursal)]);
    const remBy = new Map<string, { disp: string; cant: number }>();
    for (const r of remitos) {
      const n = clave(r.sucursal);
      const a = remBy.get(n) ?? { disp: r.sucursal, cant: 0 };
      a.cant += r.cantidad; remBy.set(n, a);
    }
    const venBy = new Map<string, { disp: string; u: number }>();
    for (const v of ventasSuc) {
      const n = clave(v.sucursal);
      const a = venBy.get(n) ?? { disp: v.sucursal, u: 0 };
      a.u += v.unidades; venBy.set(n, a);
    }
    const claves = new Set(Array.from(remBy.keys()).concat(Array.from(venBy.keys())));
    const filas = Array.from(claves).map((n) => {
      const tr = remBy.has(n), tv = venBy.has(n);
      return {
        sucursal: remBy.get(n)?.disp ?? venBy.get(n)?.disp ?? n,
        remito: tr, ventas: tv,
        estado: tr && tv ? "OK" : tr ? "REMITO SIN VENTAS" : "VENTAS SIN REMITO",
        insumos: tr ? Math.round(remBy.get(n)!.cant) : 0,
        unidades: tv ? Math.round(venBy.get(n)!.u) : 0,
      };
    });
    const orden = { "REMITO SIN VENTAS": 0, "VENTAS SIN REMITO": 1, OK: 2 } as Record<string, number>;
    return filas.sort((a, b) => orden[a.estado] - orden[b.estado] || a.sucursal.localeCompare(b.sucursal));
  }, [remitos, ventasSuc]);

  const alertas = cobertura.filter((c) => c.estado === "REMITO SIN VENTAS").length;

  function exportar() {
    if (tab === "cobertura")
      descargarCSV("auditoria_cobertura", ["Sucursal", "Tiene remito", "Tiene ventas", "Estado", "Insumos entregados", "Unidades vendidas"],
        cobertura.map((c) => [c.sucursal, c.remito ? "sí" : "no", c.ventas ? "sí" : "no", c.estado, c.insumos, c.unidades]));
    else if (tab === "insumo")
      descargarCSV("remitos_por_insumo", ["Código", "Insumo", "Cantidad total", "Sucursales"],
        porInsumo.map((p) => [p.codigo, p.descripcion, Math.round(p.cantidad), p.suc.size]));
    else
      descargarCSV("remitos_por_sucursal", ["Sucursal", "Líneas", "Insumos entregados"],
        porSucursal.map((p) => [p.sucursal, p.lineas, Math.round(p.cantidad)]));
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-xl font-semibold text-ink">Remitos vs Ventas</h1>
        <p className="mt-0.5 max-w-2xl text-sm text-muted">
          Subí los PDF de remitos del CDP (o el CSV consolidado) y auditá la cobertura contra las ventas de
          Tango: qué sucursales recibieron del CDP y no registran ventas (y viceversa). Exportable a Sheets/Excel.
        </p>
      </div>

      {/* Carga */}
      <Card className="p-4">
        <label className="mb-1 block text-2xs font-medium uppercase tracking-wide text-faint">
          PDFs de remitos de entrega (podés elegir varios) o el CSV consolidado del script. Las cargas se suman; un remito repetido no se duplica.
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <label className="cursor-pointer rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:border-action/40 hover:text-action">
            {leyendo ? "Leyendo…" : "Elegir PDFs o CSV…"}
            <input
              type="file"
              accept=".pdf,.csv,application/pdf,text/csv"
              multiple
              className="hidden"
              onChange={(e) => { subir(e.target.files); e.target.value = ""; }}
            />
          </label>
          {rango && <span className="text-2xs text-faint">período {rango.desde} → {rango.hasta}</span>}
          {remitos.length > 0 && (
            <button onClick={limpiar} className="rounded-lg border border-line px-2.5 py-1 text-2xs text-muted hover:border-bad/40 hover:text-bad">
              ✕ Limpiar todo
            </button>
          )}
        </div>
        {cargas.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {cargas.map((c, i) => (
              <li key={i} className="rounded-full bg-paper px-2 py-0.5 text-2xs text-faint">
                {c.nombre} · +{c.agregadas}
                {c.duplicadas > 0 && <span className="text-warn"> ({c.duplicadas} repetidas)</span>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {error && <Card className="p-3 text-sm text-bad">{error}</Card>}

      {remitos.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Kpi label="Remitos" value={String(new Set(remitos.map((r) => r.remito).filter(Boolean)).size || cargas.length)} />
            <Kpi label="Líneas de remito" value={String(remitos.length)} />
            <Kpi label="Sucursales con remito" value={String(porSucursal.length)} />
            <Kpi label="Insumos" value={String(porInsumo.length)} />
            <Kpi label="🔴 Remito sin ventas" value={cargando ? "…" : String(alertas)} tone={alertas ? "bad" : undefined} />
          </div>

          <Card className="flex flex-wrap items-center gap-3 p-3">
            <div className="flex gap-1 rounded-lg border border-line p-0.5">
              <Tab activo={tab === "cobertura"} onClick={() => setTab("cobertura")}>Cobertura (audit)</Tab>
              <Tab activo={tab === "sucursal"} onClick={() => setTab("sucursal")}>Por sucursal</Tab>
              <Tab activo={tab === "insumo"} onClick={() => setTab("insumo")}>Por insumo</Tab>
            </div>
            <button
              onClick={exportar}
              title="Exporta la pestaña activa a CSV (Excel / Google Sheets)"
              className="ml-auto shrink-0 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:border-action/40 hover:text-action"
            >
              ⬇ Exportar {tab === "cobertura" ? "cobertura" : tab === "sucursal" ? "por sucursal" : "por insumo"}
            </button>
          </Card>

          <Card className="overflow-hidden">
            {tab === "cobertura" && (
              <Tabla cols={["Sucursal", "Remito", "Ventas", "Estado", "Insumos", "Unidades vend."]}
                filas={cobertura.map((c) => [
                  <span key="s" className="text-sm text-ink">{c.sucursal}</span>,
                  <span key="r">{c.remito ? "✅" : "—"}</span>,
                  <span key="v">{c.ventas ? "✅" : "—"}</span>,
                  <Estado key="e" v={c.estado} />,
                  <span key="i" className="font-mono tnum text-muted">{money(c.insumos)}</span>,
                  <span key="u" className="font-mono tnum text-muted">{money(c.unidades)}</span>,
                ])} />
            )}
            {tab === "sucursal" && (
              <Tabla cols={["Sucursal", "Líneas", "Insumos entregados"]}
                filas={porSucursal.map((p) => [
                  <span key="s" className="text-sm text-ink">{p.sucursal}</span>,
                  <span key="l" className="font-mono tnum text-faint">{p.lineas}</span>,
                  <b key="c" className="font-mono tnum text-ink">{money(p.cantidad)}</b>,
                ])} />
            )}
            {tab === "insumo" && (
              <Tabla cols={["Código", "Insumo", "Cantidad total", "Sucursales"]}
                filas={porInsumo.map((p) => [
                  <span key="c" className="font-mono text-2xs text-faint">{p.codigo}</span>,
                  <span key="d" className="text-sm text-ink">{p.descripcion}</span>,
                  <b key="q" className="font-mono tnum text-ink">{money(p.cantidad)}</b>,
                  <span key="s" className="text-2xs text-faint">{p.suc.size}</span>,
                ])} />
            )}
          </Card>

          {tab === "cobertura" && (
            <p className="text-2xs text-faint">
              "REMITO SIN VENTAS" = recibió mercadería del CDP pero no registra ventas en Tango (revisar). "VENTAS
              SIN REMITO" = vende pero no recibió del CDP en el período (franquicias del interior, otra vía).
              El cruce es a nivel <b>sucursal</b>; el detalle unidad-a-unidad insumo↔producto necesita la receta (BOM).
            </p>
          )}
        </>
      )}
    </div>
  );
}

function Estado({ v }: { v: string }) {
  const tono = v === "OK" ? "bg-ok/10 text-ok" : v === "REMITO SIN VENTAS" ? "bg-bad/10 text-bad" : "bg-warn/10 text-warn";
  return <span className={`rounded-full px-2 py-0.5 text-2xs font-medium ${tono}`}>{v}</span>;
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "bad" }) {
  return (
    <Card className="p-3">
      <p className="text-2xs uppercase tracking-wide text-faint">{label}</p>
      <p className={`mt-0.5 font-display text-lg font-semibold ${tone === "bad" ? "text-bad" : "text-ink"}`}>{value}</p>
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
