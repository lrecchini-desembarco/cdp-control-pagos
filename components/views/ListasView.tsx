"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, Field, inputClass, Button, Badge, Skeleton, ErrorState } from "@/components/ui/primitives";
import type { Lista, MargenProducto } from "@/lib/listas";

const money = (n: number) => "$" + Math.round(n).toLocaleString("es-AR");
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
type ListaMeta = Omit<Lista, "precios"> & { nProductos: number };

const toneMargen = (m: number) => (m < 0 ? "text-bad" : m < 0.25 ? "text-warn" : "text-ok");

export default function ListasView() {
  const [listas, setListas] = useState<ListaMeta[]>([]);
  const [sel, setSel] = useState<string>("");
  const [lista, setLista] = useState<Lista | null>(null);
  const [filas, setFilas] = useState<MargenProducto[]>([]);
  const [estado, setEstado] = useState<"loading" | "ok" | "error">("loading");
  const [err, setErr] = useState("");
  const [orden, setOrden] = useState<"margen" | "unidades" | "cmv">("unidades");

  useEffect(() => {
    fetch("/api/listas").then((r) => r.json()).then((j) => {
      if (j.ok) { setListas(j.listas); if (j.listas[0]) setSel(j.listas[0].id); }
      else { setErr(j.error); setEstado("error"); }
    }).catch(() => setEstado("error"));
  }, []);

  async function cargarLista(id: string) {
    if (!id) return;
    setEstado("loading"); setErr("");
    try {
      const j = await (await fetch(`/api/listas?id=${encodeURIComponent(id)}`)).json();
      if (!j.ok) throw new Error(j.error || "No se pudo cargar.");
      setLista(j.lista); setFilas(j.filas); setEstado("ok");
    } catch (e) { setErr(e instanceof Error ? e.message : "Error."); setEstado("error"); }
  }
  useEffect(() => { if (sel) cargarLista(sel); }, [sel]);

  async function guardarPrecio(sku: string, precio: number) {
    setFilas((fs) => fs.map((f) => (f.skuTango === sku ? { ...f, precioVenta: precio } : f))); // optimista
    await fetch("/api/listas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: sel, sku, precio }) });
    cargarLista(sel); // recalcula margen con el precio nuevo
  }
  async function guardarParams(patch: Partial<Lista>) {
    await fetch("/api/listas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: sel, ...patch }) });
    cargarLista(sel);
  }

  const ordenadas = useMemo(() => {
    const val = (f: MargenProducto) => (orden === "margen" ? f.margen : orden === "cmv" ? -f.cmvPct : f.unidades);
    return [...filas].sort((a, b) => val(b) - val(a));
  }, [filas, orden]);

  const kpis = useMemo(() => {
    const uTot = filas.reduce((s, f) => s + f.unidades, 0) || 1;
    const margenPond = filas.reduce((s, f) => s + f.margen * f.unidades, 0) / uTot;
    const cmvPond = filas.reduce((s, f) => s + f.cmvPct * f.unidades, 0) / uTot;
    return { margenPond, cmvPond, sinReceta: filas.filter((f) => f.recetaFalta).length, n: filas.length };
  }, [filas]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-xl font-semibold text-ink">Precios y margen · Mostrador</h1>
        <p className="mt-0.5 max-w-2xl text-sm text-muted">
          Por lista y producto: <b>precio de venta</b> (editable), <b>costo de receta</b> (en vivo del módulo Recetas),
          CMV, regalías y <b>margen</b>. El margen ponderado usa las <b>unidades vendidas reales</b> de Tango.
        </p>
      </div>

      <Card className="p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <Field label="Lista">
            <select className={inputClass} value={sel} onChange={(e) => setSel(e.target.value)}>
              {listas.map((l) => <option key={l.id} value={l.id}>{l.nombre} ({l.nProductos})</option>)}
            </select>
          </Field>
          {lista && (
            <>
              <Field label="Regalías %" hint="6% estándar">
                <input type="number" step="0.5" className={inputClass} defaultValue={lista.regaliasPct}
                  onBlur={(e) => { const v = Number(e.target.value); if (v !== lista.regaliasPct) guardarParams({ regaliasPct: v }); }} />
              </Field>
              <Field label="Publicidad %">
                <input type="number" step="0.5" className={inputClass} defaultValue={lista.publicidadPct}
                  onBlur={(e) => { const v = Number(e.target.value); if (v !== lista.publicidadPct) guardarParams({ publicidadPct: v }); }} />
              </Field>
              <Field label="Ordenar por">
                <select className={inputClass} value={orden} onChange={(e) => setOrden(e.target.value as any)}>
                  <option value="unidades">Más vendidos</option>
                  <option value="margen">Mayor margen</option>
                  <option value="cmv">Mayor CMV</option>
                </select>
              </Field>
            </>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Margen $ ponderado" value={money(kpis.margenPond)} sub="por unidad vendida" tone={kpis.margenPond < 0 ? "bad" : undefined} money />
        <Kpi label="CMV ponderado" value={pct(kpis.cmvPond)} sub="costo / precio" />
        <Kpi label="Productos" value={String(kpis.n)} />
        <Kpi label="Sin receta" value={String(kpis.sinReceta)} sub="costo incompleto" tone={kpis.sinReceta ? "warn" : undefined} />
      </div>

      <Card className="overflow-hidden">
        {estado === "loading" ? (
          <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
        ) : estado === "error" ? (
          <div className="p-4"><ErrorState msg={err} onRetry={() => cargarLista(sel)} /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-2xs uppercase tracking-wide text-faint">
                  <th className="px-4 py-2 font-medium">Producto</th>
                  <th className="px-3 py-2 text-right font-medium">Precio venta</th>
                  <th className="px-3 py-2 text-right font-medium">Costo</th>
                  <th className="px-3 py-2 text-right font-medium">CMV</th>
                  <th className="px-3 py-2 text-right font-medium">Regalías</th>
                  <th className="px-3 py-2 text-right font-medium">Margen $</th>
                  <th className="px-3 py-2 text-right font-medium">Margen %</th>
                  <th className="px-3 py-2 text-right font-medium">U. vend.</th>
                </tr>
              </thead>
              <tbody>
                {ordenadas.map((f) => (
                  <tr key={f.skuTango} className="border-b border-line last:border-0 hover:bg-ink/5">
                    <td className="px-4 py-2">
                      <div className="text-ink">{f.descripcion}</div>
                      <div className="text-2xs text-faint">SKU {f.skuTango}{f.recetaFalta && <span className="ml-1 text-warn">· sin receta</span>}</div>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input type="number" defaultValue={f.precioVenta} key={f.precioVenta}
                        onBlur={(e) => { const v = Math.round(Number(e.target.value)); if (v && v !== f.precioVenta) guardarPrecio(f.skuTango, v); }}
                        className="w-24 rounded border border-line bg-surface px-2 py-1 text-right font-mono tnum text-sm text-ink focus:border-action monto" />
                    </td>
                    <td className="px-3 py-2 text-right font-mono tnum text-muted monto">{f.recetaFalta ? "—" : money(f.costo)}</td>
                    <td className="px-3 py-2 text-right font-mono tnum text-muted">{f.recetaFalta ? "—" : pct(f.cmvPct)}</td>
                    <td className="px-3 py-2 text-right font-mono tnum text-faint monto">{money(f.regalias)}</td>
                    <td className={`px-3 py-2 text-right font-mono tnum font-semibold ${f.recetaFalta ? "text-faint" : toneMargen(f.margenPct)} monto`}>{f.recetaFalta ? "—" : money(f.margen)}</td>
                    <td className={`px-3 py-2 text-right font-mono tnum ${f.recetaFalta ? "text-faint" : toneMargen(f.margenPct)}`}>{f.recetaFalta ? "—" : pct(f.margenPct)}</td>
                    <td className="px-3 py-2 text-right font-mono tnum text-faint">{f.unidades ? f.unidades.toLocaleString("es-AR") : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="text-2xs text-faint">
        Regalías = precio × {lista?.regaliasPct ?? 6}% × 1,21 (c/IVA). Margen = precio − costo − regalías − publicidad.
        Los "sin receta" no costean hasta completar su receta en el módulo Recetas.
      </p>
    </div>
  );
}

function Kpi({ label, value, sub, tone, money }: { label: string; value: string; sub?: string; tone?: "warn" | "bad"; money?: boolean }) {
  const c = tone === "bad" ? "text-bad" : tone === "warn" ? "text-warn" : "text-ink";
  return (
    <Card className="p-3">
      <p className="text-2xs uppercase tracking-wide text-faint">{label}</p>
      <p className={`mt-0.5 font-display text-lg font-semibold ${c} ${money ? "monto" : ""}`}>{value}</p>
      {sub && <p className="text-2xs text-faint">{sub}</p>}
    </Card>
  );
}
