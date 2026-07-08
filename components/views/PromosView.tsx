"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, Field, inputClass, Button, Badge, Skeleton, EmptyState, ErrorState } from "@/components/ui/primitives";
import type { PromoProducto, PromoProductoCosteado } from "@/lib/promos";

const money = (n: number) => "$" + Math.round(n).toLocaleString("es-AR");
const pct = (n: number) => `${Math.round(n * 100)}%`;

interface PromoC {
  id: string; nombre: string; descripcion?: string; tipo: "salon" | "apps";
  listaId: string; marca: string; canal?: string; fechaInicio: string; fechaFin: string;
  pisoPct?: number; aprobada: boolean; productos: PromoProducto[];
  productosCosteados: PromoProductoCosteado[]; margenPromoTotal: number; margenRegularTotal: number;
}
interface ListaMeta { id: string; nombre: string; tipo: string; marca: string; }
interface Canal { id: string; nombre: string; }

export default function PromosView() {
  const [promos, setPromos] = useState<PromoC[]>([]);
  const [estado, setEstado] = useState<"loading" | "ok" | "error">("loading");
  const [err, setErr] = useState("");
  const [abierta, setAbierta] = useState<string | null>(null);
  const [edit, setEdit] = useState<PromoC | "nuevo" | null>(null);

  async function cargar() {
    setEstado("loading"); setErr("");
    try {
      const j = await (await fetch("/api/promos")).json();
      if (!j.ok) throw new Error(j.error || "No se pudo cargar.");
      setPromos(j.promos); setEstado("ok");
    } catch (e) { setErr(e instanceof Error ? e.message : "Error."); setEstado("error"); }
  }
  useEffect(() => { cargar(); }, []);

  async function aprobar(id: string, aprobada: boolean) {
    const j = await (await fetch("/api/promos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, aprobada }) })).json();
    if (j.ok) setPromos(j.promos);
  }
  async function borrar(id: string) {
    if (!confirm("¿Borrar esta promoción?")) return;
    const j = await (await fetch(`/api/promos?id=${id}`, { method: "DELETE" })).json();
    if (j.ok) setPromos(j.promos);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold text-ink">Promociones</h1>
          <p className="mt-0.5 max-w-2xl text-sm text-muted">
            Armá una promo (salón o por canal de apps), aplicá el descuento y mirá el <b>CMV y el margen resultantes</b>.
            El costo sale de las recetas y el margen usa los parámetros de la lista/canal. Aprobá cuando esté OK.
          </p>
        </div>
        <Button onClick={() => setEdit("nuevo")}>+ Nueva promo</Button>
      </div>

      {estado === "loading" ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : estado === "error" ? (
        <ErrorState msg={err} onRetry={cargar} />
      ) : promos.length === 0 ? (
        <EmptyState title="Sin promociones" desc="Creá la primera con “+ Nueva promo”." />
      ) : (
        <div className="space-y-3">
          {promos.map((p) => {
            const open = abierta === p.id;
            return (
              <Card key={p.id} className="overflow-hidden">
                <div className="flex flex-wrap items-center gap-3 p-4">
                  <button onClick={() => setAbierta(open ? null : p.id)} className="flex-1 text-left">
                    <div className="flex items-center gap-2">
                      <span className="font-display text-sm font-semibold text-ink">{p.nombre}</span>
                      <Badge tone={p.tipo === "apps" ? "action" : "neutral"}>{p.tipo === "apps" ? `Apps · ${p.canal}` : "Salón"}</Badge>
                      {p.aprobada ? <Badge tone="ok">Aprobada</Badge> : <Badge tone="warn">Pendiente</Badge>}
                    </div>
                    <p className="mt-0.5 text-2xs text-faint">{p.marca} · {p.fechaInicio}{p.fechaFin !== p.fechaInicio ? ` → ${p.fechaFin}` : ""} · {p.productos.length} producto(s)</p>
                  </button>
                  <div className="text-right">
                    <p className="text-2xs uppercase tracking-wide text-faint">Margen promo</p>
                    <p className={`font-mono tnum text-sm font-semibold ${p.margenPromoTotal < 0 ? "text-bad" : "text-ink"}`}>{money(p.margenPromoTotal)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => aprobar(p.id, !p.aprobada)} className={`rounded-lg px-2.5 py-1 text-2xs font-medium ${p.aprobada ? "bg-ink/5 text-muted hover:bg-ink/10" : "bg-ok/10 text-ok hover:bg-ok/20"}`}>{p.aprobada ? "Desaprobar" : "Aprobar"}</button>
                    <button onClick={() => setEdit(p)} className="text-2xs text-action hover:underline">Editar</button>
                    <button onClick={() => borrar(p.id)} className="text-2xs text-bad hover:underline">Borrar</button>
                  </div>
                </div>
                {open && (
                  <div className="border-t border-line bg-ink/[0.015] px-4 py-3">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-2xs">
                        <thead className="uppercase tracking-wide text-faint">
                          <tr>
                            <th className="py-1 pr-3 font-medium">Producto</th>
                            <th className="py-1 px-2 text-right font-medium">Regular</th>
                            <th className="py-1 px-2 text-right font-medium">Promo</th>
                            <th className="py-1 px-2 text-right font-medium">Desc.</th>
                            <th className="py-1 px-2 text-right font-medium">CMV promo</th>
                            <th className="py-1 px-2 text-right font-medium">Margen regular</th>
                            <th className="py-1 px-2 text-right font-medium">Margen promo</th>
                          </tr>
                        </thead>
                        <tbody className="text-sm">
                          {p.productosCosteados.map((c) => (
                            <tr key={c.skuTango} className="border-t border-line/60">
                              <td className="py-1.5 pr-3 text-ink">{c.descripcion}{c.recetaFalta && <span className="ml-1 text-2xs text-warn">· sin receta</span>}</td>
                              <td className="py-1.5 px-2 text-right font-mono tnum text-muted">{money(c.precioRegular)}</td>
                              <td className="py-1.5 px-2 text-right font-mono tnum text-ink">{money(c.precioPromo)}</td>
                              <td className="py-1.5 px-2 text-right font-mono tnum text-faint">{pct(c.descPct)}</td>
                              <td className="py-1.5 px-2 text-right font-mono tnum text-muted">{c.recetaFalta ? "—" : pct(c.cmvPromo)}</td>
                              <td className="py-1.5 px-2 text-right font-mono tnum text-faint">{c.recetaFalta ? "—" : money(c.margenRegular)}</td>
                              <td className={`py-1.5 px-2 text-right font-mono tnum font-semibold ${c.recetaFalta ? "text-faint" : c.margenPromo < 0 ? "text-bad" : c.margenPromoPct < 0.15 ? "text-warn" : "text-ok"}`}>{c.recetaFalta ? "—" : money(c.margenPromo)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {p.descripcion && <p className="mt-2 text-2xs text-faint">{p.descripcion}</p>}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {edit && <Editor promo={edit === "nuevo" ? null : edit} onClose={() => setEdit(null)} onGuardado={(ps) => { setPromos(ps); setEdit(null); }} />}
    </div>
  );
}

function Editor({ promo, onClose, onGuardado }: { promo: PromoC | null; onClose: () => void; onGuardado: (ps: PromoC[]) => void }) {
  const nuevo = !promo;
  const [f, setF] = useState({
    nombre: promo?.nombre ?? "", descripcion: promo?.descripcion ?? "",
    tipo: promo?.tipo ?? "salon", listaId: promo?.listaId ?? "", canal: promo?.canal ?? "",
    fechaInicio: promo?.fechaInicio ?? new Date().toISOString().slice(0, 10),
    fechaFin: promo?.fechaFin ?? new Date().toISOString().slice(0, 10),
    pisoPct: promo?.pisoPct ?? 0,
  });
  const [prods, setProds] = useState<PromoProducto[]>(promo?.productos ?? []);
  const [listas, setListas] = useState<ListaMeta[]>([]);
  const [canales, setCanales] = useState<Canal[]>([]);
  const [productosLista, setProductosLista] = useState<{ skuTango: string; descripcion: string; precioVenta: number }[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const set = (k: string, v: unknown) => setF((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    fetch("/api/listas").then((r) => r.json()).then((j) => j.ok && setListas(j.listas)).catch(() => {});
    fetch("/api/apps").then((r) => r.json()).then((j) => j.ok && setCanales(j.canales)).catch(() => {});
  }, []);
  useEffect(() => {
    if (!f.listaId) { setProductosLista([]); return; }
    fetch(`/api/listas?id=${f.listaId}`).then((r) => r.json()).then((j) => { if (j.ok) setProductosLista(j.filas.map((x: any) => ({ skuTango: x.skuTango, descripcion: x.descripcion, precioVenta: x.precioVenta }))); }).catch(() => {});
  }, [f.listaId]);

  const listasFiltradas = listas.filter((l) => l.tipo === f.tipo);
  const marca = listas.find((l) => l.id === f.listaId)?.marca ?? "";

  async function submit() {
    setError("");
    if (!f.nombre.trim()) return setError("Ponele un nombre.");
    if (!f.listaId) return setError("Elegí una lista de precios.");
    if (f.tipo === "apps" && !f.canal) return setError("Elegí un canal.");
    const productos = prods.filter((p) => p.skuTango && (p.descPct || p.precioPromo));
    if (!productos.length) return setError("Agregá al menos un producto con descuento.");
    setGuardando(true);
    try {
      const body: any = { ...f, marca, productos, pisoPct: Number(f.pisoPct) || undefined };
      if (promo) body.id = promo.id;
      const j = await (await fetch("/api/promos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).json();
      if (!j.ok) throw new Error(j.error || "No se pudo guardar.");
      onGuardado(j.promos);
    } catch (e) { setError(e instanceof Error ? e.message : "Error."); setGuardando(false); }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-card border border-line bg-surface p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <h2 className="font-display text-lg font-semibold text-ink">{nuevo ? "Nueva promoción" : `Editar · ${promo!.nombre}`}</h2>
          <button onClick={onClose} className="rounded-lg px-2 text-lg text-muted hover:text-ink">✕</button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><Field label="Nombre"><input className={inputClass} value={f.nombre} onChange={(e) => set("nombre", e.target.value)} /></Field></div>
          <Field label="Tipo">
            <select className={inputClass} value={f.tipo} onChange={(e) => { set("tipo", e.target.value); set("listaId", ""); }}>
              <option value="salon">Salón / Mostrador</option>
              <option value="apps">Apps (por canal)</option>
            </select>
          </Field>
          {f.tipo === "apps" && (
            <Field label="Canal">
              <select className={inputClass} value={f.canal} onChange={(e) => set("canal", e.target.value)}>
                <option value="">— elegí —</option>
                {canales.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </Field>
          )}
          <Field label="Lista de precios">
            <select className={inputClass} value={f.listaId} onChange={(e) => set("listaId", e.target.value)}>
              <option value="">— elegí —</option>
              {listasFiltradas.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
            </select>
          </Field>
          <Field label="Desde"><input type="date" className={inputClass} value={f.fechaInicio} onChange={(e) => set("fechaInicio", e.target.value)} /></Field>
          <Field label="Hasta"><input type="date" className={inputClass} value={f.fechaFin} onChange={(e) => set("fechaFin", e.target.value)} /></Field>
          <div className="sm:col-span-2"><Field label="Descripción"><input className={inputClass} value={f.descripcion} onChange={(e) => set("descripcion", e.target.value)} /></Field></div>
        </div>

        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-2xs font-medium uppercase tracking-wide text-faint">Productos y descuento</p>
            <button onClick={() => setProds((p) => [...p, { skuTango: "", descPct: 0.1 }])} disabled={!f.listaId} className="text-2xs text-action hover:underline disabled:opacity-40">+ Agregar producto</button>
          </div>
          {!f.listaId ? (
            <p className="text-2xs text-faint">Elegí primero la lista de precios.</p>
          ) : (
            <div className="space-y-2">
              {prods.map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select className={`${inputClass} flex-1`} value={p.skuTango} onChange={(e) => setProds((ps) => ps.map((x, j) => (j === i ? { ...x, skuTango: e.target.value } : x)))}>
                    <option value="">— producto —</option>
                    {productosLista.map((x) => <option key={x.skuTango} value={x.skuTango}>{x.descripcion} ({money(x.precioVenta)})</option>)}
                  </select>
                  <div className="flex items-center gap-1">
                    <input type="number" className={`${inputClass} w-16`} value={Math.round((p.descPct ?? 0) * 100)} onChange={(e) => setProds((ps) => ps.map((x, j) => (j === i ? { ...x, descPct: (Number(e.target.value) || 0) / 100, precioPromo: undefined } : x)))} />
                    <span className="text-2xs text-faint">% off</span>
                  </div>
                  <button onClick={() => setProds((ps) => ps.filter((_, j) => j !== i))} className="px-1 text-muted hover:text-bad">✕</button>
                </div>
              ))}
              {prods.length === 0 && <p className="text-2xs text-faint">Sin productos. Agregá el primero.</p>}
            </div>
          )}
        </div>

        {error && <p className="mt-3 text-sm text-bad">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={guardando}>{guardando ? "Guardando…" : nuevo ? "Crear promo" : "Guardar"}</Button>
        </div>
      </div>
    </div>
  );
}
