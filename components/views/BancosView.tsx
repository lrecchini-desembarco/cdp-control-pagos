"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/primitives";
import { descargarCSV } from "@/lib/exportar-csv";
import { parseArchivoBanco, parsePdfItems, parseBaseArchivo, resumirBancos, claveOrigen, type MovBanco, type ResumenBancos, type PdfItem, type GrupoCuit } from "@/lib/bancos";

// pdfjs se carga on-demand (recién al procesar un PDF) para no pesar el bundle.
let pdfjsMod: any = null;
async function extraerItemsPdf(buf: ArrayBuffer): Promise<PdfItem[][]> {
  if (!pdfjsMod) { pdfjsMod = await import("pdfjs-dist"); pdfjsMod.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs"; }
  const doc = await pdfjsMod.getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise;
  const pags: PdfItem[][] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent();
    pags.push(tc.items.map((i: any) => ({ s: String(i.str || "").trim(), x: i.transform?.[4] ?? 0, y: Math.round(i.transform?.[5] ?? 0) })).filter((i: PdfItem) => i.s));
  }
  return pags;
}

// Bancos: importador de extractos. Subís la carpeta (o varios archivos) tal cual salen
// del homebanking de cada banco; la app los consolida sola (lib/bancos), los guarda en
// KV y acumula mes a mes. Re-subir un banco+local+mes lo reemplaza. Sin Drive ni scripts.

type Cobertura = { banco: string; local: string; mes: string; n: number };
const money = (n: number) => "$" + Math.round(n).toLocaleString("es-AR");
const moneyC = (n: number) => {
  const a = Math.abs(n), s = a >= 1e9 ? (n / 1e9).toFixed(2).replace(".", ",") + " mil M"
    : a >= 1e6 ? (n / 1e6).toFixed(1).replace(".", ",") + " M" : a >= 1e3 ? Math.round(n / 1e3) + " k" : String(Math.round(n));
  return "$" + s;
};
const int = (n: number) => Math.round(n).toLocaleString("es-AR");
const mesLabel = (m: string) => { const [y, mo] = m.split("-"); return `${["", "ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"][+mo] || mo}-${(y || "").slice(2)}`; };

interface Preview { movs: MovBanco[]; resumen: ResumenBancos; descartados: number; errores: string[]; archivos: number }

export default function BancosView() {
  const [resumen, setResumen] = useState<ResumenBancos | null>(null);
  const [cobertura, setCobertura] = useState<Cobertura[]>([]);
  const [meta, setMeta] = useState<{ actualizado?: string } | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [estado, setEstado] = useState<"loading" | "idle" | "parsing" | "saving">("loading");
  const [progreso, setProgreso] = useState("");
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"banco" | "local" | "mes" | "categoria" | "cuit-ing" | "cuit-egr">("banco");
  const [verCobertura, setVerCobertura] = useState(false);
  const [ayuda, setAyuda] = useState(false);
  const [mesSel, setMesSel] = useState("");
  const [bancoSel, setBancoSel] = useState("");
  const [meses, setMeses] = useState<string[]>([]);
  const [bancos, setBancos] = useState<string[]>([]);
  const [porCuitIng, setPorCuitIng] = useState<GrupoCuit[]>([]);
  const [porCuitEgr, setPorCuitEgr] = useState<GrupoCuit[]>([]);
  const [basesConteo, setBasesConteo] = useState<{ cliente: number; proveedor: number; propias: number }>({ cliente: 0, proveedor: 0, propias: 0 });
  const inputRef = useRef<HTMLInputElement>(null);

  async function cargarBases() {
    try { const j = await (await fetch("/api/bancos/bases", { cache: "no-store" })).json(); if (j.ok) setBasesConteo(j.conteo); } catch { /* */ }
  }
  async function subirBase(files: FileList | null, tipo: "cliente" | "proveedor") {
    const f = files?.[0]; if (!f) return;
    setError(""); setEstado("saving"); setProgreso(`Leyendo ${tipo === "cliente" ? "clientes" : "proveedores"}…`);
    try {
      const { entries, error } = parseBaseArchivo(f.name, await f.arrayBuffer(), tipo);
      if (error || !entries.length) { setError(error || "no encontré datos"); return; }
      const j = await (await fetch("/api/bancos/bases", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ entries, reemplazarTipo: tipo }) })).json();
      if (!j.ok) throw new Error(j.error);
      setBasesConteo(j.conteo); await cargar();
    } catch (e) { setError(e instanceof Error ? e.message : "no se pudo cargar la base"); }
    finally { setEstado("idle"); setProgreso(""); }
  }

  async function cargar(mes = mesSel, banco = bancoSel) {
    try {
      const qs = new URLSearchParams(); if (mes) qs.set("mes", mes); if (banco) qs.set("banco", banco);
      const j = await (await fetch("/api/bancos?" + qs.toString(), { cache: "no-store" })).json();
      if (j.ok) {
        setResumen(j.resumen); setCobertura(j.cobertura ?? []); setMeta(j.meta ?? null);
        setMeses(j.meses ?? []); setBancos(j.bancos ?? []);
        setPorCuitIng(j.porCuitIngreso ?? []); setPorCuitEgr(j.porCuitEgreso ?? []);
      }
    } catch { /* vacío */ } finally { setEstado("idle"); }
  }
  useEffect(() => { cargar("", ""); cargarBases(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  function filtrar(mes: string, banco: string) { setMesSel(mes); setBancoSel(banco); cargar(mes, banco); }

  async function onArchivos(files: FileList | null) {
    if (!files || !files.length) return;
    setError(""); setEstado("parsing"); setProgreso(`Leyendo ${files.length} archivos…`);
    const movs: MovBanco[] = []; const errores: string[] = []; let descartados = 0; let ok = 0;
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (!/\.(csv|xlsx?|pdf)$/i.test(f.name)) continue;
      setProgreso(`Procesando ${i + 1}/${files.length}: ${f.name}`);
      try {
        const rel = (f as any).webkitRelativePath || f.name;
        const r = /\.pdf$/i.test(f.name)
          ? parsePdfItems(await extraerItemsPdf(await f.arrayBuffer()), f.name, rel)
          : parseArchivoBanco(f.name, rel, await f.arrayBuffer());
        if (r.error) errores.push(`${f.name}: ${r.error}`);
        else { movs.push(...r.movs); descartados += r.descartados; ok++; }
      } catch (e) { errores.push(`${f.name}: ${e instanceof Error ? e.message : "error"}`); }
      await new Promise((r) => setTimeout(r, 0)); // no congelar la UI (los PDF tardan)
    }
    if (!movs.length) { setEstado("idle"); setError("No pude extraer movimientos. ¿Son extractos de banco (CSV/Excel)? " + (errores[0] || "")); return; }
    setPreview({ movs, resumen: resumirBancos(movs), descartados, errores, archivos: ok });
    setEstado("idle");
    if (inputRef.current) inputRef.current.value = "";
  }

  async function guardar() {
    if (!preview) return;
    setEstado("saving"); setError("");
    // Agrupar por banco+local+mes y mandar en tandas (cada tanda reemplaza sus grupos).
    const grupos = new Map<string, MovBanco[]>();
    for (const m of preview.movs) { const k = claveOrigen(m); const a = grupos.get(k) ?? []; a.push(m); grupos.set(k, a); }
    const tandas: MovBanco[][] = []; let cur: MovBanco[] = [];
    for (const g of Array.from(grupos.values())) { if (cur.length + g.length > 2500 && cur.length) { tandas.push(cur); cur = []; } cur.push(...g); }
    if (cur.length) tandas.push(cur);
    try {
      let ultima: any = null;
      for (let i = 0; i < tandas.length; i++) {
        setProgreso(`Guardando ${i + 1}/${tandas.length}…`);
        const r = await (await fetch("/api/bancos", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ movs: tandas[i] }) })).json();
        if (!r.ok) throw new Error(r.error || "falló al guardar");
        ultima = r;
      }
      void ultima;
      setPreview(null); setMesSel(""); setBancoSel(""); await cargar("", "");
    } catch (e) { setError(e instanceof Error ? e.message : "no se pudo guardar"); }
    finally { setEstado("idle"); setProgreso(""); }
  }

  const r = resumen;
  const hayDatos = meses.length > 0;
  const esCuit = tab === "cuit-ing" || tab === "cuit-egr";
  const filas = useMemo(() => {
    if (!r) return [] as { k: string; n: number; ingresos: number; egresos: number }[];
    return tab === "banco" ? r.porBanco : tab === "local" ? r.porLocal : tab === "mes" ? r.porMes : tab === "categoria" ? r.porCategoria : [];
  }, [r, tab]);
  const filasCuit = tab === "cuit-egr" ? porCuitEgr : porCuitIng;
  const maxV = Math.max(1, ...filas.map((f) => Math.abs(f.ingresos - f.egresos)));
  const maxCuit = Math.max(1, ...filasCuit.map((f) => f.monto));

  function exportar() {
    if (esCuit) return descargarCSV(`bancos-${tab}.csv`, ["cuit", "movimientos", "monto"], filasCuit.map((f) => [f.cuit, f.n, Math.round(f.monto)]));
    if (!r) return;
    descargarCSV(`bancos-${tab}.csv`, [tab, "movimientos", "ingresos", "egresos", "neto"],
      filas.map((f) => [f.k, f.n, Math.round(f.ingresos), Math.round(f.egresos), Math.round(f.ingresos - f.egresos)]));
  }

  const cargando = estado === "parsing" || estado === "saving";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold text-ink">Bancos</h1>
          <p className="mt-0.5 max-w-2xl text-sm text-muted">
            Extractos de todos los bancos en un lugar: ingresos, egresos y neto por banco, local, mes y concepto.
            Subís la carpeta o los archivos y se consolida y guarda solo.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setAyuda((a) => !a)} className="rounded-md px-2.5 py-1.5 text-xs font-medium text-muted hover:bg-ink/[0.03]">Cómo cargar</button>
          {meta?.actualizado && <span className="text-2xs text-faint">actualizado {new Date(meta.actualizado).toLocaleDateString("es-AR")}</span>}
          <label className={`cursor-pointer rounded-md border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:bg-ink/[0.03] ${cargando ? "pointer-events-none opacity-50" : ""}`}>
            Subir carpeta
            <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => onArchivos(e.target.files)} {...({ webkitdirectory: "", directory: "" } as Record<string, string>)} />
          </label>
          <label className={`cursor-pointer rounded-md border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:bg-ink/[0.03] ${cargando ? "pointer-events-none opacity-50" : ""}`}>
            Archivos
            <input type="file" accept=".csv,.xls,.xlsx,.pdf" multiple className="hidden" onChange={(e) => onArchivos(e.target.files)} />
          </label>
        </div>
      </div>

      {cargando && <Card className="p-3 text-sm text-muted">{progreso || "Procesando…"}</Card>}
      {error && <Card className="border-bad/40 bg-bad/[0.04] p-3 text-sm text-bad">{error}</Card>}

      {/* Preview tras parsear: qué detecté, antes de guardar */}
      {preview && !cargando && (
        <Card className="border-action/40 bg-action/[0.04] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-ink">
              Detecté <b>{int(preview.movs.length)}</b> movimientos en <b>{preview.archivos}</b> archivos
              {preview.descartados > 0 && <> · <span className="text-warn">{preview.descartados} filas descartadas (lectura corrupta)</span></>}
              {preview.errores.length > 0 && <> · <span className="text-warn">{preview.errores.length} archivos no leídos</span></>}.
              <span className="text-muted"> Reemplaza los banco+mes que ya estén cargados.</span>
            </p>
            <div className="flex gap-2">
              <button onClick={() => setPreview(null)} className="rounded-md px-2.5 py-1 text-xs font-medium text-muted hover:bg-ink/5">Descartar</button>
              <button onClick={guardar} className="rounded-md bg-ok px-3 py-1 text-xs font-semibold text-white hover:opacity-90">Guardar {int(preview.movs.length)} movimientos</button>
            </div>
          </div>
          {preview.errores.length > 0 && <p className="mt-1.5 text-2xs text-faint">No leídos: {preview.errores.slice(0, 4).join(" · ")}{preview.errores.length > 4 ? "…" : ""}</p>}
        </Card>
      )}

      {(!hayDatos || ayuda) && !cargando && <Tutorial vacio={!hayDatos} onCerrar={() => setAyuda(false)} />}

      {hayDatos && r && (
        <>
          {/* Filtros */}
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-2xs text-muted">Mes
              <select className="rounded-md border border-line bg-surface px-2 py-1 text-2xs text-ink" value={mesSel} onChange={(e) => filtrar(e.target.value, bancoSel)}>
                <option value="">todos</option>
                {meses.map((m) => <option key={m} value={m}>{mesLabel(m)}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-2xs text-muted">Banco
              <select className="rounded-md border border-line bg-surface px-2 py-1 text-2xs text-ink" value={bancoSel} onChange={(e) => filtrar(mesSel, e.target.value)}>
                <option value="">todos</option>
                {bancos.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </label>
            {(mesSel || bancoSel) && <button onClick={() => filtrar("", "")} className="text-2xs font-medium text-action hover:underline">limpiar</button>}
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Ingresos" value={moneyC(r.ingresos)} full={money(r.ingresos)} tone="ok" sub={`${int(r.total)} movimientos`} />
            <Kpi label="Egresos" value={moneyC(r.egresos)} full={money(r.egresos)} tone="bad" />
            <Kpi label="Neto" value={moneyC(r.neto)} full={money(r.neto)} tone={r.neto < 0 ? "bad" : "ok"} sub="incluye traspasos internos" />
            <Kpi label="Período" value={r.desde && r.hasta ? `${mesLabel(r.desde.slice(0, 7))} → ${mesLabel(r.hasta.slice(0, 7))}` : "—"} plain sub={`${r.porBanco.length} bancos`} />
          </div>

          {/* Desglose */}
          <Card className="overflow-hidden p-0">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2">
              <div className="flex flex-wrap gap-1">
                {([["banco", "Por banco"], ["local", "Por local"], ["mes", "Por mes"], ["categoria", "Por categoría"], ["cuit-ing", "Ingresos × CUIT"], ["cuit-egr", "Egresos × CUIT"]] as const).map(([k, l]) => (
                  <button key={k} onClick={() => setTab(k)} className={`rounded-md px-2.5 py-1 text-2xs font-medium ${tab === k ? "bg-ink/[0.06] text-ink" : "text-muted hover:bg-ink/[0.03]"}`}>{l}</button>
                ))}
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => setVerCobertura((v) => !v)} className="text-2xs font-medium text-muted hover:text-ink">{verCobertura ? "ocultar" : "ver"} cobertura</button>
                <button onClick={exportar} className="text-2xs font-medium text-action hover:underline">Exportar CSV</button>
              </div>
            </div>
            {esCuit && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-ink/[0.015] px-3 py-1.5 text-2xs text-muted">
                <span>Cruce con bases: <b className="text-ink">{basesConteo.cliente}</b> clientes · <b className="text-ink">{basesConteo.proveedor}</b> proveedores · <b className="text-ink">{basesConteo.propias}</b> propias</span>
                <span className="flex gap-3">
                  <label className="cursor-pointer font-medium text-action hover:underline">Cargar clientes<input type="file" accept=".csv,.xls,.xlsx" className="hidden" onChange={(e) => subirBase(e.target.files, "cliente")} /></label>
                  <label className="cursor-pointer font-medium text-action hover:underline">Cargar proveedores<input type="file" accept=".csv,.xls,.xlsx" className="hidden" onChange={(e) => subirBase(e.target.files, "proveedor")} /></label>
                </span>
              </div>
            )}
            <div className="overflow-x-auto">
              {esCuit ? (
                <table className="w-full text-left text-sm">
                  <thead><tr className="border-b border-line text-2xs uppercase tracking-wide text-faint">
                    <th className="px-4 py-2 font-medium">CUIT contraparte</th>
                    <th className="px-3 py-2 text-right font-medium">Mov</th>
                    <th className="px-3 py-2 font-medium">{tab === "cuit-egr" ? "Pagado" : "Ingresado"}</th>
                  </tr></thead>
                  <tbody>
                    {filasCuit.length === 0 ? (
                      <tr><td colSpan={3} className="px-4 py-6 text-center text-2xs text-faint">Ningún movimiento con CUIT de contraparte en este filtro (ventas con tarjeta, impuestos y comisiones no traen CUIT).</td></tr>
                    ) : filasCuit.map((f) => (
                      <tr key={f.cuit} className="border-b border-line/70 last:border-0 hover:bg-ink/[0.02]">
                        <td className="px-4 py-2 text-ink"><span className="font-mono">{f.cuit}</span>{f.nombre && <span className="ml-2 font-medium">{f.nombre}</span>}{f.tipo && <span className="ml-1.5 rounded bg-ink/[0.06] px-1 py-px text-2xs text-muted">{f.tipo}</span>}</td>
                        <td className="px-3 py-2 text-right font-mono tnum text-muted">{int(f.n)}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-ink/10"><div className={`h-full rounded-full ${tab === "cuit-egr" ? "bg-bad/70" : "bg-ok/80"}`} style={{ width: `${Math.max(2, (f.monto / maxCuit) * 100)}%` }} /></div>
                            <span className="font-mono tnum font-medium text-ink monto">{money(f.monto)}</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead><tr className="border-b border-line text-2xs uppercase tracking-wide text-faint">
                    <th className="px-4 py-2 font-medium">{tab === "banco" ? "Banco" : tab === "local" ? "Local" : tab === "mes" ? "Mes" : "Categoría"}</th>
                    <th className="px-3 py-2 text-right font-medium">Mov</th>
                    <th className="px-3 py-2 text-right font-medium">Ingresos</th>
                    <th className="px-3 py-2 text-right font-medium">Egresos</th>
                    <th className="px-3 py-2 font-medium">Neto</th>
                  </tr></thead>
                  <tbody>
                    {filas.map((f) => { const neto = f.ingresos - f.egresos; return (
                      <tr key={f.k} className="border-b border-line/70 last:border-0 hover:bg-ink/[0.02]">
                        <td className="px-4 py-2 font-medium text-ink">{tab === "mes" ? mesLabel(f.k) : f.k}</td>
                        <td className="px-3 py-2 text-right font-mono tnum text-muted">{int(f.n)}</td>
                        <td className="px-3 py-2 text-right font-mono tnum text-ok monto">{f.ingresos ? money(f.ingresos) : "—"}</td>
                        <td className="px-3 py-2 text-right font-mono tnum text-bad monto">{f.egresos ? money(f.egresos) : "—"}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-ink/10"><div className={`h-full rounded-full ${neto < 0 ? "bg-bad/70" : "bg-ok/80"}`} style={{ width: `${Math.max(2, (Math.abs(neto) / maxV) * 100)}%` }} /></div>
                            <span className="font-mono tnum font-medium text-ink monto">{money(neto)}</span>
                          </div>
                        </td>
                      </tr>
                    ); })}
                  </tbody>
                </table>
              )}
            </div>
            {verCobertura && (
              <div className="border-t border-line bg-ink/[0.015] px-4 py-3">
                <p className="mb-1.5 text-2xs uppercase tracking-wide text-faint">Cobertura cargada (banco · local · mes · movimientos)</p>
                <div className="grid max-h-48 grid-cols-1 gap-x-6 gap-y-0.5 overflow-y-auto text-2xs text-muted sm:grid-cols-2 lg:grid-cols-3">
                  {cobertura.map((c) => <span key={`${c.banco}|${c.local}|${c.mes}`}>{c.banco} · {c.local} · {mesLabel(c.mes)} · <b className="text-ink">{c.n}</b></span>)}
                </div>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, sub, tone, full, plain }: { label: string; value: string; sub?: string; tone?: "ok" | "bad"; full?: string; plain?: boolean }) {
  const c = tone === "ok" ? "text-ok" : tone === "bad" ? "text-bad" : "text-ink";
  return (
    <Card className="group p-3">
      <p className="text-2xs uppercase tracking-wide text-faint">{label}</p>
      <p className={`mt-0.5 font-display text-base font-semibold leading-tight tnum sm:text-2xl ${c}`}>
        {plain ? value : <span className="monto"><span className="group-hover:hidden">{value}</span>{full && <span className="hidden whitespace-nowrap text-[0.7em] group-hover:inline">{full}</span>}</span>}
      </p>
      {sub && <p className="text-2xs text-faint">{sub}</p>}
    </Card>
  );
}

function Tutorial({ vacio, onCerrar }: { vacio: boolean; onCerrar: () => void }) {
  const pasos: { n: string; t: string; d: React.ReactNode }[] = [
    { n: "1", t: "Bajá los extractos", d: <>Entrá al homebanking de cada banco (Galicia, Banco Ciudad, Macro, Provincia, Santander, Mercado Pago) y descargá los <b>movimientos</b> del período en <b>Excel, CSV o PDF</b> — el botón suele decir “Exportar”, “Descargar movimientos” o “Extracto”. Guardá todos los archivos en <b>una carpeta</b> en tu compu.</> },
    { n: "2", t: "Subí la carpeta", d: <>Acá arriba tocá <b>“Subir carpeta”</b> y elegí esa carpeta. La app reconoce cada banco sola y junta todo. (También podés arrastrar archivos sueltos con <b>“Archivos”</b>.)</> },
    { n: "3", t: "Revisá y guardá", d: <>Te muestra cuántos movimientos encontró. Tocá <b>“Guardar”</b> y listo: queda guardado y la próxima vez que entres aparece solo.</> },
  ];
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-semibold text-ink">Cómo cargar los extractos</h2>
          <p className="mt-0.5 text-sm text-muted">Todos los bancos en un solo lugar, en 3 pasos. No hace falta saber de sistemas.</p>
        </div>
        {!vacio && <button onClick={onCerrar} className="shrink-0 rounded-md px-2 py-1 text-2xs font-medium text-muted hover:bg-ink/5">Cerrar</button>}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {pasos.map((p) => (
          <div key={p.n} className="rounded-lg border border-line bg-ink/[0.015] p-3">
            <div className="flex items-center gap-2">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-action/15 font-display text-sm font-bold text-action">{p.n}</span>
              <span className="font-medium text-ink">{p.t}</span>
            </div>
            <p className="mt-1.5 text-2xs leading-relaxed text-muted">{p.d}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-2xs text-faint">
        <span>🔁 Re-subir un mes ya cargado lo <b className="text-muted">reemplaza</b> (no duplica).</span>
        <span>📄 Lee <b className="text-muted">CSV, Excel y PDF</b> (Galicia, Ciudad, Macro y más).</span>
        <span>🔒 Con el <b className="text-muted">ojo</b> del menú de arriba ocultás los montos.</span>
      </div>
    </Card>
  );
}
