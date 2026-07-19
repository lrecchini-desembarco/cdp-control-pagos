"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, Field, inputClass, Button, Badge, Skeleton, EmptyState, ErrorState } from "@/components/ui/primitives";
import { CANALES_VENTA, type CanalVenta, type RecetaCosteada, type VersionReceta, type Componente } from "@/lib/recetas";
import type { Insumo } from "@/lib/insumos";

const money = (n: number) => "$" + Math.round(n).toLocaleString("es-AR");
const pct = (n: number) => `${Math.round(n * 100)}%`;
const SIN_GRUPO = "Sin grupo";

const canalLabel = (c: CanalVenta) => CANALES_VENTA.find((x) => x.id === c)?.label ?? c;
function CanalesBadges({ canales }: { canales?: CanalVenta[] }) {
  if (!canales || !canales.length) return <span className="text-2xs text-faint">—</span>;
  return <span className="flex flex-wrap gap-1">{canales.map((c) => <Badge key={c} tone="neutral">{canalLabel(c)}</Badge>)}</span>;
}

export default function RecetasView() {
  const [recetas, setRecetas] = useState<RecetaCosteada[]>([]);
  const [grupos, setGrupos] = useState<string[]>([]);
  const [estado, setEstado] = useState<"loading" | "ok" | "error">("loading");
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [marca, setMarca] = useState("todas");
  const [soloFaltantes, setSoloFaltantes] = useState(false);
  const [detalle, setDetalle] = useState<RecetaCosteada | null>(null);
  const [editar, setEditar] = useState<RecetaCosteada | null>(null);
  const [ordenando, setOrdenando] = useState(false);
  const [gestionGrupos, setGestionGrupos] = useState(false);
  const [guardandoOrden, setGuardandoOrden] = useState(false);

  async function cargar() {
    setEstado("loading"); setErr("");
    try {
      const j = await (await fetch("/api/recetas")).json();
      if (!j.ok) throw new Error(j.error || "No se pudo cargar.");
      setRecetas(j.recetas); setGrupos(j.grupos || []); setEstado("ok");
    } catch (e) { setErr(e instanceof Error ? e.message : "Error."); setEstado("error"); }
  }
  useEffect(() => { cargar(); }, []);

  // Llama a la API y refresca recetas+grupos con la respuesta.
  async function accion(body: Record<string, unknown>): Promise<boolean> {
    try {
      const j = await (await fetch("/api/recetas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).json();
      if (!j.ok) throw new Error(j.error || "No se pudo guardar.");
      setRecetas(j.recetas); setGrupos(j.grupos || []);
      return true;
    } catch (e) { setErr(e instanceof Error ? e.message : "Error."); return false; }
  }

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

  // Agrupar (respeta el orden que ya trae el server: grupo -> orden -> desc).
  const secciones = useMemo(() => {
    const orden = [...grupos, SIN_GRUPO];
    const byGrupo = new Map<string, RecetaCosteada[]>();
    for (const r of filtrados) {
      const g = r.grupo && grupos.includes(r.grupo) ? r.grupo : SIN_GRUPO;
      (byGrupo.get(g) ?? byGrupo.set(g, []).get(g)!).push(r);
    }
    return orden.map((g) => ({ grupo: g, items: byGrupo.get(g) ?? [] })).filter((s) => s.items.length > 0);
  }, [filtrados, grupos]);

  const kpis = useMemo(() => ({
    total: recetas.length,
    sinReceta: recetas.filter((r) => r.sinReceta).length,
    conFaltantes: recetas.filter((r) => r.nFaltantes > 0).length,
  }), [recetas]);

  function onGuardado(rs: RecetaCosteada[], gs?: string[]) {
    setRecetas(rs); if (gs) setGrupos(gs); setEditar(null);
    if (detalle) setDetalle(rs.find((r) => r.skuTango === detalle.skuTango) ?? null);
  }

  // Reordenar productos dentro de un grupo (▲▼): recalcula orden 1..n y persiste.
  async function moverProducto(items: RecetaCosteada[], grupo: string, index: number, dir: -1 | 1) {
    const arr = [...items]; const j = index + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[index], arr[j]] = [arr[j], arr[index]];
    setGuardandoOrden(true);
    await accion({ accion: "reordenar", items: arr.map((r, i) => ({ skuTango: r.skuTango, orden: i + 1, grupo: grupo === SIN_GRUPO ? "" : grupo })) });
    setGuardandoOrden(false);
  }
  // Reordenar grupos (▲▼).
  async function moverGrupo(grupo: string, dir: -1 | 1) {
    const i = grupos.indexOf(grupo); const j = i + dir;
    if (i < 0 || j < 0 || j >= grupos.length) return;
    const arr = [...grupos]; [arr[i], arr[j]] = [arr[j], arr[i]];
    setGuardandoOrden(true);
    await accion({ accion: "grupos", grupos: arr });
    setGuardandoOrden(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold text-ink">Recetas y productos</h1>
          <p className="mt-0.5 max-w-2xl text-sm text-muted">
            Maestro de productos por <b>grupo</b>, con su <b>costo de receta</b> calculado en vivo contra Insumos y el <b>canal de venta</b>.
            Un producto puede existir sin receta cargada. Cada cambio de receta guarda una <b>versión</b>.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setGestionGrupos(true)}>Grupos</Button>
          <Button variant="outline" onClick={() => setOrdenando((v) => !v)}>{ordenando ? "Listo" : "Ordenar"}</Button>
          <Button onClick={() => setEditar({ skuTango: "", descripcion: "", marca: "Mr. Tasty", version: 0, fecha: "", nVersiones: 0, componentes: [], costoNeto: 0, costoConImp: 0, nFaltantes: 0, canales: [] })}>+ Nuevo producto</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Productos" value={String(kpis.total)} />
        <Kpi label="Sin receta" value={String(kpis.sinReceta)} sub="en el maestro, a costear" tone={kpis.sinReceta ? "warn" : undefined} />
        <Kpi label="Con insumo faltante" value={String(kpis.conFaltantes)} sub="a completar en Insumos" tone={kpis.conFaltantes ? "warn" : undefined} />
        <Kpi label="Grupos" value={String(grupos.length)} />
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

      {ordenando && <p className="rounded-lg bg-action/10 px-3 py-2 text-2xs text-action">Modo ordenar: usá ▲▼ para acomodar productos dentro de cada grupo y los grupos entre sí. Se guarda solo. {guardandoOrden && "· guardando…"}</p>}

      <Card className="overflow-hidden">
        {estado === "loading" ? (
          <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
        ) : estado === "error" ? (
          <div className="p-4"><ErrorState msg={err} onRetry={cargar} /></div>
        ) : secciones.length === 0 ? (
          <div className="p-6"><EmptyState title="Sin productos" desc="Cambiá el filtro o cargá uno nuevo." /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-2xs uppercase tracking-wide text-faint">
                  {ordenando && <th className="px-2 py-2"></th>}
                  <th className="px-4 py-2 font-medium">Producto</th>
                  <th className="px-3 py-2 font-medium">Marca</th>
                  <th className="px-3 py-2 font-medium">Canal</th>
                  <th className="px-3 py-2 text-center font-medium">Comp.</th>
                  <th className="px-3 py-2 text-right font-medium">Costo neto</th>
                  <th className="px-3 py-2 text-right font-medium">c/ imp.</th>
                  <th className="px-3 py-2 text-center font-medium">Ver.</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {secciones.map(({ grupo, items }, gi) => (
                  <GrupoSeccion
                    key={grupo}
                    grupo={grupo}
                    items={items}
                    ordenando={ordenando}
                    esPrimerGrupo={gi === 0}
                    esUltimoGrupo={gi === secciones.length - 1}
                    puedeMoverGrupo={grupo !== SIN_GRUPO}
                    onMoverGrupo={(dir) => moverGrupo(grupo, dir)}
                    onMoverProducto={(i, dir) => moverProducto(items, grupo, i, dir)}
                    onVer={(r) => setDetalle(r)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {detalle && <Detalle receta={detalle} onClose={() => setDetalle(null)} onEditar={() => setEditar(detalle)} />}
      {editar && <Editor receta={editar} grupos={grupos} onClose={() => setEditar(null)} onGuardado={onGuardado} />}
      {gestionGrupos && <GruposManager grupos={grupos} accion={accion} onClose={() => setGestionGrupos(false)} />}
    </div>
  );
}

function GrupoSeccion({ grupo, items, ordenando, esPrimerGrupo, esUltimoGrupo, puedeMoverGrupo, onMoverGrupo, onMoverProducto, onVer }: {
  grupo: string; items: RecetaCosteada[]; ordenando: boolean; esPrimerGrupo: boolean; esUltimoGrupo: boolean;
  puedeMoverGrupo: boolean; onMoverGrupo: (dir: -1 | 1) => void; onMoverProducto: (i: number, dir: -1 | 1) => void; onVer: (r: RecetaCosteada) => void;
}) {
  const cols = ordenando ? 9 : 8;
  return (
    <>
      <tr className="bg-ink/[0.03]">
        <td colSpan={cols} className="px-4 py-1.5">
          <div className="flex items-center gap-2">
            {ordenando && puedeMoverGrupo && (
              <span className="flex flex-col leading-none">
                <button disabled={esPrimerGrupo} onClick={() => onMoverGrupo(-1)} className="text-2xs text-muted hover:text-ink disabled:opacity-20" title="Subir grupo">▲</button>
                <button disabled={esUltimoGrupo} onClick={() => onMoverGrupo(1)} className="text-2xs text-muted hover:text-ink disabled:opacity-20" title="Bajar grupo">▼</button>
              </span>
            )}
            <span className="text-2xs font-semibold uppercase tracking-wide text-muted">{grupo}</span>
            <span className="text-2xs text-faint">· {items.length}</span>
          </div>
        </td>
      </tr>
      {items.map((r, i) => (
        <tr key={r.skuTango} onClick={() => !ordenando && onVer(r)} className={`border-b border-line last:border-0 ${ordenando ? "" : "cursor-pointer hover:bg-ink/5"}`}>
          {ordenando && (
            <td className="px-2 py-2">
              <span className="flex flex-col leading-none">
                <button disabled={i === 0} onClick={() => onMoverProducto(i, -1)} className="text-2xs text-muted hover:text-ink disabled:opacity-20" title="Subir">▲</button>
                <button disabled={i === items.length - 1} onClick={() => onMoverProducto(i, 1)} className="text-2xs text-muted hover:text-ink disabled:opacity-20" title="Bajar">▼</button>
              </span>
            </td>
          )}
          <td className="px-4 py-2">
            <div className="font-medium text-ink">{r.descripcion}</div>
            <div className="text-2xs text-faint">SKU {r.skuTango}</div>
          </td>
          <td className="px-3 py-2 text-muted">{r.marca}</td>
          <td className="px-3 py-2"><CanalesBadges canales={r.canales} /></td>
          <td className="px-3 py-2 text-center text-muted">
            {r.sinReceta ? <Badge tone="warn">sin receta</Badge> : r.componentes.length}
            {r.nFaltantes > 0 && <span className="ml-1"><Badge tone="warn">{r.nFaltantes} falta</Badge></span>}
          </td>
          <td className="px-3 py-2 text-right font-mono tnum font-semibold text-ink monto">{r.sinReceta ? "—" : money(r.costoNeto)}</td>
          <td className="px-3 py-2 text-right font-mono tnum text-muted monto">{r.sinReceta ? "—" : money(r.costoConImp)}</td>
          <td className="px-3 py-2 text-center text-2xs text-faint">{r.version ? `v${r.version}` : "—"}</td>
          <td className="px-3 py-2 text-right">{!ordenando && <span className="text-2xs text-action">Ver →</span>}</td>
        </tr>
      ))}
    </>
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

function GruposManager({ grupos, accion, onClose }: { grupos: string[]; accion: (b: Record<string, unknown>) => Promise<boolean>; onClose: () => void }) {
  const [nuevo, setNuevo] = useState("");
  const [editIdx, setEditIdx] = useState(-1);
  const [editNombre, setEditNombre] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(body: Record<string, unknown>) { setBusy(true); await accion(body); setBusy(false); }
  const agregar = async () => { const n = nuevo.trim(); if (!n) return; await run({ accion: "grupos", grupos: [...grupos, n] }); setNuevo(""); };
  const mover = (i: number, dir: -1 | 1) => { const j = i + dir; if (j < 0 || j >= grupos.length) return; const a = [...grupos]; [a[i], a[j]] = [a[j], a[i]]; run({ accion: "grupos", grupos: a }); };
  const renombrar = async (de: string) => { const a = editNombre.trim(); if (!a || a === de) { setEditIdx(-1); return; } await run({ accion: "renombrar-grupo", de, a }); setEditIdx(-1); };
  const eliminar = (nombre: string) => { if (confirm(`¿Eliminar el grupo "${nombre}"? Los productos quedan sin grupo (no se borran).`)) run({ accion: "eliminar-grupo", nombre }); };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-card border border-line bg-surface p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <h2 className="font-display text-lg font-semibold text-ink">Grupos de productos</h2>
          <button onClick={onClose} className="rounded-lg px-2 text-lg text-muted hover:text-ink">✕</button>
        </div>
        <p className="mt-1 text-2xs text-faint">Ordenalos con ▲▼. Renombrar o eliminar mantiene los productos (los deja sin grupo).</p>

        <div className="mt-4 flex gap-2">
          <input className={`${inputClass} flex-1`} placeholder="nuevo grupo…" value={nuevo} onChange={(e) => setNuevo(e.target.value)} onKeyDown={(e) => e.key === "Enter" && agregar()} />
          <Button onClick={agregar} disabled={busy || !nuevo.trim()}>Agregar</Button>
        </div>

        <ul className="mt-4 divide-y divide-line rounded-lg border border-line">
          {grupos.length === 0 && <li className="px-3 py-3 text-2xs text-faint">Todavía no hay grupos. Creá el primero arriba.</li>}
          {grupos.map((g, i) => (
            <li key={g} className="flex items-center gap-2 px-3 py-2">
              <span className="flex flex-col leading-none">
                <button disabled={i === 0 || busy} onClick={() => mover(i, -1)} className="text-2xs text-muted hover:text-ink disabled:opacity-20">▲</button>
                <button disabled={i === grupos.length - 1 || busy} onClick={() => mover(i, 1)} className="text-2xs text-muted hover:text-ink disabled:opacity-20">▼</button>
              </span>
              {editIdx === i ? (
                <input autoFocus className={`${inputClass} flex-1`} value={editNombre} onChange={(e) => setEditNombre(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") renombrar(g); if (e.key === "Escape") setEditIdx(-1); }} onBlur={() => renombrar(g)} />
              ) : (
                <span className="flex-1 text-sm text-ink">{g}</span>
              )}
              <button onClick={() => { setEditIdx(i); setEditNombre(g); }} className="text-2xs text-action hover:underline" disabled={busy}>Renombrar</button>
              <button onClick={() => eliminar(g)} className="text-2xs text-bad hover:underline" disabled={busy}>Eliminar</button>
            </li>
          ))}
        </ul>

        <div className="mt-5 flex justify-end"><Button variant="outline" onClick={onClose}>Cerrar</Button></div>
      </div>
    </div>
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
            <p className="mt-0.5 text-2xs text-faint">
              SKU {receta.skuTango} · {receta.marca}{receta.grupo ? ` · ${receta.grupo}` : ""}
              {receta.version ? ` · versión ${receta.version} (${receta.fecha})` : " · sin receta"}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg px-2 text-lg text-muted hover:text-ink">✕</button>
        </div>

        <div className="mt-3 flex items-center gap-2 text-2xs text-faint">Canal de venta: <CanalesBadges canales={receta.canales} /></div>

        {receta.sinReceta ? (
          <p className="mt-4 rounded-lg bg-warn/10 px-3 py-2 text-sm text-warn">Este producto todavía no tiene receta cargada. Editalo para agregar los componentes y costearlo.</p>
        ) : (
          <>
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
          </>
        )}

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
          <Button onClick={onEditar}>Editar producto</Button>
        </div>
      </div>
    </div>
  );
}

function Editor({ receta, grupos, onClose, onGuardado }: { receta: RecetaCosteada; grupos: string[]; onClose: () => void; onGuardado: (rs: RecetaCosteada[], gs?: string[]) => void }) {
  const nuevo = !receta.skuTango;
  const [sku, setSku] = useState(receta.skuTango);
  const [desc, setDesc] = useState(receta.descripcion);
  const [marca, setMarca] = useState(receta.marca);
  const [grupo, setGrupo] = useState(receta.grupo ?? "");
  const [canales, setCanales] = useState<CanalVenta[]>(receta.canales ?? []);
  const [comps, setComps] = useState<Componente[]>(receta.componentes.map((c) => ({ insumoCod: c.insumoCod, cant: c.cant })));
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  // Componentes originales -> para saber si la receta cambió (y evitar versiones al pedo).
  const compsOrig = useMemo(() => JSON.stringify(receta.componentes.map((c) => ({ insumoCod: c.insumoCod, cant: c.cant }))), [receta]);

  useEffect(() => {
    fetch("/api/insumos").then((r) => r.json()).then((j) => { if (j.ok) setInsumos(j.insumos); }).catch(() => {});
  }, []);

  const idx = useMemo(() => { const m = new Map<string, Insumo>(); for (const i of insumos) m.set(i.cod.toLowerCase(), i); return m; }, [insumos]);
  const costo = comps.reduce((a, c) => a + (idx.get(c.insumoCod.toLowerCase())?.precioUnidad ?? 0) * (Number(c.cant) || 0), 0);

  const setComp = (i: number, patch: Partial<Componente>) => setComps((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const addComp = () => setComps((cs) => [...cs, { insumoCod: "", cant: 1 }]);
  const delComp = (i: number) => setComps((cs) => cs.filter((_, j) => j !== i));
  const toggleCanal = (c: CanalVenta) => setCanales((cs) => (cs.includes(c) ? cs.filter((x) => x !== c) : [...cs, c]));

  async function submit() {
    setError("");
    if (!sku.trim()) return setError("Falta el SKU de Tango.");
    const limpio = comps.filter((c) => c.insumoCod && Number(c.cant) > 0);
    const recetaCambio = JSON.stringify(limpio) !== compsOrig;
    const meta = { skuTango: sku.trim(), descripcion: desc, marca, grupo, canales };
    // Si hay componentes y la receta cambió (o es nueva con receta) -> guarda VERSIÓN.
    // Si no, guarda solo la metadata del producto (sin crear versión al pedo).
    const body = limpio.length && (recetaCambio || nuevo)
      ? { ...meta, componentes: limpio }
      : { accion: "producto", ...meta };
    setGuardando(true);
    try {
      const j = await (await fetch("/api/recetas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).json();
      if (!j.ok) throw new Error(j.error || "No se pudo guardar.");
      onGuardado(j.recetas, j.grupos);
    } catch (e) { setError(e instanceof Error ? e.message : "Error."); setGuardando(false); }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-card border border-line bg-surface p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <h2 className="font-display text-lg font-semibold text-ink">{nuevo ? "Nuevo producto" : `Editar · ${receta.descripcion}`}</h2>
          <button onClick={onClose} className="rounded-lg px-2 text-lg text-muted hover:text-ink">✕</button>
        </div>
        <p className="mt-1 text-2xs text-faint">
          {nuevo ? "Podés crear el producto con o sin receta. Los componentes son opcionales." : `Cambiar la receta crea la versión v${receta.nVersiones + 1}; cambiar grupo/canal/descripción no crea versión.`}
        </p>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
          <Field label="SKU Tango"><input className={inputClass} value={sku} disabled={!nuevo} onChange={(e) => setSku(e.target.value)} /></Field>
          <div className="sm:col-span-2"><Field label="Descripción"><input className={inputClass} value={desc} onChange={(e) => setDesc(e.target.value)} /></Field></div>
          <Field label="Marca">
            <select className={inputClass} value={marca} onChange={(e) => setMarca(e.target.value)}>
              {["Mr. Tasty", "Mila & Go", "El Desembarco"].map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Grupo">
            <input className={inputClass} list="grupos-list" placeholder="grupo (elegí o escribí uno nuevo)…" value={grupo} onChange={(e) => setGrupo(e.target.value)} />
            <datalist id="grupos-list">{grupos.map((g) => <option key={g} value={g} />)}</datalist>
          </Field>
          <div>
            <p className="mb-1 text-2xs font-medium uppercase tracking-wide text-faint">Canal de venta</p>
            <div className="flex flex-wrap gap-3 pt-1">
              {CANALES_VENTA.map((c) => (
                <label key={c.id} className="flex items-center gap-1.5 text-sm text-ink">
                  <input type="checkbox" checked={canales.includes(c.id)} onChange={() => toggleCanal(c.id)} />
                  {c.label}
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-2xs font-medium uppercase tracking-wide text-faint">Componentes de la receta <span className="text-faint">(opcional)</span></p>
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
            {comps.length === 0 && <p className="text-2xs text-faint">Sin componentes. Es un producto del maestro sin receta (podés agregarla ahora o después).</p>}
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between rounded-lg bg-ink/[0.03] px-4 py-3">
          <span className="text-2xs uppercase tracking-wide text-faint">Costo de receta (neto)</span>
          <span className="font-mono tnum text-lg font-semibold text-ink monto">{money(costo)}</span>
        </div>

        {error && <p className="mt-3 text-sm text-bad">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={guardando}>{guardando ? "Guardando…" : nuevo ? "Crear producto" : "Guardar"}</Button>
        </div>
      </div>
    </div>
  );
}
