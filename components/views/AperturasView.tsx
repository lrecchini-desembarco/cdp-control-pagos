"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, Field, inputClass, Button, Skeleton, EmptyState } from "@/components/ui/primitives";
import { MARCAS_AP, ESTADOS_LF, marcaAp, lf } from "@/lib/aperturas";
import { descargarCSV, descargarExcel } from "@/lib/exportar-csv";

interface Item {
  id: string;
  nombre: string;
  marca: string;
  local: string;
  firma: string;
  actualizado: string;
  campos?: Record<string, string>;
}

interface Columna { id: string; label: string; }

export default function AperturasView() {
  const [items, setItems] = useState<Item[]>([]);
  const [columnas, setColumnas] = useState<Columna[]>([]);
  const [estado, setEstado] = useState<"loading" | "ok" | "error">("loading");
  const [nuevo, setNuevo] = useState({ nombre: "", marca: "tasty", local: "no", firma: "si" });
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState("");
  const [urlTv, setUrlTv] = useState("");

  async function cargar() {
    setEstado("loading");
    try {
      const j = await (await fetch("/api/aperturas")).json();
      if (!j.ok) throw new Error();
      setItems(j.items);
      setColumnas(j.columnas ?? []);
      setEstado("ok");
    } catch {
      setEstado("error");
    }
  }
  useEffect(() => {
    cargar();
    const o = window.location.origin;
    const pub = /localhost|127\.0\.0\.1/.test(o) ? (process.env.NEXT_PUBLIC_PUBLIC_URL ?? "https://cdp-control-pagos.vercel.app") : o;
    setUrlTv(`${pub}/tv`);
  }, []);

  async function guardar(patch: Record<string, unknown>) {
    try {
      const j = await (await fetch("/api/aperturas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) })).json();
      if (j.ok) { setItems(j.items); if (j.columnas) setColumnas(j.columnas); }
      else setMsg(j.error || "No se pudo guardar.");
    } catch { setMsg("Error de red."); }
  }

  // ---- Columnas custom ----
  const guardarColumnas = (cols: Columna[]) => guardar({ accion: "columnas", columnas: cols });
  const agregarColumna = () => { guardarColumnas([...columnas, { id: "", label: `Columna ${columnas.length + 1}` }]); setMsg("Columna agregada ✓"); };
  const renombrarColumna = (id: string, label: string) => { const l = label.trim(); if (!l) return; guardarColumnas(columnas.map((c) => (c.id === id ? { ...c, label: l } : c))); };
  const borrarColumna = (id: string, label: string) => { if (!confirm(`¿Eliminar la columna "${label}"? Se pierden sus valores.`)) return; guardarColumnas(columnas.filter((c) => c.id !== id)); };
  const editarCampo = (id: string, colId: string, valor: string) => guardar({ id, campos: { [colId]: valor } });

  // ---- Exportar ----
  const COL_BASE = ["Sucursal", "Marca", "L · Local", "F · Firmado"];
  function datosExport(): { cols: string[]; filas: (string | number | null)[][] } {
    const cols = [...COL_BASE, ...columnas.map((c) => c.label)];
    const filas = items.map((it) => [
      it.nombre,
      marcaAp(it.marca).label,
      lf(it.local).label,
      lf(it.firma).label,
      ...columnas.map((c) => it.campos?.[c.id] ?? ""),
    ]);
    return { cols, filas };
  }
  const nombreArchivo = () => `apertura-locales-${new Date().toISOString().slice(0, 10)}`;
  function exportarCSV() { const { cols, filas } = datosExport(); descargarCSV(nombreArchivo(), cols, filas); }
  async function exportarExcel() {
    try { const { cols, filas } = datosExport(); await descargarExcel(nombreArchivo(), cols, filas, "Aperturas"); }
    catch { setMsg("No se pudo generar el Excel."); }
  }
  function editar(id: string, patch: Partial<Item>, persistir = true) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
    if (persistir) guardar({ id, ...patch });
  }
  async function agregar(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    if (!nuevo.nombre.trim()) return;
    await guardar(nuevo);
    setNuevo({ nombre: "", marca: nuevo.marca, local: "no", firma: "si" });
  }
  async function quitar(id: string, nombre: string) {
    if (!confirm(`¿Quitar "${nombre}" del cuadro?`)) return;
    const j = await (await fetch(`/api/aperturas?id=${encodeURIComponent(id)}`, { method: "DELETE" })).json();
    if (j.ok) setItems(j.items);
  }

  const filtrados = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? items.filter((it) => it.nombre.toLowerCase().includes(t)) : items;
  }, [items, q]);

  const tot = useMemo(() => ({
    total: items.length,
    tasty: items.filter((i) => i.marca === "tasty").length,
    tastyMila: items.filter((i) => i.marca === "tasty-mila").length,
    firmados: items.filter((i) => i.firma === "si").length,
  }), [items]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold text-ink">Apertura de locales · cuadro para TV</h1>
          <p className="mt-0.5 max-w-2xl text-sm text-muted">
            Editá acá el estado de cada local (L = Local, F = Firmado). La <b>cartelera de la TV se actualiza sola</b>.
          </p>
        </div>
        <a href="/tv" target="_blank" rel="noreferrer">
          <Button>📺 Abrir cartelera (TV)</Button>
        </a>
      </div>

      {/* URL para la TV */}
      <Card className="flex flex-wrap items-center gap-3 p-3">
        <span className="text-2xs font-medium uppercase tracking-wide text-faint">URL para la TV</span>
        <code className="rounded bg-paper px-2 py-1 font-mono text-xs text-ink">{urlTv}</code>
        <button onClick={() => { navigator.clipboard?.writeText(urlTv); setMsg("Link copiado ✓"); }} className="rounded-lg border border-line px-2 py-1 text-2xs text-muted hover:text-ink">Copiar</button>
        <span className="ml-auto text-2xs text-faint">Abrila en la smart TV o en un dispositivo (Chromecast / Fire Stick / mini-PC).</span>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Total locales" value={tot.total} />
        <Kpi label="Mr. Tasty" value={tot.tasty} />
        <Kpi label="Mr Tasty + Mila & Go" value={tot.tastyMila} />
        <Kpi label="Firmados" value={tot.firmados} />
      </div>

      {/* Alta */}
      <Card className="p-4">
        <p className="mb-2 text-2xs font-medium uppercase tracking-wide text-faint">Agregar local</p>
        <form onSubmit={agregar} className="grid grid-cols-1 gap-3 sm:grid-cols-[1.6fr_1.2fr_1fr_1fr_auto] sm:items-end">
          <Field label="Sucursal"><input className={inputClass} placeholder="Nombre del local" value={nuevo.nombre} onChange={(e) => setNuevo((n) => ({ ...n, nombre: e.target.value }))} /></Field>
          <Field label="Marca"><select className={inputClass} value={nuevo.marca} onChange={(e) => setNuevo((n) => ({ ...n, marca: e.target.value }))}>{MARCAS_AP.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select></Field>
          <Field label="L (Local)"><select className={inputClass} value={nuevo.local} onChange={(e) => setNuevo((n) => ({ ...n, local: e.target.value }))}>{ESTADOS_LF.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></Field>
          <Field label="F (Firmado)"><select className={inputClass} value={nuevo.firma} onChange={(e) => setNuevo((n) => ({ ...n, firma: e.target.value }))}>{ESTADOS_LF.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></Field>
          <Button type="submit" disabled={!nuevo.nombre.trim()}>Agregar</Button>
        </form>
        {msg && <p className="mt-2 text-2xs text-muted">{msg}</p>}
      </Card>

      {/* Buscar + acciones del cuadro */}
      <div className="flex flex-wrap items-center gap-2">
        <input className={`${inputClass} max-w-xs`} placeholder="Buscar local…" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="text-2xs text-faint">{filtrados.length} de {items.length}</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={agregarColumna}>+ Agregar columna</Button>
          <Button variant="outline" onClick={exportarCSV} disabled={!items.length}>Exportar CSV</Button>
          <Button variant="outline" onClick={exportarExcel} disabled={!items.length}>Exportar Excel</Button>
        </div>
      </div>

      {/* Tabla */}
      <Card className="overflow-hidden">
        {estado === "loading" ? (
          <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
        ) : estado === "error" ? (
          <div className="p-4 text-sm text-bad">No se pudo cargar el cuadro.</div>
        ) : filtrados.length === 0 ? (
          <EmptyState title="Sin locales" desc="Agregá el primero arriba." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-2xs uppercase tracking-wide text-faint">
                  <th className="px-4 py-2 font-medium">Sucursal</th>
                  <th className="px-3 py-2 font-medium">Marca</th>
                  <th className="px-3 py-2 font-medium">L · Local</th>
                  <th className="px-3 py-2 font-medium">F · Firmado</th>
                  {columnas.map((c) => (
                    <th key={c.id} className="px-3 py-2 font-medium">
                      <div className="flex items-center gap-1">
                        <input defaultValue={c.label} onBlur={(e) => renombrarColumna(c.id, e.target.value)}
                          className="w-28 min-w-0 rounded-md border border-transparent bg-transparent px-1 py-0.5 text-2xs font-medium uppercase tracking-wide text-faint hover:border-line focus:border-action focus:bg-surface focus:text-ink" title="Renombrar columna" />
                        <button onClick={() => borrarColumna(c.id, c.label)} title="Eliminar columna" className="shrink-0 text-faint hover:text-bad">✕</button>
                      </div>
                    </th>
                  ))}
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((it) => {
                  const m = marcaAp(it.marca);
                  return (
                    <tr key={it.id} className="border-b border-line/70 last:border-0 hover:bg-ink/[0.02]">
                      <td className="px-4 py-2">
                        <input defaultValue={it.nombre} onBlur={(e) => { if (e.target.value.trim() && e.target.value !== it.nombre) guardar({ id: it.id, nombre: e.target.value }); }}
                          className="w-56 rounded-md border border-transparent bg-transparent px-1 py-1 font-medium text-ink hover:border-line focus:border-action focus:bg-surface" />
                      </td>
                      <td className="px-3 py-2">
                        <select value={it.marca} onChange={(e) => editar(it.id, { marca: e.target.value })}
                          className="rounded-full border px-2.5 py-1 text-2xs font-bold" style={{ backgroundColor: m.filaBg, color: m.color, borderColor: m.color }}>
                          {MARCAS_AP.map((mm) => <option key={mm.id} value={mm.id} className="bg-surface text-ink">{mm.label}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2"><SelLF value={it.local} onChange={(v) => editar(it.id, { local: v })} /></td>
                      <td className="px-3 py-2"><SelLF value={it.firma} onChange={(v) => editar(it.id, { firma: v })} /></td>
                      {columnas.map((c) => (
                        <td key={c.id} className="px-3 py-2">
                          <input defaultValue={it.campos?.[c.id] ?? ""} onBlur={(e) => { const v = e.target.value; if (v !== (it.campos?.[c.id] ?? "")) editarCampo(it.id, c.id, v); }}
                            placeholder="—" className="w-28 min-w-0 rounded-md border border-transparent bg-transparent px-1 py-1 text-ink placeholder:text-faint hover:border-line focus:border-action focus:bg-surface" />
                        </td>
                      ))}
                      <td className="px-3 py-2 text-right">
                        <button onClick={() => quitar(it.id, it.nombre)} className="text-2xs font-medium text-bad hover:underline">Quitar</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function SelLF({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const e = lf(value);
  return (
    <select value={value} onChange={(ev) => onChange(ev.target.value)}
      className="rounded-md border border-line bg-surface px-2 py-1 text-2xs font-semibold" style={{ color: e.color }}>
      {ESTADOS_LF.map((s) => <option key={s.id} value={s.id} className="text-ink">{s.icon} {s.label}</option>)}
    </select>
  );
}

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <Card className="p-3">
      <p className="text-2xs uppercase tracking-wide text-faint">{label}</p>
      <p className="mt-0.5 font-display text-2xl font-semibold text-ink">{value.toLocaleString("es-AR")}</p>
    </Card>
  );
}
