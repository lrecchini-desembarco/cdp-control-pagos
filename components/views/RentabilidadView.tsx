"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, Field, inputClass, Skeleton, ErrorState } from "@/components/ui/primitives";
import { simularPromo, type FilaRentabilidad } from "@/lib/rentabilidad";
import type { Lista } from "@/lib/listas";

const money = (n: number) => "$" + Math.round(n).toLocaleString("es-AR");
const miles = (n: number) => (Math.abs(n) >= 1000 ? "$" + (n / 1000).toFixed(0) + "k" : money(n));
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
type ListaMeta = Omit<Lista, "precios"> & { nProductos: number };

export default function RentabilidadView() {
  const [listas, setListas] = useState<ListaMeta[]>([]);
  const [sel, setSel] = useState("");
  const [lista, setLista] = useState<Lista | null>(null);
  const [filas, setFilas] = useState<FilaRentabilidad[]>([]);
  const [total, setTotal] = useState({ margen: 0, facturacion: 0, unidades: 0, pierden: 0 });
  const [estado, setEstado] = useState<"loading" | "ok" | "error">("loading");
  const [err, setErr] = useState("");
  const [simSku, setSimSku] = useState("");
  const [desc, setDesc] = useState(20);
  const [uplift, setUplift] = useState(0);

  useEffect(() => {
    fetch("/api/rentabilidad").then((r) => r.json()).then((j) => {
      if (j.ok) { setListas(j.listas); if (j.listas[0]) setSel(j.listas[0].id); }
      else { setErr(j.error); setEstado("error"); }
    }).catch(() => setEstado("error"));
  }, []);

  async function cargar(id: string) {
    if (!id) return;
    setEstado("loading"); setErr("");
    try {
      const j = await (await fetch(`/api/rentabilidad?lista=${id}`)).json();
      if (!j.ok) throw new Error(j.error || "No se pudo cargar.");
      setLista(j.lista); setFilas(j.filas); setTotal(j.total); setSimSku(j.filas[0]?.skuTango ?? ""); setEstado("ok");
    } catch (e) { setErr(e instanceof Error ? e.message : "Error."); setEstado("error"); }
  }
  useEffect(() => { if (sel) cargar(sel); }, [sel]);

  const sim = useMemo(() => {
    const f = filas.find((x) => x.skuTango === simSku);
    if (!f || !lista) return null;
    return { f, r: simularPromo(f.precioVenta, f.costo, f.unidades, lista, desc / 100, uplift / 100) };
  }, [filas, simSku, lista, desc, uplift]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-xl font-semibold text-ink">Rentabilidad</h1>
        <p className="mt-0.5 max-w-2xl text-sm text-muted">
          Margen <b>× volumen real vendido</b> (Tango): quién aporta y quién resta plata. Y un
          <b> simulador de promo</b> que proyecta el margen total a un precio con descuento.
        </p>
      </div>

      <Card className="p-4">
        <Field label="Lista">
          <select className={`${inputClass} sm:w-80`} value={sel} onChange={(e) => setSel(e.target.value)}>
            {listas.map((l) => <option key={l.id} value={l.id}>{l.nombre} ({l.nProductos})</option>)}
          </select>
        </Field>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Margen total" value={miles(total.margen)} sub="período" tone={total.margen < 0 ? "bad" : "ok"} money />
        <Kpi label="Facturación" value={miles(total.facturacion)} money />
        <Kpi label="Margen %" value={total.facturacion ? pct(total.margen / total.facturacion) : "—"} />
        <Kpi label="Pierden plata" value={String(total.pierden)} sub="productos" tone={total.pierden ? "bad" : undefined} />
      </div>

      {/* Simulador */}
      <Card className="border-action/20 p-4">
        <p className="text-2xs font-medium uppercase tracking-wide text-faint">Simulador de promo</p>
        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-4">
          <Field label="Producto">
            <select className={inputClass} value={simSku} onChange={(e) => setSimSku(e.target.value)}>
              {filas.filter((f) => !f.recetaFalta).map((f) => <option key={f.skuTango} value={f.skuTango}>{f.descripcion}</option>)}
            </select>
          </Field>
          <Field label="Descuento %"><input type="number" className={inputClass} value={desc} onChange={(e) => setDesc(Number(e.target.value))} /></Field>
          <Field label="Cambio de volumen %" hint="cuánto más se vendería"><input type="number" className={inputClass} value={uplift} onChange={(e) => setUplift(Number(e.target.value))} /></Field>
          <div className="flex items-end">
            {sim && (
              <div className="w-full rounded-lg bg-ink/[0.03] px-3 py-2">
                <p className="text-2xs text-faint">Margen total proyectado</p>
                <p className={`font-mono tnum text-lg font-semibold ${sim.r.delta < 0 ? "text-bad" : "text-ok"} monto`}>
                  {money(sim.r.margenTotalProy)} <span className="text-2xs font-normal">({sim.r.delta >= 0 ? "+" : ""}{money(sim.r.delta)})</span>
                </p>
              </div>
            )}
          </div>
        </div>
        {sim && (
          <p className="mt-2 text-2xs text-faint">
            {sim.f.descripcion}: precio <span className="monto">{money(sim.f.precioVenta)}</span> → <span className="monto">{money(sim.r.precioPromo)}</span> · margen unitario <span className="monto">{money(sim.r.margenUnitarioReg)}</span> → <span className="monto">{money(sim.r.margenUnitarioPromo)}</span> · volumen {sim.f.unidades.toLocaleString("es-AR")} → {sim.r.unidadesProy.toLocaleString("es-AR")} u.
            {sim.r.delta < 0 ? " ⚠ La promo reduce el margen total con ese volumen." : " ✓ La promo mejora el margen total."}
          </p>
        )}
      </Card>

      <Card className="overflow-hidden">
        {estado === "loading" ? (
          <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
        ) : estado === "error" ? (
          <div className="p-4"><ErrorState msg={err} onRetry={() => cargar(sel)} /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-2xs uppercase tracking-wide text-faint">
                  <th className="px-4 py-2 font-medium">#</th>
                  <th className="px-4 py-2 font-medium">Producto</th>
                  <th className="px-3 py-2 text-right font-medium">U. vend.</th>
                  <th className="px-3 py-2 text-right font-medium">Margen unit.</th>
                  <th className="px-3 py-2 text-right font-medium">Margen total</th>
                  <th className="px-3 py-2 text-right font-medium">% del margen</th>
                  <th className="px-3 py-2 text-right font-medium">Facturación</th>
                </tr>
              </thead>
              <tbody>
                {filas.slice(0, 300).map((f, i) => (
                  <tr key={f.skuTango} className="border-b border-line last:border-0 hover:bg-ink/5">
                    <td className="px-4 py-2 text-2xs text-faint">{i + 1}</td>
                    <td className="px-4 py-2">
                      <div className="text-ink">{f.descripcion}</div>
                      <div className="text-2xs text-faint">SKU {f.skuTango}{f.recetaFalta && <span className="ml-1 text-warn">· sin receta</span>}</div>
                    </td>
                    <td className="px-3 py-2 text-right font-mono tnum text-muted">{f.unidades.toLocaleString("es-AR")}</td>
                    <td className={`px-3 py-2 text-right font-mono tnum ${f.recetaFalta ? "text-faint" : f.margenUnitario < 0 ? "text-bad" : "text-muted"} monto`}>{f.recetaFalta ? "—" : money(f.margenUnitario)}</td>
                    <td className={`px-3 py-2 text-right font-mono tnum font-semibold ${f.recetaFalta ? "text-faint" : f.margenTotal < 0 ? "text-bad" : "text-ink"} monto`}>{f.recetaFalta ? "—" : money(f.margenTotal)}</td>
                    <td className="px-3 py-2 text-right font-mono tnum text-faint">{f.recetaFalta ? "—" : pct(f.pctMargen)}</td>
                    <td className="px-3 py-2 text-right font-mono tnum text-muted monto">{money(f.facturacion)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="text-2xs text-faint">Ordenado por margen total (aporte a la ganancia). Los "sin receta" no tienen costo cargado y no computan margen.</p>
    </div>
  );
}

function Kpi({ label, value, sub, tone, money }: { label: string; value: string; sub?: string; tone?: "ok" | "bad"; money?: boolean }) {
  const c = tone === "bad" ? "text-bad" : tone === "ok" ? "text-ok" : "text-ink";
  return (
    <Card className="p-3">
      <p className="text-2xs uppercase tracking-wide text-faint">{label}</p>
      <p className={`mt-0.5 font-display text-lg font-semibold ${c} ${money ? "monto" : ""}`}>{value}</p>
      {sub && <p className="text-2xs text-faint">{sub}</p>}
    </Card>
  );
}
