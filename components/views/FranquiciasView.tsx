"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Card } from "@/components/ui/primitives";
import { descargarCSV } from "@/lib/exportar-csv";
import {
  parseFranquiciasCSV, parseFranquiciasMatriz, resumir, costear, gestionado, gestionKey, canonicalEmpresa, ESTADOS_CC, PARAMS_DEFAULT,
  type FacturaCC, type ParamsCC, type ResumenCC, type ResultadoParse, type Gestion,
} from "@/lib/franquicias";

// Cuentas Corrientes de Franquicias. Subís el estado de cuenta (CSV/Excel) y la app
// RECALCULA todo (mora, tasa, punitorios, saldo, neto) con parámetros que controlás
// vos, en vivo. Separa cobrable de incobrable, muestra el aging y la gestión de cobranza.

const money = (n: number) => "$" + Math.round(n).toLocaleString("es-AR");
const moneyC = (n: number) => {
  const a = Math.abs(n), s = a >= 1e9 ? (n / 1e9).toFixed(2).replace(".", ",") + " mil M"
    : a >= 1e6 ? (n / 1e6).toFixed(1).replace(".", ",") + " M" : a >= 1e3 ? Math.round(n / 1e3) + " k" : String(Math.round(n));
  return "$" + s;
};
const int = (n: number) => Math.round(n).toLocaleString("es-AR");
const hoyISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const fechaLabel = (iso: string) => { if (!iso) return "—"; const [y, m, d] = iso.split("-"); return `${d}/${m}/${y.slice(2)}`; };
const normTxt = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const BUCKET_TONE: Record<string, string> = { "Por vencer": "bg-ink/25", "1–30 días": "bg-ok/70", "31–60 días": "bg-warn/70", "61–90 días": "bg-bad/60", "+90 días": "bg-bad" };

type Tab = "franquiciado" | "empresa" | "local" | "detalle" | "gestion";
type DimKey = "cliente" | "empresa" | "local" | "detalle" | "contacto";
const TABS: [Tab, string][] = [["franquiciado", "Por franquiciado"], ["empresa", "Por empresa"], ["local", "Por local"], ["detalle", "Por concepto"], ["gestion", "Por gestión"]];

export default function FranquiciasView() {
  const [facturas, setFacturas] = useState<FacturaCC[]>([]);
  const [params, setParams] = useState<ParamsCC>({ ...PARAMS_DEFAULT, fechaCorte: hoyISO() });
  const [meta, setMeta] = useState<{ actualizado?: string } | null>(null);
  const [estado, setEstado] = useState<"loading" | "idle" | "saving">("loading");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [progreso, setProgreso] = useState("");
  const [preview, setPreview] = useState<ResultadoParse | null>(null);
  const [tab, setTab] = useState<Tab>("franquiciado");
  const [q, setQ] = useState("");
  const [detalle, setDetalle] = useState<{ titulo: string; dimKey: DimKey; val: string } | null>(null);
  const [verComo, setVerComo] = useState(false);
  const [ajustar, setAjustar] = useState(false);                 // panel de cálculo expandido
  const [fEmpresa, setFEmpresa] = useState("");                  // filtros de la lista
  const [fEstado, setFEstado] = useState<"todos" | "vencido" | "porvencer">("todos");
  const [fGestion, setFGestion] = useState<"todos" | "sin" | "con">("todos");
  const [orden, setOrden] = useState<"neto" | "vencido" | "mora" | "sinGestion">("neto");
  const [formAbierto, setFormAbierto] = useState(false);        // alta de factura manual
  const inputRef = useRef<HTMLInputElement>(null);

  async function cargar() {
    try {
      const j = await (await fetch("/api/franquicias", { cache: "no-store" })).json();
      if (j.ok) {
        setFacturas(j.facturas ?? []);
        setParams((prev) => ({ ...PARAMS_DEFAULT, ...j.params, fechaCorte: j.params?.fechaCorte || prev.fechaCorte || hoyISO() }));
        setMeta(j.meta ?? null);
      }
    } catch { /* vacío */ } finally { setEstado("idle"); }
  }
  useEffect(() => { cargar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const hayDatos = facturas.length > 0;
  const costeadas = useMemo(() => facturas.map((f) => costear(f, params)), [facturas, params]);
  const empresas = useMemo(() => Array.from(new Set(facturas.map((f) => f.empresa).filter(Boolean))).sort(), [facturas]);
  // KPIs + aging: SIEMPRE del total (la foto completa). Los filtros scopean la LISTA.
  const resumen: ResumenCC | null = useMemo(() => hayDatos ? resumir(costeadas, params) : null, [costeadas, hayDatos, params]);
  const hayFiltro = fEmpresa !== "" || fEstado !== "todos" || fGestion !== "todos";
  const filtradas = useMemo(() => costeadas.filter((c) =>
    (!fEmpresa || c.empresa === fEmpresa) &&
    (fEstado === "todos" || (fEstado === "vencido" ? c.vencida : !c.vencida)) &&
    (fGestion === "todos" || (fGestion === "sin" ? (c.vencida && !gestionado(c.contacto)) : gestionado(c.contacto)))
  ), [costeadas, fEmpresa, fEstado, fGestion]);
  const resumenTabla = useMemo(() => hayFiltro ? resumir(filtradas, params) : resumen, [hayFiltro, filtradas, params, resumen]);

  async function onArchivo(files: FileList | null) {
    const f = files?.[0]; if (!f) return;
    setError(""); setEstado("saving"); setProgreso(`Leyendo ${f.name}…`);
    try {
      let res: ResultadoParse;
      if (/\.csv$/i.test(f.name)) {
        let txt = new TextDecoder("utf-8").decode(await f.arrayBuffer());
        if (txt.includes("�")) txt = new TextDecoder("latin1").decode(await f.arrayBuffer());
        res = parseFranquiciasCSV(txt);
      } else {
        const wb = XLSX.read(new Uint8Array(await f.arrayBuffer()), { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, raw: false, defval: "" });
        res = parseFranquiciasMatriz(rows);
      }
      if (res.error || !res.facturas.length) { setError(res.error || "no encontré facturas"); setPreview(null); }
      else setPreview(res);
    } catch (e) { setError(e instanceof Error ? e.message : "no se pudo leer el archivo"); }
    finally { setEstado("idle"); setProgreso(""); if (inputRef.current) inputRef.current.value = ""; }
  }

  async function guardar() {
    if (!preview) return;
    setEstado("saving"); setProgreso("Guardando…");
    try {
      const r = await (await fetch("/api/franquicias", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ facturas: preview.facturas, corte: params.fechaCorte }) })).json();
      if (!r.ok) throw new Error(r.error);
      setInfo(`Guardado: ${int(r.total)} facturas${r.agregadas ? ` · ${r.agregadas} nuevas` : ""}${r.cobradas ? ` · ${r.cobradas} ya no están (cobradas/baja)` : ""}. La gestión de cobranza se mantuvo.`);
      setPreview(null); await cargar();
    } catch (e) { setError(e instanceof Error ? e.message : "no se pudo guardar"); }
    finally { setEstado("idle"); setProgreso(""); }
  }

  async function guardarParams() {
    setProgreso("Guardando parámetros…"); setEstado("saving");
    try { await fetch("/api/franquicias", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ params }) }); }
    finally { setEstado("idle"); setProgreso(""); }
  }

  async function borrarTodo() {
    if (!confirm("¿Borrar la cuenta corriente cargada? Es para volver a subir el estado de cuenta actualizado.")) return;
    setEstado("saving");
    try { await fetch("/api/franquicias", { method: "DELETE" }); setPreview(null); await cargar(); }
    finally { setEstado("idle"); }
  }

  const setP = (patch: Partial<ParamsCC>) => setParams((p) => ({ ...p, ...patch }));

  // Filas de la pestaña activa (usan el resumen FILTRADO + orden elegido)
  const filas = useMemo(() => {
    if (!resumenTabla) return [];
    const base = tab === "franquiciado" ? resumenTabla.porFranquiciado : tab === "empresa" ? resumenTabla.porEmpresa
      : tab === "local" ? resumenTabla.porLocal : tab === "detalle" ? resumenTabla.porDetalle : resumenTabla.porContacto;
    const t = normTxt(q.trim());
    const filt = t ? base.filter((g) => normTxt(g.k + " " + ((g as any).clienteId ?? "")).includes(t)) : base;
    const key = orden === "vencido" ? (g: any) => g.vencido : orden === "mora" ? (g: any) => g.maxMora : orden === "sinGestion" ? (g: any) => g.netoSinGestion : (g: any) => g.neto;
    return [...filt].sort((a, b) => key(b) - key(a));
  }, [resumenTabla, tab, q, orden]);
  const maxNeto = Math.max(1, ...filas.map((f) => f.neto));

  function abrirDetalle(dimKey: DimKey, val: string, titulo: string) {
    setDetalle({ titulo, dimKey, val });
  }
  // Guarda la gestión de una factura (optimista + persiste). Sobrevive a re-subir.
  async function updateGestion(key: string, patch: Gestion) {
    setFacturas((prev) => prev.map((f) => gestionKey(f) === key
      ? { ...f, ...(patch.contacto !== undefined ? { contacto: patch.contacto } : {}), ...(patch.promesa !== undefined ? { promesa: patch.promesa } : {}), ...(patch.nota !== undefined ? { obs: patch.nota } : {}) }
      : f));
    try { await fetch("/api/franquicias", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ gestionKey: key, gestion: patch }) }); }
    catch { /* silencioso: el estado local ya quedó */ }
  }
  // Alta de factura manual (persiste aparte, sobrevive a re-subir).
  async function agregarManual(f: FacturaCC) {
    setEstado("saving");
    try {
      const r = await (await fetch("/api/franquicias", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ manualNueva: f }) })).json();
      if (!r.ok) throw new Error(r.error);
      setFormAbierto(false); setInfo(`Factura agregada a mano para ${f.cliente}.`); await cargar();
    } catch (e) { setError(e instanceof Error ? e.message : "no se pudo agregar"); }
    finally { setEstado("idle"); }
  }
  async function borrarManual(key: string) {
    setFacturas((prev) => prev.filter((f) => gestionKey(f) !== key));
    try { await fetch("/api/franquicias", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ borrarManual: key }) }); } catch { /* */ }
  }
  function filaOnClick(g: any) {
    if (tab === "franquiciado") abrirDetalle("cliente", g.k, `${g.clienteId} · ${g.k}`);
    else if (tab === "empresa") abrirDetalle("empresa", g.k, `Empresa: ${g.k}`);
    else if (tab === "local") abrirDetalle("local", g.k, `Local: ${g.k}`);
    else if (tab === "detalle") abrirDetalle("detalle", g.k, `Concepto: ${g.k}`);
    else abrirDetalle("contacto", g.k, `Gestión: ${g.k}`);
  }

  function exportar() {
    if (!resumen) return;
    const cs = facturas.map((f) => costear(f, params)).sort((a, b) => b.neto - a.neto);
    descargarCSV("franquicias-cuenta-corriente.csv",
      ["cliente_id", "franquiciado", "empresa", "local", "concepto", "comprobante", "vencimiento", "dias_mora", "importe", "cobrado", "saldo", "tasa_%", "punitorios", "neto", "estado", "gestion"],
      cs.map((c) => [c.clienteId, c.cliente, c.empresa, c.local, c.detalle, c.nro, fechaLabel(c.vencimiento), c.diasMora, Math.round(c.importe), Math.round(c.cobrado), Math.round(c.saldo), c.tasa.toFixed(2), Math.round(c.punitorios), Math.round(c.neto), c.vencida ? "Vencida" : "Por vencer", c.contacto]));
  }

  const cargando = estado === "saving";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold text-ink">Cuentas Corrientes · Franquicias</h1>
          <p className="mt-0.5 max-w-2xl text-sm text-muted">Lo que cada franquiciado le debe al grupo. Subís el estado de cuenta y la app recalcula mora, punitorios y neto — vos controlás cómo se suma.</p>
        </div>
        <div className="flex items-center gap-2">
          {meta?.actualizado && <span className="text-2xs text-faint">actualizado {new Date(meta.actualizado).toLocaleDateString("es-AR")}</span>}
          {hayDatos && <button onClick={() => setFormAbierto(true)} disabled={cargando} className="rounded-md border border-action/40 bg-action/5 px-3 py-1.5 text-xs font-medium text-action hover:bg-action/10 disabled:opacity-50">+ Agregar factura</button>}
          <label className={`cursor-pointer rounded-md border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:bg-ink/[0.03] ${cargando ? "pointer-events-none opacity-50" : ""}`}>
            {hayDatos ? "Actualizar (subir archivo)" : "Subir estado de cuenta"}
            <input ref={inputRef} type="file" accept=".csv,.xls,.xlsx" className="hidden" onChange={(e) => onArchivo(e.target.files)} />
          </label>
          {hayDatos && <button onClick={borrarTodo} disabled={cargando} className="rounded-md px-2.5 py-1.5 text-xs font-medium text-bad hover:bg-bad/5 disabled:opacity-50">Borrar</button>}
        </div>
      </div>

      {cargando && <Card className="p-3 text-sm text-muted">{progreso || "Procesando…"}</Card>}
      {error && <Card className="border-bad/40 bg-bad/[0.04] p-3 text-sm text-bad">{error}</Card>}
      {info && !cargando && (
        <Card className="flex items-start justify-between gap-3 border-ok/40 bg-ok/[0.06] p-3 text-sm text-ok">
          <span>✓ {info}</span>
          <button onClick={() => setInfo("")} className="shrink-0 text-2xs font-medium opacity-70 hover:opacity-100">cerrar</button>
        </Card>
      )}

      {/* Preview tras subir */}
      {preview && !cargando && (
        <Card className="border-action/40 bg-action/[0.04] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm text-ink">Detecté <b>{int(preview.facturas.length)}</b> facturas{preview.descartadas > 0 && <> · <span className="text-warn">{preview.descartadas} filas descartadas (sin cliente/importe)</span></>}. <span className="text-muted">Reemplaza la cuenta corriente cargada.</span></p>
              <p className="mt-1 flex flex-wrap gap-1 text-2xs text-faint">Columnas: {Object.entries(preview.columnas).map(([k, v]) => <span key={k} className="rounded bg-ok/10 px-1.5 py-px text-ok">{k}={v}</span>)}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setPreview(null)} className="rounded-md px-2.5 py-1 text-xs font-medium text-muted hover:bg-ink/5">Descartar</button>
              <button onClick={guardar} className="rounded-md bg-ok px-3 py-1 text-xs font-semibold text-white hover:opacity-90">Guardar {int(preview.facturas.length)} facturas</button>
            </div>
          </div>
        </Card>
      )}

      {!hayDatos && !cargando && !preview && <Tutorial />}

      {hayDatos && resumen && (
        <>
          {/* KPIs */}
          <div data-tour="fr-kpis" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Neto a cobrar" value={moneyC(resumen.totalNeto)} full={money(resumen.totalNeto)} tone="ink" sub={`${int(resumen.nFacturas)} facturas`} big />
            <Kpi label="Cobrable real" value={moneyC(resumen.cobrable)} full={money(resumen.cobrable)} tone="ok" sub={params.incluirIncobrables ? "incluye incobrables" : "sin incobrables"} />
            <Kpi label="Vencido" value={moneyC(resumen.vencido)} full={money(resumen.vencido)} tone="bad" sub={`${int(resumen.nVencidas)} fc vencidas`} />
            <Kpi label="Por vencer" value={moneyC(resumen.porVencer)} full={money(resumen.porVencer)} tone="muted" sub="al día" />
          </div>

          {/* Panel de cálculo — compacto: resumen siempre visible, controles al expandir */}
          <Card className="p-3">
            <div data-tour="fr-control" className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-2xs">
              <span className="rounded-md bg-ink/[0.04] px-2 py-1 text-muted">📅 al día <b className="text-ink">{fechaLabel(params.fechaCorte)}</b></span>
              <span className="text-muted">Punitorio: <b className="text-ink">{params.baseAnual}% + {params.diaria}%/día</b> sobre <b className="text-ink">{params.baseCalc}</b></span>
              <span className="text-muted">Incobrables: <b className={params.incluirIncobrables ? "text-warn" : "text-ink"}>{params.incluirIncobrables ? "se cuentan" : "aparte"}</b></span>
              <div className="ml-auto flex items-center gap-2">
                <button onClick={() => setVerComo((v) => !v)} className="font-medium text-action hover:underline">¿cómo se calcula?</button>
                <button onClick={() => setAjustar((v) => !v)} className={`rounded-md border px-2 py-1 font-medium ${ajustar ? "border-action bg-action/10 text-action" : "border-line bg-surface text-ink hover:bg-ink/[0.03]"}`}>{ajustar ? "listo" : "⚙ Ajustar cálculo"}</button>
              </div>
            </div>
            {verComo && (
              <div className="mt-2 rounded-md border border-line bg-ink/[0.02] px-3 py-2 text-2xs leading-relaxed text-muted">
                <b className="text-ink">Cómo se arma cada número</b> (recalcula solo al cambiar un parámetro):<br />
                • <b>Días de mora</b> = fecha de corte − vencimiento · <b>Tasa</b> = {params.baseAnual}% + {params.diaria}% × días.<br />
                • <b>Punitorio</b> = {params.baseCalc} × (tasa ÷ 100) ÷ {params.divisor} × días · <b>Saldo</b> = importe − cobrado · <b>Neto</b> = saldo + punitorio.<br />
                • <b>Cobrable real</b> = neto {params.incluirIncobrables ? "incluyendo" : "excluyendo"} los «INCOBRABLES» ({money(resumen.incobrable)}).
              </div>
            )}
            {ajustar && (
              <div className="mt-3 flex flex-wrap items-end gap-x-4 gap-y-2 border-t border-line pt-3">
                <Ctl label="Al día de"><input type="date" value={params.fechaCorte} onChange={(e) => setP({ fechaCorte: e.target.value })} className="rounded-md border border-line bg-surface px-2 py-1 text-2xs text-ink" /></Ctl>
                <Ctl label="Tasa base %"><NumIn v={params.baseAnual} step={0.5} onChange={(n) => setP({ baseAnual: n })} /></Ctl>
                <Ctl label="+ % por día"><NumIn v={params.diaria} step={0.01} onChange={(n) => setP({ diaria: n })} /></Ctl>
                <Ctl label="Punitorio sobre">
                  <div className="flex overflow-hidden rounded-md border border-line text-2xs">
                    {(["importe", "saldo"] as const).map((b) => (
                      <button key={b} onClick={() => setP({ baseCalc: b })} className={`px-2 py-1 ${params.baseCalc === b ? "bg-ink/[0.07] font-medium text-ink" : "bg-surface text-muted hover:bg-ink/[0.03]"}`}>{b}</button>
                    ))}
                  </div>
                </Ctl>
                <label className="flex cursor-pointer items-center gap-1.5 text-2xs text-muted"><input type="checkbox" checked={params.incluirIncobrables} onChange={(e) => setP({ incluirIncobrables: e.target.checked })} className="accent-action" />Contar incobrables</label>
                <div className="ml-auto flex items-center gap-2">
                  <button onClick={() => setParams({ ...PARAMS_DEFAULT, fechaCorte: params.fechaCorte })} className="text-2xs font-medium text-muted hover:text-ink">reset</button>
                  <button onClick={guardarParams} className="rounded-md border border-line bg-surface px-2 py-1 text-2xs font-medium text-ink hover:bg-ink/[0.03]">Guardar como default</button>
                </div>
              </div>
            )}
          </Card>

          {/* Aging */}
          <Card className="p-3">
            <div data-tour="fr-aging" className="mb-2 flex items-center justify-between">
              <p className="text-2xs font-medium uppercase tracking-wide text-faint">Antigüedad de la deuda (aging)</p>
              <p className="text-2xs text-faint">neto por tramo de mora</p>
            </div>
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-ink/5">
              {resumen.aging.filter((a) => a.neto > 0).map((a) => (
                <div key={a.bucket} className={BUCKET_TONE[a.bucket]} style={{ width: `${(a.neto / Math.max(1, resumen.totalNeto)) * 100}%` }} title={`${a.bucket}: ${money(a.neto)}`} />
              ))}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
              {resumen.aging.map((a) => (
                <div key={a.bucket} className="rounded-md border border-line px-2 py-1.5">
                  <div className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${BUCKET_TONE[a.bucket]}`} /><span className="text-2xs text-muted">{a.bucket}</span></div>
                  <p className="mt-0.5 font-mono text-xs font-semibold text-ink monto">{moneyC(a.neto)}</p>
                  <p className="text-[10px] text-faint">{int(a.n)} fc</p>
                </div>
              ))}
            </div>
          </Card>

          {/* Desglose */}
          <Card className="overflow-hidden p-0">
            <div data-tour="fr-tabs" className="flex flex-wrap gap-1 border-b border-line px-3 py-2">
              {TABS.map(([k, l]) => (
                <button key={k} onClick={() => setTab(k)} className={`rounded-md px-2.5 py-1 text-2xs font-medium ${tab === k ? "bg-ink/[0.06] text-ink" : "text-muted hover:bg-ink/[0.03]"}`}>{l}</button>
              ))}
            </div>
            {/* Filtros rápidos (scopean la lista) + orden + export */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-ink/[0.015] px-3 py-2 text-2xs">
              <select value={fEmpresa} onChange={(e) => setFEmpresa(e.target.value)} className="rounded-md border border-line bg-surface px-2 py-1 text-2xs text-ink">
                <option value="">Todas las empresas</option>
                {empresas.map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
              <Chips value={fEstado} onChange={(v) => setFEstado(v as any)} opts={[["todos", "Todos"], ["vencido", "Vencidos"], ["porvencer", "Por vencer"]]} />
              <Chips value={fGestion} onChange={(v) => setFGestion(v as any)} opts={[["todos", "Gestión: todas"], ["sin", "Sin gestionar"], ["con", "Gestionados"]]} />
              {hayFiltro && <button onClick={() => { setFEmpresa(""); setFEstado("todos"); setFGestion("todos"); }} className="font-medium text-action hover:underline">limpiar</button>}
              <div className="ml-auto flex items-center gap-2">
                <label className="text-faint">ordenar</label>
                <select value={orden} onChange={(e) => setOrden(e.target.value as any)} className="rounded-md border border-line bg-surface px-2 py-1 text-2xs text-ink">
                  <option value="neto">por neto</option><option value="vencido">por vencido</option><option value="mora">por días de mora</option><option value="sinGestion">a gestionar</option>
                </select>
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…" className="w-32 rounded-md border border-line bg-surface px-2.5 py-1 text-2xs text-ink placeholder:text-faint focus:border-action" />
                <button onClick={exportar} className="font-medium text-action hover:underline">Exportar</button>
              </div>
            </div>
            {resumenTabla && (
              <div className="border-b border-line px-3 py-1.5 text-2xs text-faint">{int(filas.length)} {tab === "franquiciado" ? "franquiciados" : tab === "empresa" ? "empresas" : "filas"} · neto <b className="text-ink monto">{money(filas.reduce((s, f) => s + f.neto, 0))}</b>{hayFiltro && " (con filtros)"}</div>
            )}
            <div className="max-h-[30rem] overflow-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-surface"><tr className="border-b border-line text-2xs uppercase tracking-wide text-faint">
                  <th className="px-4 py-2 font-medium">{tab === "franquiciado" ? "Franquiciado" : tab === "empresa" ? "Empresa" : tab === "local" ? "Local" : tab === "detalle" ? "Concepto" : "Gestión"}</th>
                  <th className="px-3 py-2 text-right font-medium">Mora</th>
                  {tab === "franquiciado" && <th className="px-3 py-2 font-medium">Cobranza</th>}
                  <th className="px-3 py-2 text-right font-medium">Vencido</th>
                  <th className="px-3 py-2 font-medium">Neto a cobrar</th>
                </tr></thead>
                <tbody>
                  {filas.length === 0 ? (
                    <tr><td colSpan={tab === "franquiciado" ? 5 : 4} className="px-4 py-6 text-center text-2xs text-faint">{hayFiltro || q ? "Nada coincide con estos filtros." : "Sin datos."}</td></tr>
                  ) : filas.map((g: any) => {
                    const prioridad = g.netoSinGestion > 0; // vencido sin gestionar = perseguir
                    return (
                    <tr key={g.k} onClick={() => filaOnClick(g)} title="Ver las facturas" className={`cursor-pointer border-b border-line/70 last:border-0 hover:bg-action/[0.04] ${prioridad ? "border-l-2 border-l-bad/60" : ""}`}>
                      <td className="px-4 py-2"><span className="font-medium text-ink">{g.k}</span>{g.clienteId && <span className="ml-2 font-mono text-2xs text-faint">#{g.clienteId}</span>}<span className="ml-1.5 text-2xs text-faint">›</span></td>
                      <td className="px-3 py-2 text-right font-mono tnum text-2xs text-muted">{g.maxMora > 0 ? `${g.maxMora}d` : "—"}</td>
                      {tab === "franquiciado" && <td className="px-3 py-2"><GestionChip g={g} /></td>}
                      <td className="px-3 py-2 text-right font-mono tnum text-bad monto">{g.vencido ? moneyC(g.vencido) : "—"}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-ink/10 sm:w-28"><div className="h-full rounded-full bg-action/70" style={{ width: `${Math.max(2, (g.neto / maxNeto) * 100)}%` }} /></div>
                          <span className="font-mono tnum font-medium text-ink monto">{money(g.neto)}</span>
                        </div>
                      </td>
                    </tr>
                  ); })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {detalle && <DetalleModal titulo={detalle.titulo} facturas={facturas} dimKey={detalle.dimKey} val={detalle.val} params={params} onGestion={updateGestion} onBorrarManual={borrarManual} onClose={() => setDetalle(null)} />}
      {formAbierto && <FacturaFormModal empresas={empresas} onGuardar={agregarManual} onClose={() => setFormAbierto(false)} />}
    </div>
  );
}

function Ctl({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex flex-col gap-0.5"><span className="text-[10px] uppercase tracking-wide text-faint">{label}</span>{children}</label>;
}
function Chips({ value, onChange, opts }: { value: string; onChange: (v: string) => void; opts: [string, string][] }) {
  return (
    <div className="flex overflow-hidden rounded-md border border-line">
      {opts.map(([k, l]) => (
        <button key={k} onClick={() => onChange(k)} className={`px-2 py-1 text-2xs ${value === k ? "bg-ink/[0.07] font-medium text-ink" : "bg-surface text-muted hover:bg-ink/[0.03]"}`}>{l}</button>
      ))}
    </div>
  );
}
// Estado de cobranza del franquiciado: rojo si hay vencido sin gestionar (perseguir),
// verde si el vencido ya se gestionó, gris si está al día.
function GestionChip({ g }: { g: { netoSinGestion: number; vencido: number } }) {
  if (g.netoSinGestion > 0) return <span className="rounded bg-bad/10 px-1.5 py-px text-[10px] font-medium text-bad">a gestionar</span>;
  if (g.vencido > 0) return <span className="rounded bg-ok/10 px-1.5 py-px text-[10px] font-medium text-ok">gestionado</span>;
  return <span className="rounded bg-ink/[0.05] px-1.5 py-px text-[10px] text-faint">al día</span>;
}
function NumIn({ v, step, onChange }: { v: number; step: number; onChange: (n: number) => void }) {
  return <input type="number" step={step} value={v} onChange={(e) => onChange(Number(e.target.value) || 0)} className="w-20 rounded-md border border-line bg-surface px-2 py-1 text-2xs text-ink" />;
}
function Kpi({ label, value, sub, tone, full, big }: { label: string; value: string; sub?: string; tone: "ink" | "ok" | "bad" | "muted"; full?: string; big?: boolean }) {
  const c = tone === "ok" ? "text-ok" : tone === "bad" ? "text-bad" : tone === "muted" ? "text-muted" : "text-ink";
  return (
    <Card className="group p-3">
      <p className="text-2xs uppercase tracking-wide text-faint">{label}</p>
      <p className={`mt-0.5 font-display font-semibold leading-tight tnum ${big ? "text-xl sm:text-3xl" : "text-base sm:text-2xl"} ${c}`}>
        <span className="monto"><span className="group-hover:hidden">{value}</span>{full && <span className="hidden whitespace-nowrap text-[0.7em] group-hover:inline">{full}</span>}</span>
      </p>
      {sub && <p className="text-2xs text-faint">{sub}</p>}
    </Card>
  );
}

const CONTACTOS = ["", "Contactado", "Contactado sin respuesta", "Sin contacto"];
// Detalle de un corte: facturas línea por línea, con GESTIÓN de cobranza EDITABLE
// (contacto, promesa de pago, nota) que persiste y sobrevive a re-subir el archivo.
function DetalleModal({ titulo, facturas, dimKey, val, params, onGestion, onBorrarManual, onClose }: { titulo: string; facturas: FacturaCC[]; dimKey: DimKey; val: string; params: ParamsCC; onGestion: (key: string, patch: Gestion) => void; onBorrarManual: (key: string) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [abierto, setAbierto] = useState<string | null>(null); // key de la fila expandida
  const propio = (f: FacturaCC) => (dimKey === "cliente" ? f.cliente : dimKey === "empresa" ? f.empresa : dimKey === "local" ? f.local : dimKey === "detalle" ? f.detalle : f.contacto);
  const cs = useMemo(() => facturas.filter((f) => propio(f) === val).map((f) => costear(f, params)).sort((a, b) => b.neto - a.neto), [facturas, val, params]); // eslint-disable-line react-hooks/exhaustive-deps
  const vis = useMemo(() => { const t = normTxt(q.trim()); return t ? cs.filter((c) => normTxt(c.detalle + " " + c.nro + " " + (c.obs ?? "")).includes(t)) : cs; }, [cs, q]);
  const tot = cs.reduce((s, c) => ({ neto: s.neto + c.neto, saldo: s.saldo + c.saldo, pun: s.pun + c.punitorios }), { neto: 0, saldo: 0, pun: 0 });
  function exportar() {
    descargarCSV("franquicias-detalle.csv", ["vencimiento", "concepto", "comprobante", "dias_mora", "importe", "cobrado", "saldo", "punitorios", "neto", "gestion", "promesa", "nota"],
      cs.map((c) => [fechaLabel(c.vencimiento), c.detalle, c.nro, c.diasMora, Math.round(c.importe), Math.round(c.cobrado), Math.round(c.saldo), Math.round(c.punitorios), Math.round(c.neto), c.contacto, c.promesa ? fechaLabel(c.promesa) : "", c.obs ?? ""]));
  }
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-3 sm:p-8" onClick={onClose}>
      <div className="w-full max-w-4xl rounded-card border border-line bg-surface shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
          <div className="min-w-0">
            <p className="truncate font-display text-sm font-semibold text-ink">{titulo}</p>
            <p className="text-2xs text-faint">{int(cs.length)} facturas · saldo <span className="text-ink monto">{money(tot.saldo)}</span> · punitorios <span className="text-warn monto">{money(tot.pun)}</span> · neto <span className="text-ink monto">{money(tot.neto)}</span></p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={exportar} className="rounded-md border border-line bg-surface px-2.5 py-1 text-2xs font-medium text-action hover:bg-action/5">⬇ Exportar</button>
            <button onClick={onClose} className="text-2xs font-medium text-muted hover:text-ink">cerrar</button>
          </div>
        </div>
        <div className="border-b border-line px-4 py-2 text-2xs text-faint">Editá la <b className="text-muted">gestión de cobranza</b> acá — se guarda solo y <b className="text-muted">no se pierde</b> cuando volvés a subir el estado de cuenta.</div>
        <div className="max-h-[60vh] overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-surface"><tr className="border-b border-line text-2xs uppercase tracking-wide text-faint">
              <th className="px-4 py-2 font-medium">Vence</th><th className="px-3 py-2 font-medium">Concepto</th>
              <th className="px-3 py-2 text-right font-medium">Mora</th><th className="px-3 py-2 text-right font-medium">Neto</th>
              <th className="px-3 py-2 font-medium">Cobranza</th>
            </tr></thead>
            <tbody>
              {vis.map((c) => {
                const k = gestionKey(c); const exp = abierto === k;
                return (
                <FilaFactura key={k || c.nro} c={c} exp={exp} onToggle={() => setAbierto(exp ? null : k)} onGestion={(patch) => onGestion(k, patch)} onBorrar={() => onBorrarManual(k)} editable={!!k} />
              ); })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function FilaFactura({ c, exp, onToggle, onGestion, onBorrar, editable }: { c: ReturnType<typeof costear>; exp: boolean; onToggle: () => void; onGestion: (patch: Gestion) => void; onBorrar: () => void; editable: boolean }) {
  const [nota, setNota] = useState(c.obs ?? "");
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  return (
    <>
      <tr onClick={onToggle} className={`cursor-pointer border-b border-line/60 hover:bg-ink/[0.02] ${c.cobradaManual ? "opacity-60" : ""}`}>
        <td className="whitespace-nowrap px-4 py-1.5 font-mono text-2xs text-muted">{fechaLabel(c.vencimiento)}</td>
        <td className="px-3 py-1.5 text-2xs text-ink">{c.detalle || "—"}
          {c.manual && <span className="ml-1.5 rounded bg-action/10 px-1 py-px text-[10px] font-medium text-action">manual</span>}
          {c.estado && <span className={`ml-1.5 rounded px-1 py-px text-[10px] font-medium ${c.cobradaManual ? "bg-ok/10 text-ok" : c.incobrable ? "bg-bad/10 text-bad" : "bg-ink/[0.06] text-muted"}`}>{c.estado}</span>}
          {!c.estado && c.incobrable && <span className="ml-1.5 rounded bg-bad/10 px-1 py-px text-[10px] font-medium text-bad">incobrable</span>}
          <span className="ml-1.5 font-mono text-[10px] text-faint">{c.nro}</span></td>
        <td className="px-3 py-1.5 text-right font-mono text-2xs text-muted">{c.diasMora > 0 ? `${c.diasMora}d` : "—"}</td>
        <td className="px-3 py-1.5 text-right font-mono tnum font-medium text-ink monto">{money(c.neto)}</td>
        <td className="px-3 py-1.5">
          {editable ? (
            <select value={CONTACTOS.includes(c.contacto) ? c.contacto : ""} onClick={stop} onChange={(e) => onGestion({ contacto: e.target.value })} className={`rounded-md border px-1.5 py-0.5 text-[11px] ${gestionado(c.contacto) ? "border-ok/40 bg-ok/5 text-ok" : c.diasMora > 0 ? "border-bad/40 bg-bad/5 text-bad" : "border-line bg-surface text-muted"}`}>
              <option value="">Sin gestionar</option>
              <option value="Contactado">Contactado</option>
              <option value="Contactado sin respuesta">Sin respuesta</option>
              <option value="Sin contacto">Sin contacto</option>
            </select>
          ) : <span className="text-2xs text-faint">—</span>}
          {c.promesa && <span className="ml-1.5 rounded bg-action/10 px-1 py-px text-[10px] text-action">💰 {fechaLabel(c.promesa)}</span>}
        </td>
      </tr>
      {exp && editable && (
        <tr className="border-b border-line/60 bg-ink/[0.015]">
          <td colSpan={5} className="px-4 py-2">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-2xs">
              <span className="text-faint">saldo <b className="text-ink monto">{money(c.saldo)}</b> · punitorio <b className="text-warn monto">{money(c.punitorios)}</b> ({c.tasa.toFixed(1)}%)</span>
              <label className="flex items-center gap-1.5 text-muted">🏷️ Estado
                <select value={c.estado ?? ""} onClick={stop} onChange={(e) => onGestion({ estado: e.target.value })} className="rounded-md border border-line bg-surface px-1.5 py-0.5 text-[11px] text-ink">
                  <option value="">Automático ({c.vencida ? "Vencida" : "Por vencer"})</option>
                  {ESTADOS_CC.map((e) => <option key={e} value={e}>{e}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-1.5 text-muted">💰 Promesa
                <input type="date" value={c.promesa ?? ""} onClick={stop} onChange={(e) => onGestion({ promesa: e.target.value })} className="rounded-md border border-line bg-surface px-1.5 py-0.5 text-[11px] text-ink" />
                {c.promesa && <button onClick={(e) => { stop(e); onGestion({ promesa: "" }); }} className="text-faint hover:text-ink">×</button>}
              </label>
              <label className="flex flex-1 items-center gap-1.5 text-muted">📝 Nota
                <input value={nota} onClick={stop} onChange={(e) => setNota(e.target.value)} onBlur={() => nota !== (c.obs ?? "") && onGestion({ nota })} placeholder="ej. quedó en pagar la semana que viene" className="min-w-0 flex-1 rounded-md border border-line bg-surface px-2 py-0.5 text-[11px] text-ink placeholder:text-faint" />
              </label>
              {c.manual && <button onClick={(e) => { stop(e); if (confirm("¿Borrar esta factura cargada a mano?")) onBorrar(); }} className="rounded-md border border-bad/30 px-2 py-0.5 text-[11px] font-medium text-bad hover:bg-bad/5">Borrar factura</button>}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// Alta de una factura A MANO (persiste aparte del estado de cuenta subido).
function FacturaFormModal({ empresas, onGuardar, onClose }: { empresas: string[]; onGuardar: (f: FacturaCC) => void; onClose: () => void }) {
  const [cliente, setCliente] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [empresa, setEmpresa] = useState(empresas[0] ?? "");
  const [local, setLocal] = useState("");
  const [detalle, setDetalle] = useState("CDP");
  const [nro, setNro] = useState("");
  const [venc, setVenc] = useState(hoyISO());
  const [importe, setImporte] = useState("");
  const [cobrado, setCobrado] = useState("");
  const impNum = Number(importe) || 0, cobNum = Number(cobrado) || 0;
  const valido = cliente.trim() !== "" && impNum > 0;
  function guardar() {
    if (!valido) return;
    const id = clienteId.trim() || `M${Date.now().toString().slice(-6)}`;
    const f: FacturaCC = {
      clienteId: id, cliente: cliente.trim(), vencimiento: venc, tipo: "FAC",
      nro: nro.trim() || `MAN-${Date.now()}`, importe: impNum, cobrado: cobNum,
      empresa: canonicalEmpresa(empresa), local: local.trim(), detalle: detalle.trim(),
      contacto: "", obs: "", mes: venc.slice(0, 7), manual: true,
    };
    onGuardar(f);
  }
  const inp = "w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-2xs text-ink placeholder:text-faint focus:border-action";
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-3 sm:p-8" onClick={onClose}>
      <div className="w-full max-w-md rounded-card border border-line bg-surface p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <p className="font-display text-sm font-semibold text-ink">Agregar factura a mano</p>
          <button onClick={onClose} className="text-2xs font-medium text-muted hover:text-ink">cerrar</button>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <label className="col-span-2 flex flex-col gap-0.5"><span className="text-[10px] uppercase tracking-wide text-faint">Franquiciado *</span><input value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Razón social / nombre" className={inp} /></label>
          <label className="flex flex-col gap-0.5"><span className="text-[10px] uppercase tracking-wide text-faint">N° cliente</span><input value={clienteId} onChange={(e) => setClienteId(e.target.value)} placeholder="opcional" className={inp} /></label>
          <label className="flex flex-col gap-0.5"><span className="text-[10px] uppercase tracking-wide text-faint">Empresa</span>
            <input list="fr-empresas" value={empresa} onChange={(e) => setEmpresa(e.target.value)} className={inp} />
            <datalist id="fr-empresas">{empresas.map((e) => <option key={e} value={e} />)}</datalist>
          </label>
          <label className="flex flex-col gap-0.5"><span className="text-[10px] uppercase tracking-wide text-faint">Local</span><input value={local} onChange={(e) => setLocal(e.target.value)} className={inp} /></label>
          <label className="flex flex-col gap-0.5"><span className="text-[10px] uppercase tracking-wide text-faint">Concepto</span><input value={detalle} onChange={(e) => setDetalle(e.target.value)} placeholder="CDP / REGALIAS…" className={inp} /></label>
          <label className="flex flex-col gap-0.5"><span className="text-[10px] uppercase tracking-wide text-faint">Comprobante</span><input value={nro} onChange={(e) => setNro(e.target.value)} placeholder="opcional" className={inp} /></label>
          <label className="flex flex-col gap-0.5"><span className="text-[10px] uppercase tracking-wide text-faint">Vencimiento</span><input type="date" value={venc} onChange={(e) => setVenc(e.target.value)} className={inp} /></label>
          <label className="flex flex-col gap-0.5"><span className="text-[10px] uppercase tracking-wide text-faint">Importe *</span><input type="number" value={importe} onChange={(e) => setImporte(e.target.value)} placeholder="0" className={inp} /></label>
          <label className="flex flex-col gap-0.5"><span className="text-[10px] uppercase tracking-wide text-faint">Cobrado</span><input type="number" value={cobrado} onChange={(e) => setCobrado(e.target.value)} placeholder="0" className={inp} /></label>
        </div>
        <p className="mt-2 text-2xs text-faint">Saldo: <b className="text-ink monto">{money(Math.max(0, impNum - cobNum))}</b> · la mora y el punitorio se calculan solos según el vencimiento.</p>
        <div className="mt-3 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md px-3 py-1.5 text-xs font-medium text-muted hover:bg-ink/5">Cancelar</button>
          <button onClick={guardar} disabled={!valido} className="rounded-md bg-ok px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40">Agregar factura</button>
        </div>
      </div>
    </div>
  );
}

function Tutorial() {
  const pasos = [
    { n: "1", t: "Exportá el estado de cuenta", d: <>Del sistema, exportá la <b>cuenta corriente de franquicias</b> a Excel o CSV (una fila por factura pendiente).</> },
    { n: "2", t: "Subilo acá", d: <>Tocá <b>«Subir estado de cuenta»</b>. La app detecta las columnas solas y te muestra cuáles reconoció.</> },
    { n: "3", t: "Controlá y mirá", d: <>Ajustás la tasa, la fecha de corte y qué contás (incobrables sí/no) — <b>todo recalcula solo</b>. Ves el aging, quién debe y podés exportar.</> },
  ];
  return (
    <Card className="p-5">
      <h2 className="font-display text-base font-semibold text-ink">Cómo empezar</h2>
      <p className="mt-0.5 text-sm text-muted">Todo el estado de cobranzas a franquicias en un lugar, recalculado a tu manera. En 3 pasos.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {pasos.map((p) => (
          <div key={p.n} className="rounded-lg border border-line bg-ink/[0.015] p-3">
            <div className="flex items-center gap-2"><span className="grid h-6 w-6 place-items-center rounded-full bg-action/15 font-display text-sm font-bold text-action">{p.n}</span><span className="font-medium text-ink">{p.t}</span></div>
            <p className="mt-1.5 text-2xs leading-relaxed text-muted">{p.d}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
