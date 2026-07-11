"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/primitives";
import { descargarCSV } from "@/lib/exportar-csv";
import { parseArchivoBanco, resumirBancos, claveOrigen, type MovBanco, type ResumenBancos } from "@/lib/bancos";

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
  const [tab, setTab] = useState<"banco" | "local" | "mes" | "categoria">("banco");
  const [verCobertura, setVerCobertura] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function cargarGuardado() {
    try {
      const j = await (await fetch("/api/bancos", { cache: "no-store" })).json();
      if (j.ok) { setResumen(j.resumen); setCobertura(j.cobertura ?? []); setMeta(j.meta ?? null); }
    } catch { /* vacío */ } finally { setEstado("idle"); }
  }
  useEffect(() => { cargarGuardado(); }, []);

  async function onArchivos(files: FileList | null) {
    if (!files || !files.length) return;
    setError(""); setEstado("parsing"); setProgreso(`Leyendo ${files.length} archivos…`);
    const movs: MovBanco[] = []; const errores: string[] = []; let descartados = 0; let ok = 0;
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (!/\.(csv|xlsx?)$/i.test(f.name)) continue;
      setProgreso(`Procesando ${i + 1}/${files.length}: ${f.name}`);
      try {
        const buf = await f.arrayBuffer();
        const rel = (f as any).webkitRelativePath || f.name;
        const r = parseArchivoBanco(f.name, rel, buf);
        if (r.error) errores.push(`${f.name}: ${r.error}`);
        else { movs.push(...r.movs); descartados += r.descartados; ok++; }
      } catch (e) { errores.push(`${f.name}: ${e instanceof Error ? e.message : "error"}`); }
      if (i % 5 === 0) await new Promise((r) => setTimeout(r, 0)); // no congelar la UI
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
      if (ultima) { setResumen(ultima.resumen); setCobertura(ultima.cobertura ?? []); setMeta({ actualizado: new Date().toISOString() }); }
      setPreview(null);
    } catch (e) { setError(e instanceof Error ? e.message : "no se pudo guardar"); }
    finally { setEstado("idle"); setProgreso(""); }
  }

  const r = preview?.resumen ?? resumen;
  const filas = useMemo(() => {
    if (!r) return [] as { k: string; n: number; ingresos: number; egresos: number }[];
    return tab === "banco" ? r.porBanco : tab === "local" ? r.porLocal : tab === "mes" ? r.porMes : r.porCategoria;
  }, [r, tab]);
  const maxV = Math.max(1, ...filas.map((f) => Math.abs(f.ingresos - f.egresos)));

  function exportar() {
    if (!r) return;
    descargarCSV(`bancos-${tab}.csv`, [tab, "movimientos", "ingresos", "egresos", "neto"],
      filas.map((f) => [tab === "mes" ? f.k : f.k, f.n, Math.round(f.ingresos), Math.round(f.egresos), Math.round(f.ingresos - f.egresos)]));
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
          {meta?.actualizado && <span className="text-2xs text-faint">actualizado {new Date(meta.actualizado).toLocaleDateString("es-AR")}</span>}
          <label className={`cursor-pointer rounded-md border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:bg-ink/[0.03] ${cargando ? "pointer-events-none opacity-50" : ""}`}>
            Subir carpeta
            <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => onArchivos(e.target.files)} {...({ webkitdirectory: "", directory: "" } as Record<string, string>)} />
          </label>
          <label className={`cursor-pointer rounded-md border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:bg-ink/[0.03] ${cargando ? "pointer-events-none opacity-50" : ""}`}>
            Archivos
            <input type="file" accept=".csv,.xls,.xlsx" multiple className="hidden" onChange={(e) => onArchivos(e.target.files)} />
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

      {!r || r.total === 0 ? (
        !cargando && <Card className="p-6 text-sm text-muted">
          Todavía no hay extractos cargados. Tocá <b>Subir carpeta</b> y elegí la carpeta con los extractos (CSV/Excel de Galicia, Ciudad, Macro, Provincia, Santander, Mercado Pago). Detecto el banco solo y consolido todo.
          <span className="block mt-1 text-2xs text-faint">Los PDF todavía no se leen (fase 2). Por ahora, CSV/Excel.</span>
        </Card>
      ) : (
        <>
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
                {([["banco", "Por banco"], ["local", "Por local"], ["mes", "Por mes"], ["categoria", "Por categoría"]] as const).map(([k, l]) => (
                  <button key={k} onClick={() => setTab(k)} className={`rounded-md px-2.5 py-1 text-2xs font-medium ${tab === k ? "bg-ink/[0.06] text-ink" : "text-muted hover:bg-ink/[0.03]"}`}>{l}</button>
                ))}
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => setVerCobertura((v) => !v)} className="text-2xs font-medium text-muted hover:text-ink">{verCobertura ? "ocultar" : "ver"} cobertura</button>
                <button onClick={exportar} className="text-2xs font-medium text-action hover:underline">Exportar CSV</button>
              </div>
            </div>
            <div className="overflow-x-auto">
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
