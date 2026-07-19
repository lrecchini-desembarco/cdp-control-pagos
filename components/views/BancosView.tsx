"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/primitives";
import { descargarCSV } from "@/lib/exportar-csv";
import { parseArchivoBanco, parsePdfItems, parseBaseArchivo, resumirBancos, claveOrigen, type MovBanco, type ResumenBancos, type PdfItem, type GrupoCuit, type Contraparte, type ResumenIntercompany } from "@/lib/bancos";

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
const tipoLabel = (t?: string) => (t === "propia" ? "interno" : t === "ambos" ? "cliente y prov." : t);
const mesLabel = (m: string) => { const [y, mo] = m.split("-"); return `${["", "ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"][+mo] || mo}-${(y || "").slice(2)}`; };
const normTxt = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

interface Preview { movs: MovBanco[]; resumen: ResumenBancos; descartados: number; errores: string[]; archivos: number }

export default function BancosView() {
  const [resumen, setResumen] = useState<ResumenBancos | null>(null);
  const [cobertura, setCobertura] = useState<Cobertura[]>([]);
  const [meta, setMeta] = useState<{ actualizado?: string } | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [estado, setEstado] = useState<"loading" | "idle" | "parsing" | "saving">("loading");
  const [progreso, setProgreso] = useState("");
  const [error, setError] = useState("");
  const [guardado, setGuardado] = useState<{ movs: number; bancos: string[]; fallidos: string[] } | null>(null);
  const [tab, setTab] = useState<"banco" | "local" | "mes" | "categoria" | "cuit-ing" | "cuit-egr" | "intercompany">("banco");
  const [verCobertura, setVerCobertura] = useState(false);
  const [ayuda, setAyuda] = useState(false);
  const [mesSel, setMesSel] = useState("");
  const [bancoSel, setBancoSel] = useState("");
  const [cuitSel, setCuitSel] = useState("");           // filtro general por contraparte
  const [contrapartes, setContrapartes] = useState<Contraparte[]>([]);
  const [cuitStats, setCuitStats] = useState<{ conCuit: number; total: number } | null>(null);
  const [intercompany, setIntercompany] = useState<ResumenIntercompany | null>(null);
  const [qRazon, setQRazon] = useState("");             // texto tipeado en el autocompletar
  const [abierto, setAbierto] = useState(false);        // dropdown del autocompletar
  const [meses, setMeses] = useState<string[]>([]);
  const [bancos, setBancos] = useState<string[]>([]);
  const [porCuitIng, setPorCuitIng] = useState<GrupoCuit[]>([]);
  const [porCuitEgr, setPorCuitEgr] = useState<GrupoCuit[]>([]);
  const [basesConteo, setBasesConteo] = useState<{ cliente: number; proveedor: number; propias: number }>({ cliente: 0, proveedor: 0, propias: 0 });
  const [avisoBase, setAvisoBase] = useState<{ texto: string; huboDescartes: boolean } | null>(null);
  const [buscarCuit, setBuscarCuit] = useState("");
  const [tipoCuit, setTipoCuit] = useState<"" | "cliente" | "proveedor" | "propia">("");
  const [detalle, setDetalle] = useState<{ titulo: string; filtro: Record<string, string> } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Abre el detalle (movimientos línea por línea) para un corte, respetando los filtros activos.
  function abrirDetalle(extra: Record<string, string>, titulo: string) {
    const filtro: Record<string, string> = {};
    if (mesSel) filtro.mes = mesSel;
    if (bancoSel) filtro.banco = bancoSel;
    if (cuitSel) filtro.cuit = cuitSel;
    Object.assign(filtro, extra); // el corte clickeado pisa/afina el filtro activo
    setDetalle({ titulo, filtro });
  }

  async function cargarBases() {
    try { const j = await (await fetch("/api/bancos/bases", { cache: "no-store" })).json(); if (j.ok) setBasesConteo(j.conteo); } catch { /* */ }
  }
  async function subirBase(files: FileList | null, tipo: "cliente" | "proveedor") {
    const f = files?.[0]; if (!f) return;
    setError(""); setAvisoBase(null); setEstado("saving"); setProgreso(`Leyendo ${tipo === "cliente" ? "clientes" : "proveedores"}…`);
    try {
      const { entries, filas, invalidas, duplicadas, error } = parseBaseArchivo(f.name, await f.arrayBuffer(), tipo);
      if (error || !entries.length) { setError(error || "no encontré datos"); return; }
      const j = await (await fetch("/api/bancos/bases", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ entries, reemplazarTipo: tipo }) })).json();
      if (!j.ok) throw new Error(j.error);
      setBasesConteo(j.conteo); await cargar();
      // Visibilidad del estado (Nielsen #1): decir exactamente qué pasó, no dejar
      // que el conteo baje "en silencio" respecto de las filas del archivo.
      const partes = [`${entries.length} ${tipo === "cliente" ? "clientes" : "proveedores"} cargados`];
      if (duplicadas) partes.push(`${duplicadas} CUIT repetido${duplicadas === 1 ? "" : "s"} en el archivo`);
      if (invalidas) partes.push(`${invalidas} descartado${invalidas === 1 ? "" : "s"} por CUIT inválido`);
      setAvisoBase({ texto: `${f.name}: leí ${filas} fila${filas === 1 ? "" : "s"} → ${partes.join(" · ")}.`, huboDescartes: duplicadas + invalidas > 0 });
    } catch (e) { setError(e instanceof Error ? e.message : "no se pudo cargar la base"); }
    finally { setEstado("idle"); setProgreso(""); }
  }

  async function cargar(mes = mesSel, banco = bancoSel, cuit = cuitSel) {
    try {
      const qs = new URLSearchParams(); if (mes) qs.set("mes", mes); if (banco) qs.set("banco", banco); if (cuit) qs.set("cuit", cuit);
      const j = await (await fetch("/api/bancos?" + qs.toString(), { cache: "no-store" })).json();
      if (j.ok) {
        setResumen(j.resumen); setCobertura(j.cobertura ?? []); setMeta(j.meta ?? null);
        setMeses(j.meses ?? []); setBancos(j.bancos ?? []);
        setPorCuitIng(j.porCuitIngreso ?? []); setPorCuitEgr(j.porCuitEgreso ?? []);
        setContrapartes(j.contrapartes ?? []);
        setCuitStats(j.cuitStats ?? null);
        setIntercompany(j.intercompany ?? null);
      }
    } catch { /* vacío */ } finally { setEstado("idle"); }
  }
  useEffect(() => { cargar("", "", ""); cargarBases(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  function filtrar(mes: string, banco: string, cuit = cuitSel) { setMesSel(mes); setBancoSel(banco); setCuitSel(cuit); cargar(mes, banco, cuit); }
  // Elegir/limpiar contraparte (filtro general por razón social).
  function elegirContraparte(cuit: string) { setQRazon(""); setAbierto(false); filtrar(mesSel, bancoSel, cuit); }
  function limpiarContraparte() { setQRazon(""); setAbierto(false); filtrar(mesSel, bancoSel, ""); }
  // Borra TODO lo cargado (para re-subir la carpeta de cero y que quede bien clasificado).
  async function borrarTodo() {
    if (!confirm("¿Borrar TODOS los extractos cargados? Es para empezar de cero y volver a subir la carpeta. No se puede deshacer.")) return;
    setEstado("saving"); setProgreso("Borrando todo…");
    try {
      await fetch("/api/bancos", { method: "DELETE" });
      setMesSel(""); setBancoSel(""); setCuitSel(""); setPreview(null);
      await cargar("", "", "");
    } catch (e) { setError(e instanceof Error ? e.message : "no se pudo borrar"); }
    finally { setEstado("idle"); setProgreso(""); }
  }
  const nombreContraparte = (cuit: string) => contrapartes.find((c) => c.cuit === cuit)?.nombre ?? cuit;

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
    setEstado("saving"); setError(""); setGuardado(null);
    // Agrupar por banco+local+mes y mandar en tandas (cada tanda reemplaza sus grupos).
    const grupos = new Map<string, MovBanco[]>();
    for (const m of preview.movs) { const k = claveOrigen(m); const a = grupos.get(k) ?? []; a.push(m); grupos.set(k, a); }
    const tandas: MovBanco[][] = []; let cur: MovBanco[] = [];
    for (const g of Array.from(grupos.values())) { if (cur.length + g.length > 2500 && cur.length) { tandas.push(cur); cur = []; } cur.push(...g); }
    if (cur.length) tandas.push(cur);
    // Bancos que trae cada tanda -> para reportar por banco qué entró y qué no.
    const bancosDe = (t: MovBanco[]) => Array.from(new Set(t.map((m) => m.banco || "Otro")));
    let okMovs = 0; const okBancos = new Set<string>(); const fallidos = new Set<string>();
    // Cada tanda se guarda de forma independiente y con 1 reintento: si una falla,
    // NO cortamos el resto (los otros bancos igual entran) y avisamos cuáles quedaron afuera.
    for (let i = 0; i < tandas.length; i++) {
      let ok = false;
      for (let intento = 1; intento <= 2 && !ok; intento++) {
        setProgreso(`Guardando ${i + 1}/${tandas.length}${intento > 1 ? " (reintento)" : ""}…`);
        try {
          const r = await (await fetch("/api/bancos", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ movs: tandas[i] }) })).json();
          if (!r.ok) throw new Error(r.error || "falló al guardar");
          ok = true;
        } catch { if (intento === 2) break; await new Promise((res) => setTimeout(res, 600)); }
      }
      if (ok) { okMovs += tandas[i].length; bancosDe(tandas[i]).forEach((b) => okBancos.add(b)); }
      else bancosDe(tandas[i]).forEach((b) => fallidos.add(b));
    }
    // Un banco que entró en una tanda y falló en otra: cuenta como fallido (aviso honesto).
    const bancosOk = Array.from(okBancos).filter((b) => !fallidos.has(b)).sort();
    const bancosFail = Array.from(fallidos).sort();
    if (okMovs > 0) {
      setPreview(null); setMesSel(""); setBancoSel(""); setCuitSel(""); await cargar("", "", "");
      setGuardado({ movs: okMovs, bancos: bancosOk, fallidos: bancosFail });
    }
    if (bancosFail.length && okMovs === 0) setError(`No se pudo guardar: ${bancosFail.join(", ")}. Probá de nuevo.`);
    setEstado("idle"); setProgreso("");
  }

  const r = resumen;
  const hayDatos = meses.length > 0;
  const esCuit = tab === "cuit-ing" || tab === "cuit-egr";
  const esInter = tab === "intercompany";
  const filas = useMemo(() => {
    if (!r) return [] as { k: string; n: number; ingresos: number; egresos: number }[];
    return tab === "banco" ? r.porBanco : tab === "local" ? r.porLocal : tab === "mes" ? r.porMes : tab === "categoria" ? r.porCategoria : [];
  }, [r, tab]);
  const filasCuit = useMemo(() => {
    const base = tab === "cuit-egr" ? porCuitEgr : porCuitIng;
    const q = normTxt(buscarCuit.trim());
    return base.filter((f) => {
      // Filtro por tipo: "ambos" (cliente y proveedor) cuenta para cliente y proveedor.
      if (tipoCuit) {
        const t = f.tipo ?? "";
        const ok = t === tipoCuit || (t === "ambos" && (tipoCuit === "cliente" || tipoCuit === "proveedor"));
        if (!ok) return false;
      }
      if (!q) return true;
      return normTxt((f.nombre ?? "") + " " + f.cuit).includes(q);
    });
  }, [tab, porCuitIng, porCuitEgr, buscarCuit, tipoCuit]);
  const maxV = Math.max(1, ...filas.map((f) => Math.abs(f.ingresos - f.egresos)));
  const maxCuit = Math.max(1, ...filasCuit.map((f) => f.monto));
  const maxInter = Math.max(1, ...(intercompany?.porEmpresa.map((e) => e.ingreso + e.egreso) ?? [1]));

  // Sugerencias del filtro por razón social: SOLO empresas PROPIAS del grupo (pedido
  // del usuario — no externas tipo Rappi/clientes/proveedores). Ordenadas por plata movida.
  const propias = useMemo(() => contrapartes.filter((c) => c.tipo === "propia"), [contrapartes]);
  const sugerencias = useMemo(() => {
    const q = normTxt(qRazon.trim());
    const arr = q ? propias.filter((c) => normTxt((c.nombre ?? "") + " " + c.cuit).includes(q)) : propias;
    return arr.slice(0, 40);
  }, [propias, qRazon]);

  // Matriz de cobertura: filas = banco·local, columnas = mes. Deja ver de un vistazo
  // qué extractos cargaste y —lo importante— qué mes FALTA (hueco entre meses cargados).
  const matrizCob = useMemo(() => {
    if (!cobertura.length) return null;
    const presentes = Array.from(new Set(cobertura.map((c) => c.mes))).sort();
    // Rango COMPLETO de meses (del primero al último). Así un mes que falta en TODOS
    // los bancos (ej. 2025-09) igual aparece como columna en rojo, no desaparece.
    const rango = (min: string, max: string) => {
      const out: string[] = []; if (!min || !max) return presentes;
      let [y, m] = min.split("-").map(Number);
      const [ey, em] = max.split("-").map(Number);
      while (y < ey || (y === ey && m <= em)) { out.push(`${y}-${String(m).padStart(2, "0")}`); m++; if (m > 12) { m = 1; y++; } }
      return out;
    };
    const mesesU = rango(presentes[0], presentes[presentes.length - 1]);
    const mapa = new Map<string, Cobertura[]>();
    for (const c of cobertura) {
      const k = `${c.banco}|~|${c.local}`;
      const arr = mapa.get(k); if (arr) arr.push(c); else mapa.set(k, [c]);
    }
    const filasCob = Array.from(mapa.entries()).map(([k, items]) => {
      const [banco, local] = k.split("|~|");
      const porMes = new Map(items.map((i) => [i.mes, i.n]));
      const cargados = items.map((i) => i.mes).sort();
      const primero = cargados[0], ultimo = cargados[cargados.length - 1];
      const huecos = new Set(mesesU.filter((m) => m > primero && m < ultimo && !porMes.has(m)));
      return { banco, local, porMes, total: items.reduce((s, i) => s + i.n, 0), huecos };
    }).sort((a, b) => a.banco.localeCompare(b.banco) || a.local.localeCompare(b.local));
    const totalHuecos = filasCob.reduce((s, f) => s + f.huecos.size, 0);
    return { meses: mesesU, filas: filasCob, totalHuecos };
  }, [cobertura]);

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
        <div data-tour="bancos-subir" className="flex items-center gap-2">
          <button data-tour="bancos-como-cargar" onClick={() => setAyuda((a) => !a)} className="rounded-md px-2.5 py-1.5 text-xs font-medium text-muted hover:bg-ink/[0.03]">Cómo cargar</button>
          {meta?.actualizado && <span className="text-2xs text-faint">actualizado {new Date(meta.actualizado).toLocaleDateString("es-AR")}</span>}
          <label className={`cursor-pointer rounded-md border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:bg-ink/[0.03] ${cargando ? "pointer-events-none opacity-50" : ""}`}>
            Subir carpeta
            <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => onArchivos(e.target.files)} {...({ webkitdirectory: "", directory: "" } as Record<string, string>)} />
          </label>
          <label className={`cursor-pointer rounded-md border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:bg-ink/[0.03] ${cargando ? "pointer-events-none opacity-50" : ""}`}>
            Archivos
            <input type="file" accept=".csv,.xls,.xlsx,.pdf" multiple className="hidden" onChange={(e) => onArchivos(e.target.files)} />
          </label>
          {hayDatos && (
            <button onClick={borrarTodo} disabled={cargando} title="Borra todo lo cargado para volver a subir la carpeta de cero" className="rounded-md px-2.5 py-1.5 text-xs font-medium text-bad hover:bg-bad/5 disabled:opacity-50">Empezar de cero</button>
          )}
        </div>
      </div>

      {cargando && <Card className="p-3 text-sm text-muted">{progreso || "Procesando…"}</Card>}
      {error && <Card className="border-bad/40 bg-bad/[0.04] p-3 text-sm text-bad">{error}</Card>}
      {guardado && !cargando && (
        <Card className={`p-3 text-sm ${guardado.fallidos.length ? "border-warn/40 bg-warn/[0.05]" : "border-ok/40 bg-ok/[0.05]"}`}>
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className={guardado.fallidos.length ? "text-warn" : "text-ok"}>
                {guardado.fallidos.length ? "⚠️" : "✅"} Guardé <b>{int(guardado.movs)}</b> movimientos
                {guardado.bancos.length > 0 && <> en <b>{guardado.bancos.length}</b> banco{guardado.bancos.length > 1 ? "s" : ""}: <span className="text-ink">{guardado.bancos.join(", ")}</span></>}.
              </p>
              {guardado.fallidos.length > 0 && (
                <p className="mt-1 text-2xs text-warn">No entraron (probá subirlos de nuevo): <b>{guardado.fallidos.join(", ")}</b>.</p>
              )}
            </div>
            <button onClick={() => setGuardado(null)} className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-muted hover:bg-ink/5">Cerrar</button>
          </div>
        </Card>
      )}

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
          {preview.errores.length > 0 && (
            <div className="mt-2 rounded-md border border-warn/30 bg-warn/[0.06] p-2">
              <p className="text-xs font-semibold text-warn">{preview.errores.length} archivo{preview.errores.length > 1 ? "s" : ""} no {preview.errores.length > 1 ? "entraron" : "entró"} — revisá antes de guardar:</p>
              <ul className="mt-1 space-y-0.5">
                {preview.errores.map((e, i) => (
                  <li key={i} className="text-2xs text-ink/70">• {e}</li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}

      {(!hayDatos || ayuda) && !cargando && <Tutorial vacio={!hayDatos} onCerrar={() => setAyuda(false)} />}

      {hayDatos && r && (
        <>
          {/* Filtros */}
          <div data-tour="bancos-filtros" className="flex flex-wrap items-center gap-2">
            {/* Filtro general por razón social: reescopa toda la pantalla a una contraparte */}
            <div className="relative">
              {cuitSel ? (
                <div className="flex items-center gap-1.5 rounded-md border border-action/40 bg-action/[0.06] px-2 py-1 text-2xs">
                  <span className="text-faint">Contraparte:</span>
                  <b className="max-w-[220px] truncate text-ink">{nombreContraparte(cuitSel)}</b>
                  <button onClick={limpiarContraparte} title="Quitar filtro de contraparte" className="ml-0.5 font-bold text-action hover:text-ink">×</button>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-1">
                    <span className="text-faint">🔎</span>
                    <input
                      value={qRazon}
                      onChange={(e) => { setQRazon(e.target.value); setAbierto(true); }}
                      onFocus={() => setAbierto(true)}
                      placeholder="Filtrar por empresa propia…"
                      className="w-52 bg-transparent text-2xs text-ink placeholder:text-faint focus:outline-none"
                    />
                    {qRazon && <button onClick={() => setQRazon("")} title="Borrar" className="text-faint hover:text-ink">×</button>}
                  </div>
                  {abierto && (
                    <>
                      <div className="fixed inset-0 z-30" onClick={() => setAbierto(false)} aria-hidden />
                      <div className="absolute left-0 top-full z-40 mt-1 max-h-72 w-80 overflow-auto rounded-md border border-line bg-surface py-1 shadow-lg">
                        <p className="border-b border-line px-3 py-1.5 text-[10px] leading-snug text-faint">
                          Solo <b className="text-muted">empresas propias del grupo</b> (traspasos entre tus sociedades). Las contrapartes externas (Rappi, clientes, proveedores) están en las pestañas <b className="text-muted">Ingresos/Egresos × CUIT</b>.
                        </p>
                        {sugerencias.length === 0 ? (
                          <p className="px-3 py-2 text-2xs text-faint">{propias.length ? "Ninguna empresa propia coincide con la búsqueda." : "No hay movimientos con una empresa propia identificada por CUIT."}</p>
                        ) : sugerencias.map((c) => (
                          <button key={c.cuit} onClick={() => elegirContraparte(c.cuit)} className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left hover:bg-ink/[0.04]">
                            <span className="min-w-0">
                              <span className="block truncate text-2xs font-medium text-ink">{c.nombre ?? c.cuit}</span>
                              <span className="block truncate text-[10px] text-faint">{c.cuit}{c.tipo ? ` · ${tipoLabel(c.tipo)}` : ""} · {int(c.n)} mov</span>
                            </span>
                            <span className="shrink-0 font-mono text-2xs text-muted">{moneyC(c.monto)}</span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
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
            {(mesSel || bancoSel || cuitSel) && <button onClick={() => filtrar("", "", "")} className="text-2xs font-medium text-action hover:underline">limpiar</button>}
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Ingresos" value={moneyC(r.ingresos)} full={money(r.ingresos)} tone="ok" sub={`${int(r.total)} movimientos`} />
            <Kpi label="Egresos" value={moneyC(r.egresos)} full={money(r.egresos)} tone="bad" />
            <Kpi label="Neto" value={moneyC(r.neto)} full={money(r.neto)} tone={r.neto < 0 ? "bad" : "ok"} sub="incluye traspasos internos" />
            <Kpi label="Período" value={r.desde && r.hasta ? `${mesLabel(r.desde.slice(0, 7))} → ${mesLabel(r.hasta.slice(0, 7))}` : "—"} plain sub={`${r.porBanco.length} bancos`} />
          </div>

          {/* Aviso: banco no reconocido ("Otro") — destapa plata sin clasificar */}
          {(() => {
            const otro = r.porBanco.find((b) => b.k === "Otro");
            if (!otro) return null;
            return (
              <Card className="border-warn/40 bg-warn/[0.05] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-2xs leading-snug text-ink">
                    ⚠️ <b>{int(otro.n)} movimientos</b> ({money(otro.ingresos)} entradas · {money(otro.egresos)} salidas) quedaron como banco <b>“Otro”</b>: la app no reconoció de qué banco son (archivo suelto o formato nuevo).
                    <span className="text-muted"> Están en los totales pero sin clasificar.</span>
                  </p>
                  <button onClick={() => abrirDetalle({ banco: "Otro" }, "Banco no reconocido (Otro)")} className="shrink-0 rounded-md border border-warn/40 bg-surface px-2.5 py-1 text-2xs font-medium text-warn hover:bg-warn/10">Ver movimientos →</button>
                </div>
              </Card>
            );
          })()}

          {/* Desglose */}
          <Card className="overflow-hidden p-0">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2">
              <div data-tour="bancos-tabs" className="flex flex-wrap gap-1">
                {([["banco", "Por banco"], ["local", "Por local"], ["mes", "Por mes"], ["categoria", "Por categoría"], ["cuit-ing", "Ingresos × CUIT"], ["cuit-egr", "Egresos × CUIT"], ["intercompany", "Intercompany"]] as const).map(([k, l]) => (
                  <button key={k} {...(k === "cuit-ing" ? { "data-tour": "bancos-tab-cuit" } : {})} onClick={() => setTab(k)} className={`rounded-md px-2.5 py-1 text-2xs font-medium ${tab === k ? "bg-ink/[0.06] text-ink" : "text-muted hover:bg-ink/[0.03]"}`}>{l}</button>
                ))}
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => setVerCobertura((v) => !v)} className="text-2xs font-medium text-muted hover:text-ink" title="Ver qué extractos ya cargaste, por banco y mes, y detectar meses faltantes">{verCobertura ? "ocultar" : "¿qué cargué?"}</button>
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
            {esCuit && avisoBase && (
              <div className={`flex items-start justify-between gap-3 border-b border-line px-3 py-2 text-2xs ${avisoBase.huboDescartes ? "bg-warn/[0.08] text-warn" : "bg-ok/[0.08] text-ok"}`}>
                <span><b>{avisoBase.huboDescartes ? "Cargado con avisos" : "✓ Cargado"}:</b> {avisoBase.texto}</span>
                <button onClick={() => setAvisoBase(null)} className="shrink-0 font-medium opacity-70 hover:opacity-100">cerrar</button>
              </div>
            )}
            {esCuit && basesConteo.cliente === 0 && basesConteo.proveedor === 0 && (
              <div className="border-b border-line bg-action/[0.06] px-3 py-2 text-2xs text-action">
                💡 Todavía no cargaste las bases. Subí <b>clientes</b> y <b>proveedores</b> (los exportás de Tango) con los botones de acá arriba, y cada CUIT va a mostrar el <b>nombre</b> en vez del número.
              </div>
            )}
            {esCuit && (
              <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
                <div className="relative min-w-0 flex-1">
                  <input
                    value={buscarCuit}
                    onChange={(e) => setBuscarCuit(e.target.value)}
                    placeholder="Buscar por razón social o CUIT…"
                    className="w-full rounded-md border border-line bg-surface px-2.5 py-1 pr-6 text-2xs text-ink placeholder:text-faint focus:border-action"
                  />
                  {buscarCuit && <button onClick={() => setBuscarCuit("")} title="Limpiar" className="absolute right-1.5 top-1/2 -translate-y-1/2 text-faint hover:text-ink">×</button>}
                </div>
                {(basesConteo.cliente > 0 || basesConteo.proveedor > 0) && (
                  <div className="flex gap-1">
                    {([["", "Todos"], ["cliente", "Clientes"], ["proveedor", "Proveedores"], ["propia", "Internos"]] as const).map(([k, l]) => (
                      <button key={k || "todos"} onClick={() => setTipoCuit(k)} className={`rounded-md px-2 py-1 text-2xs font-medium ${tipoCuit === k ? "bg-ink/[0.06] text-ink" : "text-muted hover:bg-ink/[0.03]"}`}>{l}</button>
                    ))}
                  </div>
                )}
                <span className="text-2xs text-faint">{int(filasCuit.length)} {filasCuit.length === 1 ? "contraparte" : "contrapartes"}</span>
              </div>
            )}
            {esInter && (
              <div className="border-b border-line bg-ink/[0.015] px-4 py-2.5 text-2xs text-muted">
                Plata que se mueve <b className="text-ink">entre tus propias cuentas</b> (las {intercompany?.porEmpresa.length ?? 0} empresas del grupo que aparecen). Sin terceros (clientes, proveedores, Rappi, etc.).
              </div>
            )}
            <div className="overflow-x-auto">
              {esInter ? (
                !intercompany || intercompany.n === 0 ? (
                  <p className="px-4 py-8 text-center text-2xs text-faint">No hay movimientos entre cuentas propias en este filtro. (Requiere que el CUIT de la contraparte sea una empresa del grupo — cargá las bases si falta.)</p>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3 border-b border-line px-4 py-3 lg:grid-cols-4">
                      <MiniK label="Total movido" value={money(intercompany.total)} />
                      <MiniK label="Entradas" value={money(intercompany.ingresos)} tone="ok" />
                      <MiniK label="Salidas" value={money(intercompany.egresos)} tone="bad" />
                      <MiniK label="Movimientos" value={int(intercompany.n)} />
                    </div>
                    <table className="w-full text-left text-sm">
                      <thead><tr className="border-b border-line text-2xs uppercase tracking-wide text-faint">
                        <th className="px-4 py-2 font-medium">Empresa propia</th>
                        <th className="px-3 py-2 text-right font-medium">Mov</th>
                        <th className="px-3 py-2 text-right font-medium">Entradas</th>
                        <th className="px-3 py-2 text-right font-medium">Salidas</th>
                        <th className="px-3 py-2 font-medium">Neto</th>
                      </tr></thead>
                      <tbody>
                        {intercompany.porEmpresa.map((e) => (
                          <tr key={e.cuit} className="border-b border-line/70 last:border-0 hover:bg-ink/[0.02]">
                            <td className="px-4 py-2 text-ink">{e.nombre} <span className="ml-1 font-mono text-2xs text-faint">{e.cuit}</span></td>
                            <td className="px-3 py-2 text-right font-mono tnum text-muted">{int(e.n)}</td>
                            <td className="px-3 py-2 text-right font-mono tnum text-ok monto">{e.ingreso ? money(e.ingreso) : "—"}</td>
                            <td className="px-3 py-2 text-right font-mono tnum text-bad monto">{e.egreso ? money(e.egreso) : "—"}</td>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-2">
                                <div className="h-1.5 w-24 overflow-hidden rounded-full bg-ink/10"><div className={`h-full rounded-full ${e.neto < 0 ? "bg-bad/70" : "bg-ok/80"}`} style={{ width: `${Math.max(2, ((e.ingreso + e.egreso) / maxInter) * 100)}%` }} /></div>
                                <span className="font-mono tnum font-medium text-ink monto">{money(e.neto)}</span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )
              ) : esCuit ? (
                <table className="w-full text-left text-sm">
                  <thead><tr className="border-b border-line text-2xs uppercase tracking-wide text-faint">
                    <th className="px-4 py-2 font-medium">CUIT contraparte</th>
                    <th className="px-3 py-2 text-right font-medium">Mov</th>
                    <th className="px-3 py-2 font-medium">{tab === "cuit-egr" ? "Pagado" : "Ingresado"}</th>
                  </tr></thead>
                  <tbody>
                    {filasCuit.length === 0 ? (
                      <tr><td colSpan={3} className="px-4 py-6 text-center text-2xs text-faint">{buscarCuit || tipoCuit ? "Ninguna contraparte coincide con la búsqueda." : "Ningún movimiento con CUIT de contraparte en este filtro (ventas con tarjeta, impuestos y comisiones no traen CUIT)."}</td></tr>
                    ) : filasCuit.map((f) => (
                      <tr key={f.cuit} onClick={() => abrirDetalle({ cuit: f.cuit }, `Contraparte: ${f.nombre ?? f.cuit}`)} title="Ver los movimientos" className="cursor-pointer border-b border-line/70 last:border-0 hover:bg-action/[0.04]">
                        <td className="px-4 py-2 text-ink"><span className="font-mono">{f.cuit}</span>{f.nombre && <span className="ml-2 font-medium">{f.nombre}</span>}{f.tipo && <span className="ml-1.5 rounded bg-ink/[0.06] px-1 py-px text-2xs text-muted">{tipoLabel(f.tipo)}</span>}<span className="ml-1.5 text-2xs text-faint">›</span></td>
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
                    {filas.map((f) => { const neto = f.ingresos - f.egresos; const dim: Record<string, string> = tab === "banco" ? { banco: f.k } : tab === "local" ? { local: f.k } : tab === "mes" ? { mes: f.k } : { categoria: f.k }; return (
                      <tr key={f.k} onClick={() => abrirDetalle(dim, `${tab === "banco" ? "Banco" : tab === "local" ? "Local" : tab === "mes" ? "Mes" : "Categoría"}: ${tab === "mes" ? mesLabel(f.k) : f.k}`)} title="Ver los movimientos" className="cursor-pointer border-b border-line/70 last:border-0 hover:bg-action/[0.04]">
                        <td className="px-4 py-2 font-medium text-ink">{tab === "mes" ? mesLabel(f.k) : f.k}<span className="ml-1.5 text-2xs text-faint">›</span></td>
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
            {verCobertura && matrizCob && (
              <div className="border-t border-line bg-ink/[0.015] px-4 py-3">
                <p className="text-2xs font-semibold text-ink">¿Qué extractos tengo cargados?</p>
                <p className="mb-2 mt-0.5 text-2xs leading-snug text-muted">
                  Cada fila es un <b>banco · local</b> y cada columna un <b>mes</b>; el número es cuántos movimientos cargaste.
                  {matrizCob.totalHuecos > 0
                    ? <> Hay <b className="text-warn">{matrizCob.totalHuecos} mes{matrizCob.totalHuecos === 1 ? "" : "es"} en rojo</b> entre medio que te falta subir.</>
                    : <> No hay huecos: cada banco tiene todos sus meses seguidos. ✓</>}
                </p>
                <div className="max-h-64 overflow-auto rounded-md border border-line">
                  <table className="border-collapse text-2xs">
                    <thead className="sticky top-0 z-20 bg-surface">
                      <tr className="border-b border-line">
                        <th className="sticky left-0 z-30 bg-surface px-2 py-1.5 text-left font-medium text-muted">Banco · Local</th>
                        {matrizCob.meses.map((m) => <th key={m} className="whitespace-nowrap px-2 py-1.5 text-right font-medium text-faint">{mesLabel(m)}</th>)}
                        <th className="px-2 py-1.5 text-right font-medium text-muted">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {matrizCob.filas.map((f) => (
                        <tr key={`${f.banco}|${f.local}`} className="border-b border-line/50 last:border-0">
                          <th className="sticky left-0 z-10 whitespace-nowrap bg-surface px-2 py-1 text-left font-normal text-ink">{f.banco} · <span className="text-muted">{f.local}</span></th>
                          {matrizCob.meses.map((m) => {
                            const n = f.porMes.get(m);
                            const hueco = f.huecos.has(m);
                            return (
                              <td key={m} className={`px-2 py-1 text-right tabular-nums ${n ? "text-ink" : hueco ? "bg-warn/15 font-medium text-warn" : "text-faint/40"}`}>
                                {n ? int(n) : hueco ? "falta" : "·"}
                              </td>
                            );
                          })}
                          <td className="px-2 py-1 text-right font-semibold tabular-nums text-ink">{int(f.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </Card>
        </>
      )}

      {detalle && <DetalleModal titulo={detalle.titulo} filtro={detalle.filtro} onClose={() => setDetalle(null)} />}
    </div>
  );
}

// Detalle: movimientos línea por línea de un corte (para conciliar y exportar).
function DetalleModal({ titulo, filtro, onClose }: { titulo: string; filtro: Record<string, string>; onClose: () => void }) {
  const [movs, setMovs] = useState<MovBanco[] | null>(null);
  const [total, setTotal] = useState(0);
  const [suma, setSuma] = useState<{ ingresos: number; egresos: number }>({ ingresos: 0, egresos: 0 });
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");
  const LIM = 500;

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const qs = new URLSearchParams({ ...filtro, limit: String(LIM) });
        const j = await (await fetch("/api/bancos/detalle?" + qs.toString(), { cache: "no-store" })).json();
        if (!vivo) return;
        if (!j.ok) { setErr(j.error || "no se pudo cargar"); return; }
        setMovs(j.movs ?? []); setTotal(j.total ?? 0); setSuma(j.suma ?? { ingresos: 0, egresos: 0 });
      } catch (e) { if (vivo) setErr(e instanceof Error ? e.message : "error"); }
    })();
    return () => { vivo = false; };
  }, [JSON.stringify(filtro)]); // eslint-disable-line react-hooks/exhaustive-deps

  const vis = useMemo(() => {
    const t = normTxt(q.trim());
    return (movs ?? []).filter((m) => !t || normTxt((m.concepto ?? "") + " " + (m.cuit ?? "") + " " + m.banco + " " + m.local).includes(t));
  }, [movs, q]);

  async function exportarDetalle() {
    // Trae TODO el corte (no solo la página) para el CSV de conciliación.
    const qs = new URLSearchParams({ ...filtro, limit: "20000" });
    const j = await (await fetch("/api/bancos/detalle?" + qs.toString(), { cache: "no-store" })).json();
    const rows: MovBanco[] = j.movs ?? [];
    descargarCSV(`bancos-detalle.csv`, ["fecha", "banco", "local", "concepto", "categoria", "cuit", "ingreso", "egreso"],
      rows.map((m) => [m.fecha, m.banco, m.local, m.concepto, m.categoria, m.cuit ?? "", Math.round(m.ingreso), Math.round(m.egreso)]));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-3 sm:p-8" onClick={onClose}>
      <div className="w-full max-w-4xl rounded-card border border-line bg-surface shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
          <div className="min-w-0">
            <p className="truncate font-display text-sm font-semibold text-ink">{titulo}</p>
            <p className="text-2xs text-faint">{int(total)} movimientos · <span className="text-ok">{money(suma.ingresos)}</span> entradas · <span className="text-bad">{money(suma.egresos)}</span> salidas{total > LIM ? ` · mostrando los ${LIM} más recientes` : ""}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={exportarDetalle} className="rounded-md border border-line bg-surface px-2.5 py-1 text-2xs font-medium text-action hover:bg-action/5">⬇ Exportar detalle</button>
            <button onClick={onClose} className="text-2xs font-medium text-muted hover:text-ink">cerrar</button>
          </div>
        </div>
        <div className="border-b border-line px-4 py-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar en concepto / CUIT…" className="w-full rounded-md border border-line bg-surface px-2.5 py-1 text-2xs text-ink placeholder:text-faint focus:border-action" />
        </div>
        {err ? (
          <p className="px-4 py-8 text-center text-2xs text-bad">{err}</p>
        ) : movs === null ? (
          <p className="px-4 py-8 text-center text-2xs text-faint">Cargando movimientos…</p>
        ) : (
          <div className="max-h-[60vh] overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-surface"><tr className="border-b border-line text-2xs uppercase tracking-wide text-faint">
                <th className="px-4 py-2 font-medium">Fecha</th>
                <th className="px-3 py-2 font-medium">Concepto</th>
                <th className="px-3 py-2 font-medium">Banco · Local</th>
                <th className="px-3 py-2 text-right font-medium">Entrada</th>
                <th className="px-3 py-2 text-right font-medium">Salida</th>
              </tr></thead>
              <tbody>
                {vis.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-6 text-center text-2xs text-faint">{q ? "Nada coincide con la búsqueda." : "Sin movimientos."}</td></tr>
                ) : vis.map((m, i) => (
                  <tr key={i} className="border-b border-line/60 last:border-0 hover:bg-ink/[0.02]">
                    <td className="whitespace-nowrap px-4 py-1.5 font-mono text-2xs text-muted">{m.fecha}</td>
                    <td className="px-3 py-1.5 text-2xs text-ink">{m.concepto || "—"}{m.cuit && <span className="ml-1.5 font-mono text-[10px] text-faint">{m.cuit}</span>}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-2xs text-muted">{m.banco} · {m.local}</td>
                    <td className="px-3 py-1.5 text-right font-mono tnum text-ok monto">{m.ingreso ? money(m.ingreso) : "—"}</td>
                    <td className="px-3 py-1.5 text-right font-mono tnum text-bad monto">{m.egreso ? money(m.egreso) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
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

function MiniK({ label, value, tone }: { label: string; value: string; tone?: "ok" | "bad" }) {
  const c = tone === "ok" ? "text-ok" : tone === "bad" ? "text-bad" : "text-ink";
  return (
    <div>
      <p className="text-2xs uppercase tracking-wide text-faint">{label}</p>
      <p className={`mt-0.5 font-mono text-sm font-semibold tnum monto ${c}`}>{value}</p>
    </div>
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
