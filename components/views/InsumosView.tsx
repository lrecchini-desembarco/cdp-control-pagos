"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, Field, inputClass, Button, Badge, Skeleton, EmptyState, ErrorState } from "@/components/ui/primitives";
import {
  precioConImpuestos, antiguedadDias, precioUnidadDe,
  IVA_OPCIONES, DONDE_OPCIONES, type Insumo,
} from "@/lib/insumos";

const money = (n: number) => "$" + Math.round(n).toLocaleString("es-AR");
const VIEJO_DIAS = 45; // umbral para marcar un costo desactualizado

export default function InsumosView() {
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [estado, setEstado] = useState<"loading" | "ok" | "error">("loading");
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [donde, setDonde] = useState("todas");
  const [marca, setMarca] = useState("todas");
  const [edit, setEdit] = useState<Insumo | "nuevo" | null>(null);

  async function cargar() {
    setEstado("loading"); setErr("");
    try {
      const j = await (await fetch("/api/insumos")).json();
      if (!j.ok) throw new Error(j.error || "No se pudo cargar.");
      setInsumos(j.insumos); setEstado("ok");
    } catch (e) { setErr(e instanceof Error ? e.message : "Error."); setEstado("error"); }
  }
  useEffect(() => { cargar(); }, []);

  const marcas = useMemo(() => Array.from(new Set(insumos.map((i) => i.marca).filter(Boolean))).sort(), [insumos]);

  const filtrados = useMemo(() => {
    const t = q.trim().toLowerCase();
    return insumos.filter((i) => {
      if (donde !== "todas" && i.donde !== donde) return false;
      if (marca !== "todas" && i.marca !== marca) return false;
      if (!t) return true;
      return `${i.cod} ${i.descripcion} ${i.marca} ${i.proveedor}`.toLowerCase().includes(t);
    });
  }, [insumos, q, donde, marca]);

  const kpis = useMemo(() => {
    const viejos = insumos.filter((i) => (antiguedadDias(i.actualizado) ?? 0) > VIEJO_DIAS).length;
    return { total: insumos.length, viejos };
  }, [insumos]);

  async function guardar(input: Partial<Insumo>) {
    const j = await (await fetch("/api/insumos", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
    })).json();
    if (!j.ok) throw new Error(j.error || "No se pudo guardar.");
    setInsumos(j.insumos); setEdit(null);
  }
  async function borrar(cod: string) {
    if (!confirm(`¿Borrar el insumo "${cod}"?`)) return;
    const j = await (await fetch(`/api/insumos?cod=${encodeURIComponent(cod)}`, { method: "DELETE" })).json();
    if (j.ok) setInsumos(j.insumos);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold text-ink">Insumos</h1>
          <p className="mt-0.5 max-w-2xl text-sm text-muted">
            Maestro de insumos y su <b>costo por unidad de receta</b>. Es la base de las recetas y los márgenes.
            Precio unitario = precio del bulto / factor. Datos iniciales del Excel de costos; editables acá.
          </p>
        </div>
        <Button onClick={() => setEdit("nuevo")}>+ Nuevo insumo</Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Insumos" value={String(kpis.total)} />
        <Kpi label="Costo desactualizado" value={String(kpis.viejos)} sub={`+${VIEJO_DIAS} días`} tone={kpis.viejos ? "warn" : undefined} />
      </div>

      <Card className="p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Buscar"><input className={inputClass} placeholder="código, descripción, marca, proveedor…" value={q} onChange={(e) => setQ(e.target.value)} /></Field>
          <Field label="Marca (dónde se usa)">
            <select className={inputClass} value={donde} onChange={(e) => setDonde(e.target.value)}>
              <option value="todas">Todas</option>
              {DONDE_OPCIONES.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </Field>
          <Field label="Proveedor / marca insumo">
            <select className={inputClass} value={marca} onChange={(e) => setMarca(e.target.value)}>
              <option value="todas">Todas</option>
              {marcas.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>
        </div>
      </Card>

      <Card className="overflow-hidden">
        {estado === "loading" ? (
          <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
        ) : estado === "error" ? (
          <div className="p-4"><ErrorState msg={err} onRetry={cargar} /></div>
        ) : filtrados.length === 0 ? (
          <div className="p-6"><EmptyState title="Sin insumos" desc="Cambiá el filtro o cargá uno nuevo." /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-2xs uppercase tracking-wide text-faint">
                  <th className="px-4 py-2 font-medium">Insumo</th>
                  <th className="px-3 py-2 font-medium">Dónde</th>
                  <th className="px-3 py-2 font-medium">Presentación</th>
                  <th className="px-3 py-2 text-right font-medium">Precio bulto</th>
                  <th className="px-3 py-2 text-right font-medium">Factor</th>
                  <th className="px-3 py-2 text-right font-medium">$ / unidad</th>
                  <th className="px-3 py-2 text-right font-medium">c/ imp.</th>
                  <th className="px-3 py-2 font-medium">Actualizado</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {filtrados.slice(0, 400).map((i) => {
                  const dias = antiguedadDias(i.actualizado);
                  const viejo = (dias ?? 0) > VIEJO_DIAS;
                  return (
                    <tr key={i.cod} className="border-b border-line last:border-0 hover:bg-ink/5">
                      <td className="px-4 py-2">
                        <div className="font-medium text-ink">{i.descripcion || i.cod}</div>
                        <div className="text-2xs text-faint">{i.cod} · {i.marca}{i.proveedor ? ` · ${i.proveedor}` : ""}</div>
                      </td>
                      <td className="px-3 py-2 text-muted">{i.donde}</td>
                      <td className="px-3 py-2 text-muted">{i.presentacion}</td>
                      <td className="px-3 py-2 text-right font-mono tnum text-muted">{money(i.precioBulto)}</td>
                      <td className="px-3 py-2 text-right font-mono tnum text-faint">{i.factor}</td>
                      <td className="px-3 py-2 text-right font-mono tnum font-semibold text-ink">{money(i.precioUnidad)}</td>
                      <td className="px-3 py-2 text-right font-mono tnum text-muted" title={`IVA ${i.ivaPct}%${i.iiPct ? ` · II ${i.iiPct}%` : ""}`}>{money(precioConImpuestos(i))}</td>
                      <td className="px-3 py-2 text-2xs">
                        <span className="text-muted">{i.actualizado ?? "—"}</span>
                        {viejo && <span className="ml-1"><Badge tone="warn">{dias}d</Badge></span>}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <button onClick={() => setEdit(i)} className="text-2xs text-action hover:underline">Editar</button>
                        <button onClick={() => borrar(i.cod)} className="ml-3 text-2xs text-bad hover:underline">Borrar</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="text-2xs text-faint">Mostrando {Math.min(filtrados.length, 400)} de {filtrados.length}. El precio con impuestos se compone: precio × (1 + IVA) + precio × II.</p>

      {edit && <Editor insumo={edit === "nuevo" ? null : edit} marcas={marcas} onClose={() => setEdit(null)} onGuardar={guardar} />}
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

function Editor({ insumo, marcas, onClose, onGuardar }: {
  insumo: Insumo | null;
  marcas: string[];
  onClose: () => void;
  onGuardar: (i: Partial<Insumo>) => Promise<void>;
}) {
  const [f, setF] = useState<Partial<Insumo>>(
    insumo ?? { donde: "Ambas", ivaPct: 21, iiPct: 0, precioBulto: 0, factor: 1 }
  );
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof Insumo, v: unknown) => setF((p) => ({ ...p, [k]: v }));
  const precioUnidad = precioUnidadDe(Number(f.precioBulto) || 0, Number(f.factor) || 1);
  const nuevo = !insumo;

  async function submit() {
    setError("");
    if (!String(f.cod ?? "").trim()) return setError("El código es obligatorio.");
    setGuardando(true);
    try { await onGuardar(f); } catch (e) { setError(e instanceof Error ? e.message : "Error."); setGuardando(false); }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-card border border-line bg-surface p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <h2 className="font-display text-lg font-semibold text-ink">{nuevo ? "Nuevo insumo" : `Editar · ${insumo!.cod}`}</h2>
          <button onClick={onClose} className="rounded-lg px-2 text-lg text-muted hover:text-ink">✕</button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Código interno"><input className={inputClass} value={f.cod ?? ""} disabled={!nuevo} onChange={(e) => set("cod", e.target.value)} /></Field>
          <Field label="Cód. Tango (opcional)"><input className={inputClass} value={f.codTango ?? ""} onChange={(e) => set("codTango", e.target.value)} /></Field>
          <div className="sm:col-span-2"><Field label="Descripción para receta"><input className={inputClass} value={f.descripcion ?? ""} onChange={(e) => set("descripcion", e.target.value)} /></Field></div>
          <Field label="Dónde se usa">
            <select className={inputClass} value={f.donde ?? "Ambas"} onChange={(e) => set("donde", e.target.value)}>
              {DONDE_OPCIONES.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </Field>
          <Field label="Marca del insumo"><input className={inputClass} list="marcas-list" value={f.marca ?? ""} onChange={(e) => set("marca", e.target.value)} /></Field>
          <datalist id="marcas-list">{marcas.map((m) => <option key={m} value={m} />)}</datalist>
          <Field label="Proveedor"><input className={inputClass} value={f.proveedor ?? ""} onChange={(e) => set("proveedor", e.target.value)} /></Field>
          <Field label="Presentación"><input className={inputClass} placeholder="Caja x 60 un." value={f.presentacion ?? ""} onChange={(e) => set("presentacion", e.target.value)} /></Field>
          <Field label="Precio x bulto"><input type="number" className={inputClass} value={f.precioBulto ?? 0} onChange={(e) => set("precioBulto", e.target.value)} /></Field>
          <Field label="Factor (unidades x bulto)"><input type="number" className={inputClass} value={f.factor ?? 1} onChange={(e) => set("factor", e.target.value)} /></Field>
          <Field label="IVA">
            <select className={inputClass} value={f.ivaPct ?? 21} onChange={(e) => set("ivaPct", Number(e.target.value))}>
              {IVA_OPCIONES.map((v) => <option key={v} value={v}>{v}%</option>)}
            </select>
          </Field>
          <Field label="Impuestos internos %"><input type="number" className={inputClass} value={f.iiPct ?? 0} onChange={(e) => set("iiPct", e.target.value)} /></Field>
        </div>

        <div className="mt-4 flex items-center justify-between rounded-lg bg-ink/[0.03] px-4 py-3">
          <span className="text-2xs uppercase tracking-wide text-faint">Precio por unidad de receta</span>
          <span className="font-mono tnum text-lg font-semibold text-ink">{money(precioUnidad)}<span className="ml-2 text-2xs font-normal text-faint">c/ imp. {money(precioConImpuestos({ precioUnidad, ivaPct: Number(f.ivaPct) || 0, iiPct: Number(f.iiPct) || 0 }))}</span></span>
        </div>

        {error && <p className="mt-3 text-sm text-bad">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={guardando}>{guardando ? "Guardando…" : "Guardar"}</Button>
        </div>
      </div>
    </div>
  );
}
