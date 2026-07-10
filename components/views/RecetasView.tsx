"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, Field, inputClass, Button, Badge, Skeleton, EmptyState, ErrorState } from "@/components/ui/primitives";
import type { RecetaCosteada, VersionReceta, Componente } from "@/lib/recetas";
import type { Insumo } from "@/lib/insumos";

const money = (n: number) => "$" + Math.round(n).toLocaleString("es-AR");
const pct = (n: number) => `${Math.round(n * 100)}%`;

export default function RecetasView() {
  const [recetas, setRecetas] = useState<RecetaCosteada[]>([]);
  const [estado, setEstado] = useState<"loading" | "ok" | "error">("loading");
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [marca, setMarca] = useState("todas");
  const [soloFaltantes, setSoloFaltantes] = useState(false);
  const [detalle, setDetalle] = useState<RecetaCosteada | null>(null);
  const [editar, setEditar] = useState<RecetaCosteada | null>(null);

  async function cargar() {
    setEstado("loading"); setErr("");
    try {
      const j = await (await fetch("/api/recetas")).json();
      if (!j.ok) throw new Error(j.error || "No se pudo cargar.");
      setRecetas(j.recetas); setEstado("ok");
    } catch (e) { setErr(e instanceof Error ? e.message : "Error."); setEstado("error"); }
  }
  useEffect(() => { cargar(); }, []);

  const marcas = useMemo(() => Array.from(new Set(recetas.map((r) => r.marca))).sort(), [recetas]);
  const filtrados = useMemo(() => {
    const t = q.trim().toLowerCase();
    return recetas.filter((r) => {
      if (marca !== "todas" && r.marca !== marca) return false;
      if (soloFaltantes && r.nFaltantes === 0) return false;
      if (!t) return true;
      return `${r.skuTango} ${r.descripcion}`.toLowerCase().includes(t);
    });
  }, [recetas, q, marca, soloFaltantes]);
  const kpis = useMemo(() => ({
    total: recetas.length,
    conFaltantes: recetas.filter((r) => r.nFaltantes > 0).length,
  }), [recetas]);

  function onGuardado(rs: RecetaCosteada[]) {
    setRecetas(rs); setEditar(null);
    if (detalle) setDetalle(rs.find((r) => r.skuTango === detalle.skuTango) ?? null);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold text-ink">Recetas</h1>
          <p className="mt-0.5 max-w-2xl text-sm text-muted">
            Composición de cada producto y su <b>costo de receta</b>, calculado en vivo contra el maestro de Insumos.
            Cada cambio guarda una <b>versión nueva</b>. Datos iniciales del Excel (R_MT + R_MG).
          </p>
        </div>
        <Button onClick={() => setEditar({ skuTango: "", descripcion: "", marca: "Mr. Tasty", version: 0, fecha: "", nVersiones: 0, componentes: [], costoNeto: 0, costoConImp: 0, nFaltantes: 0 })}>+ Nueva receta</Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Recetas" value={String(kpis.total)} />
        <Kpi label="Con insumo faltante" value={String(kpis.conFaltantes)} sub="a completar en Insumos" tone={kpis.conFaltantes ? "warn" : undefined} />
      </div>

      <Card className="p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Buscar"><input className={inputClass} placeholder="producto o SKU…" value={q} onChange={(e) => setQ(e.target.value)} /></Field>
          <Field label="Marca">
            <select className={inputClass} value={marca} onChange={(e) => setMarca(e.target.value)}>
              <option value="todas">Todas</option>
              {marcas.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>
          <label className="flex items-end gap-2 pb-2 text-sm text-ink">
            <input type="checkbox" checked={soloFaltantes} onChange={(e) => setSoloFaltantes(e.target.checked)} />
            Solo con insumo faltante
          </label>
        </div>
      </Card>

      <Card className="overflow-hidden">
        {estado === "loading" ? (
          <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
        ) : estado === "error" ? (
          <div className="p-4"><ErrorState msg={err} onRetry={cargar} /></div>
        ) : filtrados.length === 0 ? (
          <div className="p-6"><EmptyState title="Sin recetas" desc="Cambiá el filtro o cargá una nueva." /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-2xs uppercase tracking-wide text-faint">
                  <th className="px-4 py-2 font-medium">Producto</th>
                  <th className="px-3 py-2 font-medium">Marca</th>
                  <th className="px-3 py-2 text-center font-medium">Comp.</th>
                  <th className="px-3 py-2 text-right font-medium">Costo neto</th>
                  <th className="px-3 py-2 text-right font-medium">c/ imp.</th>
                  <th className="px-3 py-2 text-center font-medium">Ver.</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {filtrados.slice(0, 400).map((r) => (
                  <tr key={r.skuTango} onClick={() => setDetalle(r)} className="cursor-pointer border-b border-line last:border-0 hover:bg-ink/5">
                    <td className="px-4 py-2">
                      <div className="font-medium text-ink">{r.descripcion}</div>
                      <div className="text-2xs text-faint">SKU {r.skuTango}</div>
                    </td>
                    <td className="px-3 py-2 text-muted">{r.marca}</td>
                    <td className="px-3 py-2 text-center text-muted">
                      {r.componentes.length}
                      {r.nFaltantes > 0 && <span className="ml-1"><Badge tone="warn">{r.nFaltantes} falta</Badge></span>}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tnum font-semibold text-ink monto">{money(r.costoNeto)}</td>
                    <td className="px-3 py-2 text-right font-mono tnum text-muted monto">{money(r.costoConImp)}</td>
                    <td className="px-3 py-2 text-center text-2xs text-faint">v{r.version}</td>
                    <td className="px-3 py-2 text-right"><span className="text-2xs text-action">Ver →</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {detalle && <Detalle receta={detalle} onClose={() => setDetalle(null)} onEditar={() => setEditar(detalle)} />}
      {editar && <Editor receta={editar} onClose={() => setEditar(null)} onGuardado={onGuardado} />}
    </div>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "warn" }) {
  return (
    <Card className="p-3">
      <p className="text-2xs uppercase tracking-wide text-faint">{label}</p>
      <p className={`mt-0.5 font-display text-lg font-semibold ${tone === "warn" ? "text-warn" : "text-ink"}`}>{value}</p>
      {sub && <p className="text-2xs text-faint">{sub}</p>}
    </Card>
  );
}

function Detalle({ receta, onClose, onEditar }: { receta: RecetaCosteada; onClose: () => void; onEditar: () => void }) {
  const [historial, setHistorial] = useState<VersionReceta[]>([]);
  useEffect(() => {
    fetch(`/api/recetas?sku=${encodeURIComponent(receta.skuTango)}`).then((r) => r.json()).then((j) => { if (j.ok) setHistorial(j.historial || []); }).catch(() => {});
  }, [receta.skuTango]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-card border border-line bg-surface p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-ink">{receta.descripcion}</h2>
            <p className="mt-0.5 text-2xs text-faint">SKU {receta.skuTango} · {receta.marca} · versión {receta.version} ({receta.fecha})</p>
          </div>
          <button onClick={onClose} className="rounded-lg px-2 text-lg text-muted hover:text-ink">✕</button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <Card className="p-3"><p className="text-2xs uppercase tracking-wide text-faint">Costo receta (neto)</p><p className="mt-0.5 font-display text-xl font-semibold text-ink monto">{money(receta.costoNeto)}</p></Card>
          <Card className="p-3"><p className="text-2xs uppercase tracking-wide text-faint">Con impuestos</p><p className="mt-0.5 font-display text-xl font-semibold text-ink monto">{money(receta.costoConImp)}</p></Card>
        </div>

        {receta.nFaltantes > 0 && (
          <p className="mt-3 rounded-lg bg-warn/10 px-3 py-2 text-2xs text-warn">
            {receta.nFaltantes} insumo(s) de esta receta no están en el maestro (cuentan $0). Cargalos en Insumos para costear bien.
          </p>
        )}

        <div className="mt-4">
          <p className="mb-2 text-2xs font-medium uppercase tracking-wide text-faint">Componentes · participación en el costo</p>
          <div className="space-y-2">
            {receta.componentes.map((c, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-52 shrink-0">
                  <div className={`truncate text-sm ${c.falta ? "text-warn" : "text-ink"}`}>{c.insumoDesc}</div>
                  <div className="text-2xs text-faint">{c.insumoCod} · {c.cant} × <span className="monto">{money(c.precioUnidad)}</span></div>
                </div>
                <div className="relative h-2.5 flex-1 rounded bg-ink/[0.05]">
                  <div className="h-full rounded bg-action" style={{ width: `${Math.min(100, c.pct * 100)}%` }} />
                </div>
                <span className="w-12 shrink-0 text-right font-mono tnum text-2xs text-faint">{pct(c.pct)}</span>
                <span className="w-20 shrink-0 text-right font-mono tnum text-sm text-ink monto">{money(c.subtotal)}</span>
              </div>
            ))}
          </div>
        </div>

        {historial.length > 1 && (
          <div className="mt-5">
            <p className="mb-2 text-2xs font-medium uppercase tracking-wide text-faint">Historial de versiones</p>
            <ul className="divide-y divide-line rounded-lg border border-line">
              {[...historial].reverse().map((v) => (
                <li key={v.version} className="flex items-center justify-between px-3 py-2 text-2xs">
                  <span className="text-ink">v{v.version} · {v.fecha}{v.autor ? ` · ${v.autor}` : ""}</span>
                  <span className="text-faint">{v.componentes.length} componentes</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cerrar</Button>
          <Button onClick={onEditar}>Editar receta</Button>
        </div>
      </div>
    </div>
  );
}

function Editor({ receta, onClose, onGuardado }: { receta: RecetaCosteada; onClose: () => void; onGuardado: (rs: RecetaCosteada[]) => void }) {
  const nuevo = !receta.skuTango;
  const [sku, setSku] = useState(receta.skuTango);
  const [desc, setDesc] = useState(receta.descripcion);
  const [marca, setMarca] = useState(receta.marca);
  const [comps, setComps] = useState<Componente[]>(receta.componentes.map((c) => ({ insumoCod: c.insumoCod, cant: c.cant })));
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/insumos").then((r) => r.json()).then((j) => { if (j.ok) setInsumos(j.insumos); }).catch(() => {});
  }, []);

  const idx = useMemo(() => { const m = new Map<string, Insumo>(); for (const i of insumos) m.set(i.cod.toLowerCase(), i); return m; }, [insumos]);
  const costo = comps.reduce((a, c) => a + (idx.get(c.insumoCod.toLowerCase())?.precioUnidad ?? 0) * (Number(c.cant) || 0), 0);

  const setComp = (i: number, patch: Partial<Componente>) => setComps((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const addComp = () => setComps((cs) => [...cs, { insumoCod: "", cant: 1 }]);
  const delComp = (i: number) => setComps((cs) => cs.filter((_, j) => j !== i));

  async function submit() {
    setError("");
    if (!sku.trim()) return setError("Falta el SKU de Tango.");
    const limpio = comps.filter((c) => c.insumoCod && Number(c.cant) > 0);
    if (!limpio.length) return setError("Agregá al menos un componente con insumo y cantidad.");
    setGuardando(true);
    try {
      const j = await (await fetch("/api/recetas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ skuTango: sku.trim(), descripcion: desc, marca, componentes: limpio }) })).json();
      if (!j.ok) throw new Error(j.error || "No se pudo guardar.");
      onGuardado(j.recetas);
    } catch (e) { setError(e instanceof Error ? e.message : "Error."); setGuardando(false); }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-card border border-line bg-surface p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <h2 className="font-display text-lg font-semibold text-ink">{nuevo ? "Nueva receta" : `Editar · ${receta.descripcion}`}</h2>
          <button onClick={onClose} className="rounded-lg px-2 text-lg text-muted hover:text-ink">✕</button>
        </div>
        {!nuevo && <p className="mt-1 text-2xs text-faint">Guardar crea la versión v{receta.nVersiones + 1} (se conserva la anterior).</p>}

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
          <Field label="SKU Tango"><input className={inputClass} value={sku} disabled={!nuevo} onChange={(e) => setSku(e.target.value)} /></Field>
          <div className="sm:col-span-2"><Field label="Descripción"><input className={inputClass} value={desc} onChange={(e) => setDesc(e.target.value)} /></Field></div>
          <Field label="Marca">
            <select className={inputClass} value={marca} onChange={(e) => setMarca(e.target.value)}>
              {["Mr. Tasty", "Mila & Go", "El Desembarco"].map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>
        </div>

        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-2xs font-medium uppercase tracking-wide text-faint">Componentes</p>
            <button onClick={addComp} className="text-2xs text-action hover:underline">+ Agregar componente</button>
          </div>
          <div className="space-y-2">
            {comps.map((c, i) => {
              const ins = idx.get(c.insumoCod.toLowerCase());
              const sub = (ins?.precioUnidad ?? 0) * (Number(c.cant) || 0);
              return (
                <div key={i} className="flex items-center gap-2">
                  <select className={`${inputClass} flex-1`} value={ins?.cod ?? c.insumoCod} onChange={(e) => setComp(i, { insumoCod: e.target.value })}>
                    <option value="">— elegí insumo —</option>
                    {c.insumoCod && !ins && <option value={c.insumoCod}>{c.insumoCod} (falta en maestro)</option>}
                    {insumos.map((x) => <option key={x.cod} value={x.cod}>{x.descripcion} ({x.cod})</option>)}
                  </select>
                  <input type="number" className={`${inputClass} w-24`} value={c.cant} onChange={(e) => setComp(i, { cant: Number(e.target.value) })} title="cantidad (unidades o gramos)" />
                  <span className="w-20 shrink-0 text-right font-mono tnum text-2xs text-muted monto">{money(sub)}</span>
                  <button onClick={() => delComp(i)} className="px-1 text-muted hover:text-bad" title="Quitar">✕</button>
                </div>
              );
            })}
            {comps.length === 0 && <p className="text-2xs text-faint">Sin componentes. Agregá el primero.</p>}
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between rounded-lg bg-ink/[0.03] px-4 py-3">
          <span className="text-2xs uppercase tracking-wide text-faint">Costo de receta (neto)</span>
          <span className="font-mono tnum text-lg font-semibold text-ink monto">{money(costo)}</span>
        </div>

        {error && <p className="mt-3 text-sm text-bad">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={guardando}>{guardando ? "Guardando…" : nuevo ? "Crear receta" : "Guardar versión"}</Button>
        </div>
      </div>
    </div>
  );
}
