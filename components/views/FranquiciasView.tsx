"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Card } from "@/components/ui/primitives";
import { descargarCSV } from "@/lib/exportar-csv";
import {
  parseFranquiciasCSV, parseFranquiciasMatriz, resumir, costear, gestionado, gestionKey, claveFranq, canonicalEmpresa, canonicalLocal, ESTADOS_CC, ESTADOS_FRANQ, PARAMS_DEFAULT,
  maestro, morosidad, moraGlobal, cobranzaCalendario, cobroPorLocal, resumirRaven,
  type FacturaCC, type ParamsCC, type ResumenCC, type ResultadoParse, type Gestion, type ClienteCC, type CobroCC,
  type MaestroCliente, type MorosidadFila, type MoraPor, type Granularidad, type NivelMora, type RavenFranq,
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

type Tab = "franquiciado" | "empresa" | "local" | "detalle" | "gestion" | "cobros" | "cobrolocal" | "maestro" | "cobranza" | "morosidad" | "raven";
type DimKey = "cliente" | "empresa" | "local" | "detalle" | "contacto";
// Los primeros 5 son desgloses de la misma tabla; los últimos son herramientas
// (panels propios). El divisor visual arranca en "cobros".
const TABS: [Tab, string][] = [["franquiciado", "Por franquiciado"], ["empresa", "Por empresa"], ["local", "Por local"], ["detalle", "Por concepto"], ["gestion", "Por gestión"], ["cobros", "Cobros"], ["cobrolocal", "Cobro x local"], ["maestro", "Maestro"], ["cobranza", "Cobranza"], ["morosidad", "Morosidad"], ["raven", "Raven (CDP)"]];
const TABS_ESPECIALES = new Set<Tab>(["cobros", "cobrolocal", "maestro", "cobranza", "morosidad", "raven"]);

export default function FranquiciasView() {
  const [facturas, setFacturas] = useState<FacturaCC[]>([]);
  const [clientes, setClientes] = useState<Record<string, ClienteCC>>({});
  const [cobros, setCobros] = useState<CobroCC[]>([]);
  const [cobrosHist, setCobrosHist] = useState<CobroCC[]>([]);
  const [raven, setRaven] = useState<{ franqs: RavenFranq[]; meta: { cuando?: string; desde?: string; hasta?: string; nComprob?: number } }>({ franqs: [], meta: {} });
  const [params, setParams] = useState<ParamsCC>({ ...PARAMS_DEFAULT, fechaCorte: hoyISO() });
  const [meta, setMeta] = useState<{ actualizado?: string; fuente?: "live" | "upload" } | null>(null);
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
        setClientes(j.clientes ?? {});
        setCobros(j.cobros ?? []);
        setCobrosHist(j.cobrosHist ?? []);
        setRaven(j.raven ?? { franqs: [], meta: {} });
        setParams((prev) => ({ ...PARAMS_DEFAULT, ...j.params, fechaCorte: j.params?.fechaCorte || prev.fechaCorte || hoyISO() }));
        setMeta(j.meta ?? null);
      }
    } catch { /* vacío */ } finally { setEstado("idle"); }
  }
  useEffect(() => { cargar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const hayDatos = facturas.length > 0;
  const costeadas = useMemo(() => facturas.map((f) => costear(f, params)), [facturas, params]);
  // Cobros para "Cobro x local" = histórico (ya aplicado en el snapshot) + nuevos.
  const cobrosTodos = useMemo(() => [...cobrosHist, ...cobros].map((c) => ({ local: c.local, importe: c.importe, fecha: c.fecha })), [cobrosHist, cobros]);
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

  // Sube el export fiscal de Raven ("mis-comprobantes"): lo parsea en el navegador,
  // lo resume por CUIT y lo guarda APARTE de la cta cte. Fuente = Raven, no Tango.
  async function subirRaven(files: FileList | null) {
    const f = files?.[0]; if (!f) return;
    setError(""); setEstado("saving"); setProgreso(`Leyendo ${f.name}…`);
    try {
      const wb = XLSX.read(new Uint8Array(await f.arrayBuffer()), { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const objs = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { raw: false, defval: "" });
      const franqs = resumirRaven(objs);
      if (!franqs.length) throw new Error("no encontré comprobantes con CUIT en el archivo");
      const fechas = objs.map((o) => String(o["Fecha"] ?? "").slice(0, 10)).filter(Boolean).sort();
      const r = await (await fetch("/api/franquicias", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ravenBulk: franqs, ravenMeta: { desde: fechas[0] ?? "", hasta: fechas[fechas.length - 1] ?? "", nComprob: objs.length } }) })).json();
      if (!r.ok) throw new Error(r.error);
      setInfo(`Raven cargado: ${int(objs.length)} comprobantes de ${franqs.length} franquiciados (por CUIT).`);
      await cargar();
    } catch (e) { setError(e instanceof Error ? e.message : "no se pudo leer el archivo de Raven"); }
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
    if (!resumenTabla || TABS_ESPECIALES.has(tab)) return [];
    const base = tab === "franquiciado" ? resumenTabla.porFranquiciado : tab === "empresa" ? resumenTabla.porEmpresa
      : tab === "local" ? resumenTabla.porLocal : tab === "detalle" ? resumenTabla.porDetalle : resumenTabla.porContacto;
    const t = normTxt(q.trim());
    const filt = t ? base.filter((g) => normTxt(((g as any).nombre ?? g.k) + " " + ((g as any).clienteId ?? "")).includes(t)) : base;
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
      ? { ...f, ...(patch.contacto !== undefined ? { contacto: patch.contacto } : {}), ...(patch.promesa !== undefined ? { promesa: patch.promesa } : {}), ...(patch.nota !== undefined ? { obs: patch.nota } : {}), ...(patch.estado !== undefined ? { estado: patch.estado } : {}), ...(patch.bloqueo !== undefined ? { bloqueo: patch.bloqueo } : {}) }
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
  // Datos a nivel franquiciado (estado, contacto, nota) — keyed por clave estable.
  async function updateCliente(clave: string, patch: Partial<ClienteCC>) {
    setClientes((prev) => {
      const n = { ...prev };
      const merged: ClienteCC = { ...(n[clave] ?? {}), ...patch };
      (Object.keys(merged) as (keyof ClienteCC)[]).forEach((k) => { if (!merged[k]) delete merged[k]; });
      if (Object.keys(merged).length) n[clave] = merged; else delete n[clave];
      return n;
    });
    try { await fetch("/api/franquicias", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ clienteEstado: { clienteId: clave, ...patch } }) }); } catch { /* */ }
  }
  // Registro de cobros: baja el saldo de una factura sin re-subir el estado de cuenta.
  async function registrarCobro(f: FacturaCC, importe: number, fecha: string) {
    const cobro = { nroFactura: f.nro, importe, fecha, cliente: f.cliente, local: f.local, empresa: f.empresa };
    try {
      const r = await (await fetch("/api/franquicias", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cobroNuevo: cobro }) })).json();
      if (!r.ok) throw new Error(r.error);
      await cargar();
    } catch (e) { setError(e instanceof Error ? e.message : "no se pudo registrar el cobro"); }
  }
  async function borrarCobro(id: string) {
    setCobros((prev) => prev.filter((c) => c.id !== id));
    try { await fetch("/api/franquicias", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ borrarCobro: id }) }); await cargar(); } catch { /* */ }
  }
  function filaOnClick(g: any) {
    if (tab === "franquiciado") abrirDetalle("cliente", g.clave ?? g.k, `${g.clienteId ? "#" + g.clienteId + " · " : ""}${g.nombre ?? g.k}`);
    else if (tab === "empresa") abrirDetalle("empresa", g.k, `Empresa: ${g.k}`);
    else if (tab === "local") abrirDetalle("local", g.k, `Local: ${g.k}`);
    else if (tab === "detalle") abrirDetalle("detalle", g.k, `Concepto: ${g.k}`);
    else abrirDetalle("contacto", g.k, `Gestión: ${g.k}`);
  }

  function exportar() {
    if (!resumen) return;
    const cs = facturas.map((f) => costear(f, params)).sort((a, b) => b.neto - a.neto);
    descargarCSV("franquicias-cuenta-corriente.csv",
      ["cliente_id", "franquiciado", "empresa", "local", "concepto", "tipo", "comprobante", "emision", "vencimiento", "dias_mora", "importe", "cobrado", "saldo", "tasa_%", "punitorios", "neto", "estado", "contacto", "bloqueo", "promesa", "nota"],
      cs.map((c) => [c.clienteId, c.cliente, c.empresa, c.local, c.detalle, c.tipo, c.nro, c.emision ? fechaLabel(c.emision) : "", fechaLabel(c.vencimiento), c.diasMora, Math.round(c.importe), Math.round(c.cobrado), Math.round(c.saldo), c.tasa.toFixed(2), Math.round(c.punitorios), Math.round(c.neto), c.estado || (c.vencida ? "Vencida" : "Por vencer"), c.contacto, c.bloqueo || "", c.promesa ? fechaLabel(c.promesa) : "", c.obs ?? ""]));
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
          {meta?.fuente === "live" && <span className="inline-flex items-center gap-1 rounded-full border border-ok/30 bg-ok/5 px-2 py-0.5 text-2xs font-medium text-ok" title="La cuenta corriente se lee en vivo desde Tango (no hace falta subir el Excel)"><span className="h-1.5 w-1.5 rounded-full bg-ok" />en vivo · Tango</span>}
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
            <Kpi label="Neto a cobrar" value={moneyC(resumen.totalNeto)} full={money(resumen.totalNeto)} tone="ink" sub={`${int(resumen.nFacturas)} facturas`} big hint="TODA la deuda con punitorios, incluidos incobrables y deuda por toma de local. Es el total bruto." />
            <Kpi label="Cobrable real" value={moneyC(resumen.cobrable)} full={money(resumen.cobrable)} tone="ok" sub={params.incluirIncobrables ? "incluye incobrables · sin toma local" : "sin incobrables ni toma local"} hint="La plata que Cobranzas realmente persigue: saca los INCOBRABLES y la DEUDA TOMA LOCAL (igual que el Excel). Cobrable = Vencido + Por vencer." />
            <Kpi label="Vencido" value={moneyC(resumen.vencido)} full={money(resumen.vencido)} tone="bad" sub={`${int(resumen.nVencidas)} fc vencidas`} hint="Del cobrable, lo que ya pasó su fecha de vencimiento. Hay que cobrarlo ya." />
            <Kpi label="Por vencer" value={moneyC(resumen.porVencer)} full={money(resumen.porVencer)} tone="muted" sub="al día" hint="Del cobrable, lo que todavía no venció." />
          </div>
          <p className="-mt-1 px-1 text-2xs text-faint">
            <b className="text-muted">Neto a cobrar</b> = toda la deuda. <b className="text-ok">Cobrable real</b> = lo que se persigue de verdad (sin «incobrables» {money(resumen.incobrable)} ni «deuda toma local» {money(resumen.tomaLocal)}). Pasá el mouse por cada número (ⓘ) para ver qué incluye.
          </p>

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
                • <b>Cobrable real</b> = neto {params.incluirIncobrables ? "incluyendo" : "excluyendo"} los «INCOBRABLES» ({money(resumen.incobrable)}) y siempre sin la «DEUDA TOMA LOCAL» ({money(resumen.tomaLocal)}) — igual que el Excel. <b>Vencido + Por vencer = Cobrable real.</b>
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
              <p className="text-2xs text-faint">cobrable por tramo de mora</p>
            </div>
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-ink/5">
              {resumen.aging.filter((a) => a.neto > 0).map((a) => (
                <div key={a.bucket} className={BUCKET_TONE[a.bucket]} style={{ width: `${(a.neto / Math.max(1, resumen.cobrable)) * 100}%` }} title={`${a.bucket}: ${money(a.neto)}`} />
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
            <div data-tour="fr-tabs" className="flex flex-wrap items-center gap-1 border-b border-line px-3 py-2">
              {TABS.map(([k, l]) => (
                <span key={k} className="flex items-center gap-1">
                  {k === "cobros" && <span className="mx-1 hidden h-4 w-px bg-line sm:block" title="Herramientas" />}
                  <button onClick={() => setTab(k)} className={`rounded-md px-2.5 py-1 text-2xs font-medium ${tab === k ? "bg-ink/[0.06] text-ink" : "text-muted hover:bg-ink/[0.03]"}`}>{l}</button>
                </span>
              ))}
            </div>
            {tab === "cobros" ? (
              <CobrosPanel cobros={cobros} cobrosHist={cobrosHist} onBorrar={borrarCobro} />
            ) : tab === "cobrolocal" ? (
              <CobroLocalPanel facturas={facturas} params={params} cobros={cobrosTodos} />
            ) : tab === "maestro" ? (
              <MaestroPanel facturas={facturas} params={params} clientes={clientes} onCliente={updateCliente} raven={raven.franqs} />
            ) : tab === "cobranza" ? (
              <CobranzaPanel facturas={facturas} params={params} />
            ) : tab === "morosidad" ? (
              <MorosidadPanel facturas={facturas} params={params} onVer={(clave, nombre) => setDetalle({ titulo: nombre, dimKey: "cliente", val: clave })} />
            ) : tab === "raven" ? (
              <RavenPanel raven={raven} clientes={clientes} onSubir={subirRaven} cargando={cargando} />
            ) : (
            <>
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
                  {tab === "franquiciado" && <th className="px-3 py-2 font-medium">Estado</th>}
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
                      <td className="px-4 py-2"><span className="font-medium text-ink">{g.nombre ?? g.k}</span>{g.clienteId && <span className="ml-2 font-mono text-2xs text-faint">#{g.clienteId}</span>}<span className="ml-1.5 text-2xs text-faint">›</span></td>
                      <td className="px-3 py-2 text-right font-mono tnum text-2xs text-muted">{g.maxMora > 0 ? `${g.maxMora}d` : "—"}</td>
                      {tab === "franquiciado" && <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}><EstadoFranqCell g={g} estado={clientes[g.clave]?.estado} onChange={(v) => updateCliente(g.clave, { estado: v })} /></td>}
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
            </>
            )}
          </Card>
        </>
      )}

      {detalle && <DetalleModal titulo={detalle.titulo} facturas={facturas} dimKey={detalle.dimKey} val={detalle.val} params={params} cliente={detalle.dimKey === "cliente" ? (clientes[detalle.val] ?? {}) : undefined} onCliente={(patch) => updateCliente(detalle.val, patch)} onGestion={updateGestion} onCobro={registrarCobro} onBorrarManual={borrarManual} onClose={() => setDetalle(null)} />}
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
// Estado del franquiciado: una etiqueta MANUAL de situación (Al día / Moroso / En
// reclamo…); si no se puso, muestra el estado DERIVADO (a gestionar / gestionado / al día).
function EstadoFranqCell({ g, estado, onChange }: { g: { netoSinGestion: number; vencido: number }; estado?: string; onChange: (v: string) => void }) {
  const derivado = g.netoSinGestion > 0 ? "a gestionar" : g.vencido > 0 ? "gestionado" : "al día";
  const malo = /moroso|reclamo|incobrable/i.test(estado || "");
  const bueno = /al d[ií]a|plan de pago/i.test(estado || "");
  const cls = estado ? (malo ? "border-bad/40 bg-bad/5 text-bad" : bueno ? "border-ok/40 bg-ok/5 text-ok" : "border-action/40 bg-action/5 text-action")
    : (g.netoSinGestion > 0 ? "border-bad/30 bg-bad/[0.03] text-bad" : "border-line bg-surface text-muted");
  return (
    <select value={estado || ""} onChange={(e) => onChange(e.target.value)} title="Estado del franquiciado" className={`rounded-md border px-1.5 py-0.5 text-[11px] ${cls}`}>
      <option value="">— {derivado}</option>
      {ESTADOS_FRANQ.map((s) => <option key={s} value={s}>{s}</option>)}
    </select>
  );
}
function NumIn({ v, step, onChange }: { v: number; step: number; onChange: (n: number) => void }) {
  return <input type="number" step={step} value={v} onChange={(e) => onChange(Number(e.target.value) || 0)} className="w-20 rounded-md border border-line bg-surface px-2 py-1 text-2xs text-ink" />;
}
function Kpi({ label, value, sub, tone, full, big, hint }: { label: string; value: string; sub?: string; tone: "ink" | "ok" | "bad" | "muted"; full?: string; big?: boolean; hint?: string }) {
  const c = tone === "ok" ? "text-ok" : tone === "bad" ? "text-bad" : tone === "muted" ? "text-muted" : "text-ink";
  return (
    <Card className="group p-3">
      <p className="flex items-center gap-1 text-2xs uppercase tracking-wide text-faint" title={hint}>{label}{hint && <span className="cursor-help text-faint/70">ⓘ</span>}</p>
      <p className={`mt-0.5 font-display font-semibold leading-tight tnum ${big ? "text-xl sm:text-3xl" : "text-base sm:text-2xl"} ${c}`}>
        <span className="monto"><span className="group-hover:hidden">{value}</span>{full && <span className="hidden whitespace-nowrap text-[0.7em] group-hover:inline">{full}</span>}</span>
      </p>
      {sub && <p className="text-2xs text-faint">{sub}</p>}
    </Card>
  );
}

// Cartel de ayuda in-situ: explica en criollo lo que puede confundir. tone=info (azul)
// para aclaraciones, warn (ámbar) para "ojo con esto".
function InfoNota({ children, tone = "info" }: { children: React.ReactNode; tone?: "info" | "warn" }) {
  return (
    <div className={`flex items-start gap-2 border-b border-line px-4 py-2 text-2xs leading-relaxed ${tone === "warn" ? "bg-warn/5" : "bg-action/[0.045]"}`}>
      <span className="mt-px shrink-0" aria-hidden>{tone === "warn" ? "⚠️" : "ℹ️"}</span>
      <p className="text-muted">{children}</p>
    </div>
  );
}

const CONTACTOS = ["", "Contactado", "Contactado sin respuesta", "Sin contacto"];
// Detalle de un corte: facturas línea por línea, con GESTIÓN de cobranza EDITABLE
// (contacto, promesa de pago, nota) que persiste y sobrevive a re-subir el archivo.
function DetalleModal({ titulo, facturas, dimKey, val, params, cliente, onCliente, onGestion, onCobro, onBorrarManual, onClose }: { titulo: string; facturas: FacturaCC[]; dimKey: DimKey; val: string; params: ParamsCC; cliente?: ClienteCC; onCliente?: (patch: Partial<ClienteCC>) => void; onGestion: (key: string, patch: Gestion) => void; onCobro: (f: FacturaCC, importe: number, fecha: string) => void; onBorrarManual: (key: string) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [abierto, setAbierto] = useState<string | null>(null); // key de la fila expandida
  const esFranq = dimKey === "cliente" && !!onCliente;
  const propio = (f: FacturaCC) => (dimKey === "cliente" ? claveFranq(f.cliente) : dimKey === "empresa" ? f.empresa : dimKey === "local" ? canonicalLocal(f.local) : dimKey === "detalle" ? f.detalle : f.contacto);
  const cs = useMemo(() => facturas.filter((f) => propio(f) === val).map((f) => costear(f, params)).sort((a, b) => b.neto - a.neto), [facturas, val, params]); // eslint-disable-line react-hooks/exhaustive-deps
  const vis = useMemo(() => { const t = normTxt(q.trim()); return t ? cs.filter((c) => normTxt(c.detalle + " " + c.nro + " " + (c.obs ?? "")).includes(t)) : cs; }, [cs, q]);
  const tot = cs.reduce((s, c) => ({ neto: s.neto + c.neto, saldo: s.saldo + c.saldo, pun: s.pun + c.punitorios }), { neto: 0, saldo: 0, pun: 0 });
  const conPromesa = cs.filter((c) => c.promesa).length;
  const promesasVenc = cs.filter((c) => c.promesa && c.promesa < params.fechaCorte && c.saldo > 1).length;
  const tel = (cliente?.telefono ?? "").replace(/[^0-9]/g, "");
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
        {esFranq ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-ink/[0.015] px-4 py-2.5 text-2xs">
            <label className="flex items-center gap-1.5 text-muted">Estado
              <select value={cliente?.estado ?? ""} onChange={(e) => onCliente!({ estado: e.target.value })} className="rounded-md border border-line bg-surface px-1.5 py-0.5 text-[11px] text-ink">
                <option value="">— sin poner</option>
                {ESTADOS_FRANQ.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-muted">📞 Tel
              <input value={cliente?.telefono ?? ""} onChange={(e) => onCliente!({ telefono: e.target.value })} placeholder="+54 9 11…" className="w-32 rounded-md border border-line bg-surface px-1.5 py-0.5 text-[11px] text-ink placeholder:text-faint" />
            </label>
            <label className="flex items-center gap-1.5 text-muted">✉️ Mail
              <input value={cliente?.email ?? ""} onChange={(e) => onCliente!({ email: e.target.value })} placeholder="mail@…" className="w-40 rounded-md border border-line bg-surface px-1.5 py-0.5 text-[11px] text-ink placeholder:text-faint" />
            </label>
            {tel && <a href={`https://wa.me/${tel}`} target="_blank" rel="noreferrer" className="rounded-md bg-ok/10 px-2 py-0.5 text-[11px] font-medium text-ok hover:bg-ok/20">WhatsApp</a>}
            {cliente?.email && <a href={`mailto:${cliente.email}`} className="rounded-md bg-action/10 px-2 py-0.5 text-[11px] font-medium text-action hover:bg-action/20">Email</a>}
            {conPromesa > 0 && <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${promesasVenc > 0 ? "bg-bad/10 text-bad" : "bg-action/10 text-action"}`}>💰 {conPromesa} promesa{conPromesa === 1 ? "" : "s"}{promesasVenc > 0 ? ` · ${promesasVenc} vencida${promesasVenc === 1 ? "" : "s"}` : ""}</span>}
            <span className="ml-auto text-faint">la gestión se guarda sola y sobrevive a re-subir el archivo</span>
          </div>
        ) : (
          <div className="border-b border-line px-4 py-2 text-2xs text-faint">Editá la <b className="text-muted">gestión de cobranza</b> acá — se guarda solo y <b className="text-muted">no se pierde</b> cuando volvés a subir el estado de cuenta.</div>
        )}
        <div className="max-h-[60vh] overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-surface"><tr className="border-b border-line text-2xs uppercase tracking-wide text-faint">
              <th className="px-4 py-2 font-medium">Emisión</th><th className="px-3 py-2 font-medium">Vence</th><th className="px-3 py-2 font-medium">Concepto</th>
              <th className="px-3 py-2 text-right font-medium">Mora</th><th className="px-3 py-2 text-right font-medium">Neto</th>
              <th className="px-3 py-2 font-medium">Contacto</th>
              <th className="px-3 py-2 font-medium">Bloqueos</th>
            </tr></thead>
            <tbody>
              {vis.map((c) => {
                const k = gestionKey(c); const exp = abierto === k;
                return (
                <FilaFactura key={k || c.nro} c={c} corte={params.fechaCorte} exp={exp} onToggle={() => setAbierto(exp ? null : k)} onGestion={(patch) => onGestion(k, patch)} onCobro={(imp, fecha) => onCobro(c, imp, fecha)} onBorrar={() => onBorrarManual(k)} editable={!!k} />
              ); })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function FilaFactura({ c, corte, exp, onToggle, onGestion, onCobro, onBorrar, editable }: { c: ReturnType<typeof costear>; corte: string; exp: boolean; onToggle: () => void; onGestion: (patch: Gestion) => void; onCobro: (importe: number, fecha: string) => void; onBorrar: () => void; editable: boolean }) {
  const [nota, setNota] = useState(c.obs ?? "");
  const [cobImp, setCobImp] = useState("");
  const [cobFecha, setCobFecha] = useState(hoyISO());
  const cobNum = Number(cobImp) || 0;
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  function registrar(e: React.MouseEvent) {
    stop(e);
    if (cobNum <= 0) return;
    onCobro(cobNum, cobFecha);
    setCobImp("");
  }
  return (
    <>
      <tr onClick={onToggle} className={`cursor-pointer border-b border-line/60 hover:bg-ink/[0.02] ${c.cobradaManual ? "opacity-60" : ""}`}>
        <td className="whitespace-nowrap px-4 py-1.5 font-mono text-2xs text-faint" title={c.emision ? "Fecha de emisión" : "La fecha de emisión llega cuando se conecte Tango/Raven"}>{c.emision ? fechaLabel(c.emision) : "—"}</td>
        <td className="whitespace-nowrap px-3 py-1.5 font-mono text-2xs text-muted">{fechaLabel(c.vencimiento)}</td>
        <td className="px-3 py-1.5 text-2xs text-ink">{c.detalle || "—"}
          {c.manual && <span className="ml-1.5 rounded bg-action/10 px-1 py-px text-[10px] font-medium text-action">manual</span>}
          {c.estado && <span className={`ml-1.5 rounded px-1 py-px text-[10px] font-medium ${c.cobradaManual ? "bg-ok/10 text-ok" : c.incobrable ? "bg-bad/10 text-bad" : "bg-ink/[0.06] text-muted"}`}>{c.estado}</span>}
          {!c.estado && c.incobrable && <span className="ml-1.5 rounded bg-bad/10 px-1 py-px text-[10px] font-medium text-bad">incobrable</span>}
          <span className="ml-1.5 font-mono text-[10px] text-faint">{c.nro}</span></td>
        <td className="px-3 py-1.5 text-right font-mono text-2xs text-muted" title={c.diasMora > 0 ? `${c.diasMora} días de mora` : c.diasMoraRaw < 0 ? `faltan ${-c.diasMoraRaw} días para vencer` : "vence hoy"}>{c.diasMora > 0 ? `${c.diasMora}d` : c.diasMoraRaw < 0 ? <span className="text-faint">en {-c.diasMoraRaw}d</span> : "hoy"}</td>
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
          {c.promesa && (c.promesa < corte && c.saldo > 1
            ? <span className="ml-1.5 rounded bg-bad/10 px-1 py-px text-[10px] font-medium text-bad" title="La promesa de pago venció y no se cobró">💰 venció {fechaLabel(c.promesa)}</span>
            : <span className="ml-1.5 rounded bg-action/10 px-1 py-px text-[10px] text-action">💰 {fechaLabel(c.promesa)}</span>)}
        </td>
        <td className="px-3 py-1.5">
          {editable ? (
            <select value={c.bloqueo === "SI" ? "SI" : c.bloqueo === "NO" ? "NO" : ""} onClick={stop} onChange={(e) => onGestion({ bloqueo: e.target.value })} className={`rounded-md border px-1.5 py-0.5 text-[11px] ${c.bloqueo === "SI" ? "border-bad/40 bg-bad/5 font-medium text-bad" : c.bloqueo === "NO" ? "border-ok/40 bg-ok/5 text-ok" : "border-line bg-surface text-muted"}`}>
              <option value="">—</option>
              <option value="SI">Sí</option>
              <option value="NO">No</option>
            </select>
          ) : <span className="text-2xs text-faint">—</span>}
        </td>
      </tr>
      {exp && editable && (
        <tr className="border-b border-line/60 bg-ink/[0.015]">
          <td colSpan={7} className="px-4 py-2">
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
            {c.saldo > 1 && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-line/60 pt-2 text-2xs">
                <span className="font-medium text-ok">＋ Registrar cobro</span>
                <input type="number" value={cobImp} onClick={stop} onChange={(e) => setCobImp(e.target.value)} placeholder="importe" className="w-28 rounded-md border border-line bg-surface px-2 py-0.5 text-[11px] text-ink placeholder:text-faint" />
                <button type="button" onClick={(e) => { stop(e); setCobImp(String(Math.round(c.saldo))); }} className="text-[10px] text-action hover:underline">todo el saldo ({money(c.saldo)})</button>
                <input type="date" value={cobFecha} onClick={stop} onChange={(e) => setCobFecha(e.target.value)} className="rounded-md border border-line bg-surface px-1.5 py-0.5 text-[11px] text-ink" />
                <button onClick={registrar} disabled={cobNum <= 0} className="rounded-md bg-ok px-2.5 py-0.5 text-[11px] font-semibold text-white hover:opacity-90 disabled:opacity-40">Registrar</button>
                {cobNum > 0 && <span className="text-faint">nuevo saldo <b className="text-ink monto">{money(Math.max(0, c.saldo - cobNum))}</b></span>}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

// ── Maestro de clientes: ficha por franquiciado (código/CUIT/locales/empresas/contacto) ──
function MaestroPanel({ facturas, params, clientes, onCliente, raven }: { facturas: FacturaCC[]; params: ParamsCC; clientes: Record<string, ClienteCC>; onCliente: (clave: string, patch: Partial<ClienteCC>) => void; raven: RavenFranq[] }) {
  const [q, setQ] = useState("");
  const filas = useMemo(() => maestro(facturas, params), [facturas, params]);
  // Nombre de local de Raven por CUIT (para comparar contra el nombre de Tango).
  const localRavenPorCuit = useMemo(() => { const m = new Map<string, string>(); for (const r of raven) if (r.cuit && r.localRaven) m.set(r.cuit.replace(/\D/g, ""), r.localRaven); return m; }, [raven]);
  const vis = useMemo(() => { const t = normTxt(q.trim()); return t ? filas.filter((f) => normTxt(f.nombre + " " + f.codigo + " " + f.locales.join(" ") + " " + (clientes[f.clave]?.cuit ?? "")).includes(t)) : filas; }, [filas, q, clientes]);
  function exportar() {
    descargarCSV("maestro-franquiciados.csv",
      ["Código", "CUIT", "Franquiciado", "Empresas", "Locales", "Teléfono", "Email", "Estado", "Facturas", "Saldo"],
      vis.map((f) => { const c = clientes[f.clave] ?? {}; return [f.codigo, c.cuit ?? "", f.nombre, f.empresas.join(" / "), f.locales.join(" / "), c.telefono ?? "", c.email ?? "", c.estado ?? "", String(f.nFacturas), String(Math.round(f.saldo))]; }));
  }
  const inp = "w-full rounded border border-line bg-surface px-1.5 py-0.5 text-[11px] text-ink placeholder:text-faint focus:border-action";
  return (
    <>
      <InfoNota>
        La ficha de cada franquiciado. <b>CUIT, teléfono y email se editan acá</b> (tocá el campo, escribí y hacé clic afuera — se guarda solo). El código, los locales y las empresas salen de las facturas.
      </InfoNota>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-ink/[0.015] px-4 py-2 text-2xs">
        <span className="text-muted"><b className="text-ink">{filas.length}</b> franquiciados · ficha maestra</span>
        <div className="flex items-center gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar franquiciado, CUIT, local…" className="w-56 rounded-md border border-line bg-surface px-2 py-1 text-2xs text-ink placeholder:text-faint" />
          <button onClick={exportar} className="rounded-md border border-line px-2 py-0.5 text-[11px] font-medium text-muted hover:bg-ink/5">Exportar CSV</button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead><tr className="border-b border-line text-[10px] uppercase tracking-wide text-faint">
            <th className="px-4 py-1.5 font-medium">Código</th>
            <th className="px-3 py-1.5 font-medium">Franquiciado</th>
            <th className="px-3 py-1.5 font-medium">CUIT</th>
            <th className="px-3 py-1.5 font-medium">Empresa · Local</th>
            <th className="px-3 py-1.5 font-medium">Teléfono</th>
            <th className="px-3 py-1.5 font-medium">Email</th>
            <th className="px-3 py-1.5 text-right font-medium">Saldo</th>
          </tr></thead>
          <tbody>
            {vis.map((f) => { const c = clientes[f.clave] ?? {}; return (
              <tr key={f.clave} className="border-b border-line/60 align-top hover:bg-ink/[0.02]">
                <td className="whitespace-nowrap px-4 py-1.5 font-mono text-2xs text-muted">{f.codigo || "—"}</td>
                <td className="px-3 py-1.5 text-2xs font-medium text-ink">{f.nombre}<div className="text-[10px] font-normal text-faint">{f.nFacturas} fc</div></td>
                <td className="px-3 py-1.5"><input defaultValue={c.cuit ?? ""} onBlur={(e) => e.target.value !== (c.cuit ?? "") && onCliente(f.clave, { cuit: e.target.value.trim() })} placeholder="CUIT" className={`${inp} w-32 font-mono`} /></td>
                <td className="px-3 py-1.5 text-2xs text-muted">{f.empresas.join(" / ") || "—"}<div className="text-[10px] text-faint">{f.locales.join(" · ") || "—"}</div>
                  {(() => { const lr = localRavenPorCuit.get((c.cuit ?? "").replace(/\D/g, "")); return lr ? <div className="text-[10px] text-action" title="Nombre del local según Raven">Raven: {lr}</div> : null; })()}</td>
                <td className="px-3 py-1.5"><input defaultValue={c.telefono ?? ""} onBlur={(e) => e.target.value !== (c.telefono ?? "") && onCliente(f.clave, { telefono: e.target.value.trim() })} placeholder="Teléfono" className={`${inp} w-28`} /></td>
                <td className="px-3 py-1.5"><input defaultValue={c.email ?? ""} onBlur={(e) => e.target.value !== (c.email ?? "") && onCliente(f.clave, { email: e.target.value.trim() })} placeholder="Email" className={`${inp} w-40`} /></td>
                <td className="whitespace-nowrap px-3 py-1.5 text-right font-mono tnum text-2xs font-medium text-ink monto">{money(f.saldo)}</td>
              </tr>
            ); })}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ── Cobranza semanal: proyección de cuánto entra por semana (según venc./promesas) ──
const CAL_ESTADO_TONO: Record<string, string> = { "Cobrada": "bg-ink/[0.04] text-faint", "En curso": "bg-ok/10 text-ok", "Próxima": "bg-action/5 text-action" };
function CobranzaPanel({ facturas, params }: { facturas: FacturaCC[]; params: ParamsCC }) {
  const [gran, setGran] = useState<Granularidad>("semana");
  const cal = useMemo(() => cobranzaCalendario(facturas, params, gran), [facturas, params, gran]);
  const max = Math.max(1, ...cal.buckets.map((b) => b.total));
  const rango = (b: typeof cal.buckets[number]) => gran === "semana" ? `${fechaLabel(b.desde)} – ${fechaLabel(b.hasta)}` : fechaLabel(b.desde);
  const emps = cal.empresas;
  return (
    <>
      <InfoNota>
        Cuánta plata vence por {gran === "semana" ? "semana" : "día"}, abierta por empresa. Estados: <b className="text-faint">Cobrada</b> = ya pasó esa fecha · <b className="text-ok">En curso</b> = es {gran === "semana" ? "la semana" : "el día"} de hoy · <b className="text-action">Próxima</b> = todavía no llegó. Se ordena por fecha de <b>vencimiento</b> (excluye incobrables y deuda toma local).
      </InfoNota>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-ink/[0.015] px-4 py-2 text-2xs">
        <span className="text-muted">Al corte <b className="text-ink">{fechaLabel(cal.corte)}</b></span>
        <div className="flex overflow-hidden rounded-md border border-line text-[11px]">
          {(["semana", "dia"] as Granularidad[]).map((g) => <button key={g} onClick={() => setGran(g)} className={`px-2 py-0.5 font-medium ${gran === g ? "bg-ink/[0.06] text-ink" : "text-muted hover:bg-ink/[0.03]"}`}>{g === "semana" ? "Semanal" : "Diaria"}</button>)}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead><tr className="border-b border-line text-[10px] uppercase tracking-wide text-faint">
            <th className="px-4 py-1.5 font-medium">{gran === "semana" ? "Semana" : "Fecha"} (vencimiento)</th>
            <th className="px-3 py-1.5 font-medium">Estado</th>
            {emps.map((e) => <th key={e} className="px-3 py-1.5 text-right font-medium">{e}</th>)}
            <th className="px-3 py-1.5 text-right font-medium">Total</th>
            <th className="w-32 px-3 py-1.5"></th>
          </tr></thead>
          <tbody>
            {cal.buckets.map((b) => (
              <tr key={b.clave} className={`border-b border-line/60 ${b.estado === "En curso" ? "bg-ok/[0.03]" : ""}`}>
                <td className="whitespace-nowrap px-4 py-1.5 font-mono text-2xs text-ink">{rango(b)}</td>
                <td className="px-3 py-1.5"><span className={`rounded px-1.5 py-px text-[10px] font-medium ${CAL_ESTADO_TONO[b.estado]}`}>{b.estado}</span></td>
                {emps.map((e) => <td key={e} className="px-3 py-1.5 text-right font-mono tnum text-2xs text-muted monto">{b.porEmpresa[e] ? money(b.porEmpresa[e]) : "—"}</td>)}
                <td className="px-3 py-1.5 text-right font-mono tnum text-2xs font-medium text-ink monto">{money(b.total)}</td>
                <td className="px-3 py-1.5"><div className="h-2.5 overflow-hidden rounded bg-ink/[0.04]"><div className={`h-full rounded ${b.estado === "En curso" ? "bg-ok/70" : b.estado === "Próxima" ? "bg-action/50" : "bg-ink/25"}`} style={{ width: `${Math.max(3, (b.total / max) * 100)}%` }} /></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex justify-between border-t border-line px-4 py-2 text-2xs">
        <span className="text-muted">Total cobrable (por vencimiento)</span>
        <span className="font-mono tnum font-semibold text-ink monto">{money(cal.total)}</span>
      </div>
    </>
  );
}

// ── Cobro por Local (hoja "Cobro por Local"): deuda + cobros por local ──
function CobroLocalPanel({ facturas, params, cobros }: { facturas: FacturaCC[]; params: ParamsCC; cobros: { local?: string; importe: number; fecha?: string }[] }) {
  const [q, setQ] = useState("");
  const filas = useMemo(() => cobroPorLocal(facturas, params, cobros), [facturas, params, cobros]);
  const vis = useMemo(() => { const t = normTxt(q.trim()); return t ? filas.filter((f) => normTxt(f.local + " " + f.empresa).includes(t)) : filas; }, [filas, q]);
  const tot = useMemo(() => filas.reduce((a, f) => ({ saldo: a.saldo + f.saldo, cobrado: a.cobrado + f.totalCobrado }), { saldo: 0, cobrado: 0 }), [filas]);
  function exportar() {
    descargarCSV("cobro-por-local.csv",
      ["Local", "Empresa", "Deuda vencida", "Deuda no vencida", "Saldo pendiente", "Total cobrado", "Último cobro", "Facturas"],
      vis.map((f) => [f.local, f.empresa, Math.round(f.vencida), Math.round(f.noVencida), Math.round(f.saldo), Math.round(f.totalCobrado), f.ultimoCobro || "", f.nFacturas]));
  }
  return (
    <>
      <InfoNota>
        Una fila por local. <b>Saldo</b> = lo que todavía debe (sin incobrables ni toma local). <b>Total cobrado</b> = todo lo que ese local ya pagó, incluidos los cobros históricos del Excel. <b>Últ. cobro</b> = fecha del último pago.
      </InfoNota>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-ink/[0.015] px-4 py-2 text-2xs">
        <span className="text-muted"><b className="text-ink">{filas.length}</b> locales · saldo pendiente <b className="text-ink monto">{money(tot.saldo)}</b> · total cobrado <b className="text-ok monto">{money(tot.cobrado)}</b></span>
        <div className="flex items-center gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar local…" className="w-44 rounded-md border border-line bg-surface px-2 py-1 text-2xs text-ink placeholder:text-faint" />
          <button onClick={exportar} className="rounded-md border border-line px-2 py-0.5 text-[11px] font-medium text-muted hover:bg-ink/5">Exportar CSV</button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead><tr className="border-b border-line text-[10px] uppercase tracking-wide text-faint">
            <th className="px-4 py-1.5 font-medium">Local</th>
            <th className="px-3 py-1.5 font-medium">Empresa</th>
            <th className="px-3 py-1.5 text-right font-medium">Vencida</th>
            <th className="px-3 py-1.5 text-right font-medium">No vencida</th>
            <th className="px-3 py-1.5 text-right font-medium">Saldo</th>
            <th className="px-3 py-1.5 text-right font-medium">Cobrado</th>
            <th className="px-3 py-1.5 text-right font-medium">Últ. cobro</th>
          </tr></thead>
          <tbody>
            {vis.map((f) => (
              <tr key={f.local} className="border-b border-line/60 hover:bg-ink/[0.02]">
                <td className="px-4 py-1.5 text-2xs font-medium text-ink">{f.local}<span className="ml-1.5 text-[10px] font-normal text-faint">{f.nFacturas} fc</span></td>
                <td className="px-3 py-1.5 text-2xs text-muted">{f.empresa || "—"}</td>
                <td className="px-3 py-1.5 text-right font-mono tnum text-2xs text-bad monto">{f.vencida > 0 ? money(f.vencida) : "—"}</td>
                <td className="px-3 py-1.5 text-right font-mono tnum text-2xs text-muted monto">{f.noVencida > 0 ? money(f.noVencida) : "—"}</td>
                <td className="px-3 py-1.5 text-right font-mono tnum text-2xs font-medium text-ink monto">{money(f.saldo)}</td>
                <td className="px-3 py-1.5 text-right font-mono tnum text-2xs text-ok monto">{f.totalCobrado > 0 ? money(f.totalCobrado) : "—"}</td>
                <td className="whitespace-nowrap px-3 py-1.5 text-right font-mono text-2xs text-faint">{f.ultimoCobro ? fechaLabel(f.ultimoCobro) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

const NIVEL_TONO: Record<NivelMora, string> = {
  "Crítico": "bg-bad/10 text-bad border-bad/30", "Alto": "bg-warn/15 text-warn border-warn/40",
  "Medio": "bg-action/10 text-action border-action/30", "Bajo": "bg-ok/10 text-ok border-ok/30",
};
// ── Morosidad: ranking por $ en mora (hoja Análisis de Mora) + días promedio (Días Promedio) ──
function MorosidadPanel({ facturas, params, onVer }: { facturas: FacturaCC[]; params: ParamsCC; onVer: (clave: string, nombre: string) => void }) {
  const [q, setQ] = useState("");
  const [por, setPor] = useState<MoraPor>("local");
  const filas = useMemo(() => morosidad(facturas, params, por).filter((f) => f.totalMora > 0 || f.vencido > 0), [facturas, params, por]);
  const glob = useMemo(() => moraGlobal(facturas, params), [facturas, params]);
  const vis = useMemo(() => { const t = normTxt(q.trim()); return t ? filas.filter((f) => normTxt(f.nombre + " " + f.codigo + " " + f.empresa).includes(t)) : filas; }, [filas, q]);
  function exportar() {
    descargarCSV(`morosidad-${por}.csv`,
      [por === "local" ? "Local" : "Franquiciado", "Empresa", "Comprob. en mora", "Días prom.", "Peor mora", "Capital", "Punitorios", "Total en mora", "Score", "Nivel"],
      vis.map((f) => [f.nombre, f.empresa, f.comprobMora, Math.round(f.diasProm), f.diasMax, Math.round(f.capitalMora), Math.round(f.punitMora), Math.round(f.totalMora), f.score, f.nivel]));
  }
  return (
    <>
      <InfoNota>
        Ranking de los más atrasados, ordenado por <b>Total en mora</b> (la plata con ≥30 días de atraso — capital + punitorios). <b>Días prom.</b> = cuántos días de atraso promedian · <b>Peor</b> = la factura más atrasada · <b>Score</b> = riesgo de 0 a 100 (más alto, peor). Cambiá entre <b>Por local</b> y <b>Por franquiciado</b> arriba a la derecha. Tocá una fila para ver sus facturas.
      </InfoNota>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-ink/[0.015] px-4 py-2 text-2xs">
        <span className="text-muted">Mora ≥30 días · promedio <b className="text-ink">{Math.round(glob.diasProm)} días</b> · <b className="text-ink">{glob.comprobMora}</b> comprobantes · <b className="text-ink">{glob.localesEnMora}</b> locales en mora · deuda en mora <b className="text-bad monto">{money(glob.deudaEnMora)}</b></span>
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded-md border border-line text-[11px]">
            {(["local", "franquiciado"] as MoraPor[]).map((k) => <button key={k} onClick={() => setPor(k)} className={`px-2 py-0.5 font-medium ${por === k ? "bg-ink/[0.06] text-ink" : "text-muted hover:bg-ink/[0.03]"}`}>{k === "local" ? "Por local" : "Por franquiciado"}</button>)}
          </div>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…" className="w-40 rounded-md border border-line bg-surface px-2 py-1 text-2xs text-ink placeholder:text-faint" />
          <button onClick={exportar} className="rounded-md border border-line px-2 py-0.5 text-[11px] font-medium text-muted hover:bg-ink/5">Exportar CSV</button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead><tr className="border-b border-line text-[10px] uppercase tracking-wide text-faint">
            <th className="px-4 py-1.5 font-medium">#</th>
            <th className="px-3 py-1.5 font-medium">{por === "local" ? "Local" : "Franquiciado"}</th>
            <th className="px-3 py-1.5 text-right font-medium" title="Comprobantes con ≥30 días de mora">Comp.</th>
            <th className="px-3 py-1.5 text-right font-medium" title="Días promedio de mora (facturas ≥30d)">Días prom.</th>
            <th className="px-3 py-1.5 text-right font-medium" title="La peor mora">Peor</th>
            <th className="px-3 py-1.5 text-right font-medium" title="Capital + punitorios en mora — ranking">Total en mora</th>
            <th className="px-3 py-1.5 font-medium" title="Riesgo compuesto 0–100">Score</th>
          </tr></thead>
          <tbody>
            {vis.map((f, i) => (
              <tr key={f.clave} onClick={() => onVer(f.clave, f.nombre)} className="cursor-pointer border-b border-line/60 hover:bg-ink/[0.02]">
                <td className="px-4 py-1.5 font-mono text-[10px] text-faint">{i + 1}</td>
                <td className="px-3 py-1.5 text-2xs font-medium text-ink">{f.nombre}<span className="ml-1.5 font-normal text-[10px] text-faint">{por === "local" ? f.empresa : f.codigo}</span></td>
                <td className="px-3 py-1.5 text-right font-mono tnum text-2xs text-muted">{f.comprobMora || "—"}</td>
                <td className="px-3 py-1.5 text-right font-mono tnum text-2xs text-muted">{f.comprobMora ? Math.round(f.diasProm) + "d" : "—"}</td>
                <td className="px-3 py-1.5 text-right font-mono tnum text-2xs text-muted">{f.diasMax}d</td>
                <td className="px-3 py-1.5 text-right font-mono tnum text-2xs font-medium text-bad monto">{f.totalMora > 0 ? money(f.totalMora) : "—"}</td>
                <td className="px-3 py-1.5">
                  <span className={`inline-flex items-center gap-1.5 rounded border px-1.5 py-px text-[11px] font-semibold ${NIVEL_TONO[f.nivel]}`}>
                    <span className="tnum">{f.score}</span><span className="font-normal">{f.nivel}</span>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ── Raven (export fiscal del CDP) — FUENTE APARTE de la cta cte, cruzada por CUIT ──
function RavenPanel({ raven, clientes, onSubir, cargando }: { raven: { franqs: RavenFranq[]; meta: { cuando?: string; desde?: string; hasta?: string; nComprob?: number } }; clientes: Record<string, ClienteCC>; onSubir: (files: FileList | null) => void; cargando: boolean }) {
  const [q, setQ] = useState("");
  const soloDig = (s?: string) => String(s ?? "").replace(/\D/g, "");
  const cuitsMaestro = useMemo(() => new Set(Object.values(clientes).map((c) => soloDig(c.cuit)).filter(Boolean)), [clientes]);
  const franqs = raven.franqs ?? [];
  const vis = useMemo(() => { const t = normTxt(q.trim()); return t ? franqs.filter((f) => normTxt(f.denominacion + " " + f.cuit + " " + f.localRaven).includes(t)) : franqs; }, [franqs, q]);
  const tot = useMemo(() => franqs.reduce((a, f) => ({ total: a.total + f.total, cdp: a.cdp + f.cdp, serv: a.serv + f.servicios }), { total: 0, cdp: 0, serv: 0 }), [franqs]);
  const enCta = (f: RavenFranq) => cuitsMaestro.has(soloDig(f.cuit));
  const cruzan = useMemo(() => franqs.filter(enCta).length, [franqs, cuitsMaestro]);
  function exportar() {
    descargarCSV("raven-por-franquiciado.csv",
      ["Franquiciado", "CUIT", "Local (Raven)", "Comprobantes", "Total facturado", "CDP (mercadería)", "Servicios", "En cta cte", "Desde", "Hasta"],
      vis.map((f) => [f.denominacion, f.cuit, f.localRaven, f.n, Math.round(f.total), Math.round(f.cdp), Math.round(f.servicios), enCta(f) ? "Sí" : "No", f.desde, f.hasta]));
  }
  const subirBtn = (
    <label className={`cursor-pointer rounded-md border border-action/40 bg-action/5 px-2.5 py-1 text-[11px] font-medium text-action hover:bg-action/10 ${cargando ? "pointer-events-none opacity-50" : ""}`}>
      {franqs.length ? "Actualizar Raven" : "Subir export de Raven"}
      <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => onSubir(e.target.files)} />
    </label>
  );
  return (
    <>
      <InfoNota tone="warn">
        <b>De dónde llega esto:</b> es el export fiscal de <b>Raven</b> (la pantalla «mis-comprobantes» del CDP), <b>NO es la deuda</b> (la deuda sale del estado de cuenta de Tango, en las otras solapas). Muestra <b>qué le facturó el CDP</b> a cada franquiciado. Se cruza por <b>CUIT</b> (no por número, porque la numeración fiscal no coincide con la de la cta cte). <b>Con remito = mercadería/CDP · sin remito = servicios</b> (regalías, etc.).
      </InfoNota>
      {!franqs.length ? (
        <div className="px-4 py-10 text-center">
          <p className="text-2xs text-muted">Todavía no subiste el export de Raven.</p>
          <p className="mx-auto mt-1 max-w-md text-2xs text-faint">Bajá «mis-comprobantes» de Raven (admin.ravenfood.app/fiscal/comprobantes) y subilo acá. Se resume por franquiciado (CUIT) y queda separado de la deuda.</p>
          <div className="mt-3 flex justify-center">{subirBtn}</div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-ink/[0.015] px-4 py-2 text-2xs">
            <span className="text-muted"><b className="text-ink">{franqs.length}</b> franquiciados · facturado <b className="text-ink monto">{money(tot.total)}</b> (<b className="text-ok">CDP {money(tot.cdp)}</b> · servicios {money(tot.serv)}) · <b className="text-ink">{cruzan}</b> cruzan con el maestro{raven.meta?.desde ? <span className="text-faint"> · {fechaLabel(raven.meta.desde)}–{fechaLabel(raven.meta.hasta || "")} · {int(raven.meta.nComprob || 0)} comprob.</span> : null}</span>
            <div className="flex items-center gap-2">{subirBtn}<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…" className="w-40 rounded-md border border-line bg-surface px-2 py-1 text-2xs text-ink placeholder:text-faint" /><button onClick={exportar} className="rounded-md border border-line px-2 py-0.5 text-[11px] font-medium text-muted hover:bg-ink/5">Exportar CSV</button></div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead><tr className="border-b border-line text-[10px] uppercase tracking-wide text-faint">
                <th className="px-4 py-1.5 font-medium">Franquiciado (Raven)</th>
                <th className="px-3 py-1.5 font-medium">CUIT</th>
                <th className="px-3 py-1.5 font-medium">Local (Raven)</th>
                <th className="px-3 py-1.5 text-right font-medium">Comprob.</th>
                <th className="px-3 py-1.5 text-right font-medium">Facturado</th>
                <th className="px-3 py-1.5 text-right font-medium" title="Comprobantes con remito = mercadería">CDP</th>
                <th className="px-3 py-1.5 text-right font-medium" title="Sin remito = regalías/servicios">Servicios</th>
                <th className="px-3 py-1.5 font-medium" title="¿El CUIT está en el maestro / la cta cte?">En cta cte</th>
              </tr></thead>
              <tbody>
                {vis.map((f) => (
                  <tr key={f.cuit} className="border-b border-line/60 hover:bg-ink/[0.02]">
                    <td className="px-4 py-1.5 text-2xs font-medium text-ink">{f.denominacion || "—"}</td>
                    <td className="px-3 py-1.5 font-mono text-2xs text-muted">{f.cuit}</td>
                    <td className="px-3 py-1.5 text-2xs text-muted">{f.localRaven || "—"}</td>
                    <td className="px-3 py-1.5 text-right font-mono tnum text-2xs text-faint">{f.n}</td>
                    <td className="px-3 py-1.5 text-right font-mono tnum text-2xs font-medium text-ink monto">{money(f.total)}</td>
                    <td className="px-3 py-1.5 text-right font-mono tnum text-2xs text-ok monto">{f.cdp > 0 ? money(f.cdp) : "—"}</td>
                    <td className="px-3 py-1.5 text-right font-mono tnum text-2xs text-muted monto">{f.servicios > 0 ? money(f.servicios) : "—"}</td>
                    <td className="px-3 py-1.5">{enCta(f) ? <span className="rounded bg-ok/10 px-1.5 py-px text-[10px] font-medium text-ok">✓ sí</span> : <span className="rounded bg-ink/[0.06] px-1.5 py-px text-[10px] text-faint">no</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

// Registro de cobros (hoja "Registro de Cobros" del Excel): TODOS los cobros. Los
// HISTÓRICOS vienen del Excel (ya aplicados en el snapshot, solo lectura); los NUEVOS
// se cargan desde el detalle de una factura y bajan su saldo (borrables).
function CobrosPanel({ cobros, cobrosHist, onBorrar }: { cobros: CobroCC[]; cobrosHist: CobroCC[]; onBorrar: (id: string) => void }) {
  const orden = useMemo(() => [
    ...cobros.map((c) => ({ ...c, hist: false })),
    ...cobrosHist.map((c) => ({ ...c, hist: true })),
  ].sort((a, b) => (b.fecha || "").localeCompare(a.fecha || "")), [cobros, cobrosHist]);
  const totalNuevos = useMemo(() => cobros.reduce((s, c) => s + (Number(c.importe) || 0), 0), [cobros]);
  const totalHist = useMemo(() => cobrosHist.reduce((s, c) => s + (Number(c.importe) || 0), 0), [cobrosHist]);
  function exportar() {
    const filas = [["Fecha", "Comprobante", "Franquiciado", "Local", "Empresa", "Importe", "Origen"],
      ...orden.map((c) => [c.fecha, c.nroFactura, c.cliente ?? "", c.local ?? "", c.empresa ?? "", String(c.importe), c.hist ? "histórico" : "nuevo"])];
    const csv = filas.map((f) => f.map((x) => `"${String(x ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = "registro-de-cobros.csv"; a.click(); URL.revokeObjectURL(url);
  }
  if (!orden.length) return (
    <div className="px-4 py-10 text-center">
      <p className="text-2xs text-muted">Todavía no hay cobros registrados.</p>
      <p className="mt-1 text-2xs text-faint">Entrá al detalle de un franquiciado, abrí una factura y usá <b className="text-ok">＋ Registrar cobro</b>. El cobro baja el saldo de esa factura y queda anotado acá.</p>
    </div>
  );
  return (
    <>
      <InfoNota>
        Los cobros con la etiqueta <span className="rounded bg-ink/[0.06] px-1 py-px text-[10px] font-medium text-faint">Excel</span> <b>ya están descontados del saldo</b> (venían aplicados en el estado de cuenta). <b>No los cargues de nuevo.</b> Para un pago nuevo que entre de ahora en más, entrá al detalle de un franquiciado, abrí la factura y usá <b className="text-ok">＋ Registrar cobro</b> — ese sí baja el saldo y aparece acá.
      </InfoNota>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-ink/[0.015] px-4 py-2 text-2xs">
        <span className="text-muted"><b className="text-ink">{orden.length}</b> cobros · total <b className="text-ok monto">{money(totalHist + totalNuevos)}</b>
          <span className="text-faint"> ({cobrosHist.length} del Excel {money(totalHist)}{cobros.length ? ` + ${cobros.length} nuevos ${money(totalNuevos)}` : ""})</span>
        </span>
        <button onClick={exportar} className="rounded-md border border-line px-2 py-0.5 text-[11px] font-medium text-muted hover:bg-ink/5">Exportar CSV</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead><tr className="border-b border-line text-[10px] uppercase tracking-wide text-faint">
            <th className="px-4 py-1.5 font-medium">Fecha</th>
            <th className="px-3 py-1.5 font-medium">Local / Franquiciado</th>
            <th className="px-3 py-1.5 font-medium">Comprobante</th>
            <th className="px-3 py-1.5 text-right font-medium">Importe</th>
            <th className="px-3 py-1.5"></th>
          </tr></thead>
          <tbody>
            {orden.map((c) => (
              <tr key={c.id} className="border-b border-line/60 hover:bg-ink/[0.02]">
                <td className="whitespace-nowrap px-4 py-1.5 font-mono text-2xs text-muted">{fechaLabel(c.fecha)}</td>
                <td className="px-3 py-1.5 text-2xs text-ink">{c.local || c.cliente || "—"}{c.empresa && <span className="ml-1.5 text-faint">· {c.empresa}</span>}
                  {c.hist && <span className="ml-1.5 rounded bg-ink/[0.06] px-1 py-px text-[10px] font-medium text-faint" title="Cobro histórico del Excel — ya está aplicado en el saldo">Excel</span>}</td>
                <td className="px-3 py-1.5 font-mono text-2xs text-muted">{c.nroFactura}</td>
                <td className="px-3 py-1.5 text-right font-mono tnum font-medium text-ok monto">{money(Number(c.importe) || 0)}</td>
                <td className="px-3 py-1.5 text-right">{c.hist ? <span className="text-[10px] text-faint" title="Ya aplicado en el saldo; no se puede borrar desde acá">·</span> : <button onClick={() => { if (confirm("¿Borrar este cobro? El saldo de la factura vuelve a subir.")) onBorrar(c.id); }} className="text-faint hover:text-bad" title="Borrar cobro">×</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
