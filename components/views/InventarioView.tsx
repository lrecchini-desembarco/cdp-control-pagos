"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, Field, inputClass, Button, Skeleton, EmptyState } from "@/components/ui/primitives";
import { descargarCSV } from "@/lib/exportar-csv";
import { ESTADOS_INV, CATEGORIAS_INV, estadoInv, type GrupoInv } from "@/lib/inventario";

interface Item {
  id: string;
  nombre: string;
  categoria: string;
  cantidad: number;
  estado: string;
  nota?: string;
  actualizado: string;
}

const toneCls = (t: string) =>
  ({
    ok: "bg-ok/10 text-ok border-ok/30",
    action: "bg-action/10 text-action border-action/30",
    warn: "bg-warn/10 text-warn border-warn/30",
    bad: "bg-bad/10 text-bad border-bad/30",
    neutral: "bg-ink/5 text-muted border-line",
    muted: "bg-ink/5 text-faint border-line",
  }[t] || "bg-ink/5 text-muted border-line");

const fecha = (iso: string) =>
  iso ? new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" }) : "";

export default function InventarioView() {
  const [items, setItems] = useState<Item[]>([]);
  const [estado, setEstado] = useState<"loading" | "ok" | "error">("loading");
  const [nuevo, setNuevo] = useState({ nombre: "", categoria: "Notebooks", cantidad: 1, estado: "por-comprar", nota: "" });
  const [q, setQ] = useState("");
  const [fGrupo, setFGrupo] = useState<"todos" | GrupoInv>("todos");
  const [fCat, setFCat] = useState("");
  const [msg, setMsg] = useState("");

  async function cargar() {
    setEstado("loading");
    try {
      const j = await (await fetch("/api/inventario")).json();
      if (!j.ok) throw new Error();
      setItems(j.items);
      setEstado("ok");
    } catch {
      setEstado("error");
    }
  }
  useEffect(() => { cargar(); }, []);

  async function guardar(patch: Record<string, unknown>) {
    try {
      const j = await (
        await fetch("/api/inventario", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) })
      ).json();
      if (j.ok) setItems(j.items);
      else setMsg(j.error || "No se pudo guardar.");
    } catch {
      setMsg("Error de red.");
    }
  }

  // Edición: actualiza en pantalla al toque (optimista) y persiste.
  function editar(id: string, patch: Partial<Item>, persistir = true) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
    if (persistir) guardar({ id, ...patch });
  }

  async function agregar(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    if (!nuevo.nombre.trim()) return;
    await guardar(nuevo);
    setNuevo({ nombre: "", categoria: nuevo.categoria, cantidad: 1, estado: "por-comprar", nota: "" });
  }

  async function quitar(id: string, nombre: string) {
    if (!confirm(`¿Quitar "${nombre}" del inventario?`)) return;
    const j = await (await fetch(`/api/inventario?id=${encodeURIComponent(id)}`, { method: "DELETE" })).json();
    if (j.ok) setItems(j.items);
  }

  const filtrados = useMemo(() => {
    let l = items;
    if (fGrupo !== "todos") l = l.filter((it) => estadoInv(it.estado).grupo === fGrupo);
    if (fCat) l = l.filter((it) => it.categoria === fCat);
    const t = q.trim().toLowerCase();
    if (t) l = l.filter((it) => `${it.nombre} ${it.categoria} ${it.nota ?? ""}`.toLowerCase().includes(t));
    return l;
  }, [items, fGrupo, fCat, q]);

  const kpis = useMemo(() => {
    const suma = (pred: (it: Item) => boolean) => items.filter(pred).reduce((s, it) => s + (it.cantidad || 0), 0);
    return {
      stock: suma((it) => estadoInv(it.estado).grupo === "tenemos"),
      listos: suma((it) => it.estado === "listo"),
      porComprar: suma((it) => it.estado === "por-comprar"),
      enCamino: suma((it) => ["pedido", "comprado", "llego"].includes(it.estado)),
    };
  }, [items]);

  function exportar() {
    descargarCSV(
      "inventario-it",
      ["Ítem", "Categoría", "Cantidad", "Estado", "Nota", "Actualizado"],
      filtrados.map((it) => [it.nombre, it.categoria, it.cantidad, estadoInv(it.estado).label, it.nota ?? "", fecha(it.actualizado)])
    );
  }

  const grupos: { id: "todos" | GrupoInv; label: string }[] = [
    { id: "todos", label: "Todo" },
    { id: "tenemos", label: "Tenemos" },
    { id: "comprar", label: "A comprar" },
    { id: "otros", label: "Bajas" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold text-ink">Inventario · IT / Infraestructura</h1>
          <p className="mt-0.5 max-w-2xl text-sm text-muted">
            Qué recursos tenemos, en qué estado están y qué falta comprar. Editá la cantidad y el estado directo en la tabla.
          </p>
        </div>
        <Button variant="outline" onClick={exportar} disabled={!filtrados.length}>⬇ Exportar</Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="En stock" value={kpis.stock} sub="unidades que tenemos" tone="ok" />
        <Kpi label="Listos para usar" value={kpis.listos} sub="ya operativos" />
        <Kpi label="Por comprar" value={kpis.porComprar} sub="falta pedir" tone={kpis.porComprar ? "bad" : undefined} />
        <Kpi label="En camino" value={kpis.enCamino} sub="pedido / comprado / llegó" tone={kpis.enCamino ? "warn" : undefined} />
      </div>

      {/* Alta */}
      <Card className="p-4">
        <p className="mb-2 text-2xs font-medium uppercase tracking-wide text-faint">Agregar recurso</p>
        <form onSubmit={agregar} className="grid grid-cols-1 gap-3 sm:grid-cols-[1.4fr_1fr_80px_1fr_auto] sm:items-end">
          <Field label="Ítem">
            <input className={inputClass} placeholder="Notebook, Mouse, Monitor 24…" value={nuevo.nombre} onChange={(e) => setNuevo((n) => ({ ...n, nombre: e.target.value }))} />
          </Field>
          <Field label="Categoría">
            <select className={inputClass} value={nuevo.categoria} onChange={(e) => setNuevo((n) => ({ ...n, categoria: e.target.value }))}>
              {CATEGORIAS_INV.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Cant.">
            <input type="number" min={0} className={inputClass} value={nuevo.cantidad} onChange={(e) => setNuevo((n) => ({ ...n, cantidad: Number(e.target.value) }))} />
          </Field>
          <Field label="Estado">
            <select className={inputClass} value={nuevo.estado} onChange={(e) => setNuevo((n) => ({ ...n, estado: e.target.value }))}>
              {ESTADOS_INV.map((es) => <option key={es.id} value={es.id}>{es.label}</option>)}
            </select>
          </Field>
          <Button type="submit" disabled={!nuevo.nombre.trim()}>Agregar</Button>
        </form>
        <input className={`${inputClass} mt-3`} placeholder="Nota (opcional): marca, modelo, para quién, presupuesto…" value={nuevo.nota} onChange={(e) => setNuevo((n) => ({ ...n, nota: e.target.value }))} />
        {msg && <p className="mt-2 text-2xs text-bad">{msg}</p>}
      </Card>

      {/* Filtros */}
      <Card className="flex flex-wrap items-center gap-3 p-3">
        <div className="flex flex-wrap gap-1.5">
          {grupos.map((g) => (
            <button key={g.id} onClick={() => setFGrupo(g.id)}
              className={`rounded-full border px-3 py-1 text-2xs font-medium ${fGrupo === g.id ? "border-action bg-action/10 text-action" : "border-line bg-surface text-muted hover:text-ink"}`}>
              {g.label}
            </button>
          ))}
        </div>
        <select className={`${inputClass} max-w-[180px] py-1`} value={fCat} onChange={(e) => setFCat(e.target.value)}>
          <option value="">Todas las categorías</option>
          {CATEGORIAS_INV.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input className={`${inputClass} max-w-[220px] py-1`} placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="ml-auto text-2xs text-faint">{filtrados.length} ítems</span>
      </Card>

      {/* Tabla */}
      <Card className="overflow-hidden">
        {estado === "loading" ? (
          <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
        ) : estado === "error" ? (
          <div className="p-4 text-sm text-bad">No se pudo cargar el inventario.</div>
        ) : filtrados.length === 0 ? (
          <EmptyState title="Sin ítems" desc="Agregá el primer recurso arriba (ej: 4 notebooks listas, 10 mouse por comprar…)." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-2xs uppercase tracking-wide text-faint">
                  <th className="px-4 py-2 font-medium">Ítem</th>
                  <th className="px-3 py-2 font-medium">Categoría</th>
                  <th className="px-3 py-2 text-center font-medium">Cant.</th>
                  <th className="px-3 py-2 font-medium">Estado</th>
                  <th className="px-3 py-2 font-medium">Nota</th>
                  <th className="px-3 py-2 font-medium">Act.</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((it) => {
                  const es = estadoInv(it.estado);
                  return (
                    <tr key={it.id} className="border-b border-line/70 last:border-0 hover:bg-ink/[0.02]">
                      <td className="px-4 py-2 font-medium text-ink">{it.nombre}</td>
                      <td className="px-3 py-2">
                        <select className="rounded-md border border-line bg-surface px-2 py-1 text-2xs text-muted" value={it.categoria} onChange={(e) => editar(it.id, { categoria: e.target.value })}>
                          {CATEGORIAS_INV.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <div className="inline-flex items-center gap-1">
                          <button onClick={() => editar(it.id, { cantidad: Math.max(0, it.cantidad - 1) })} className="grid h-6 w-6 place-items-center rounded border border-line text-muted hover:text-ink">−</button>
                          <input type="number" min={0} value={it.cantidad}
                            onChange={(e) => editar(it.id, { cantidad: Math.max(0, Number(e.target.value) || 0) }, false)}
                            onBlur={(e) => guardar({ id: it.id, cantidad: Math.max(0, Number(e.target.value) || 0) })}
                            className="w-12 rounded-md border border-line bg-surface px-1 py-1 text-center font-mono tnum text-ink" />
                          <button onClick={() => editar(it.id, { cantidad: it.cantidad + 1 })} className="grid h-6 w-6 place-items-center rounded border border-line text-muted hover:text-ink">+</button>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <select value={it.estado} onChange={(e) => editar(it.id, { estado: e.target.value })}
                          className={`rounded-full border px-2.5 py-1 text-2xs font-medium ${toneCls(es.tone)}`}>
                          {ESTADOS_INV.map((e2) => <option key={e2.id} value={e2.id} className="bg-surface text-ink">{e2.label}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input defaultValue={it.nota ?? ""} placeholder="—"
                          onBlur={(e) => { if (e.target.value !== (it.nota ?? "")) guardar({ id: it.id, nota: e.target.value }); }}
                          className="w-40 rounded-md border border-transparent bg-transparent px-1 py-1 text-2xs text-muted hover:border-line focus:border-action focus:bg-surface" />
                      </td>
                      <td className="px-3 py-2 text-2xs text-faint">{fecha(it.actualizado)}</td>
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

function Kpi({ label, value, sub, tone }: { label: string; value: number; sub?: string; tone?: "ok" | "warn" | "bad" }) {
  const c = tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : tone === "bad" ? "text-bad" : "text-ink";
  return (
    <Card className="p-3">
      <p className="text-2xs uppercase tracking-wide text-faint">{label}</p>
      <p className={`mt-0.5 font-display text-2xl font-semibold ${c}`}>{value.toLocaleString("es-AR")}</p>
      {sub && <p className="text-2xs text-faint">{sub}</p>}
    </Card>
  );
}
