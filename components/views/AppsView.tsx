"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, Field, inputClass, Skeleton, ErrorState } from "@/components/ui/primitives";
import type { Canal, MargenApps } from "@/lib/canales";
import type { Lista } from "@/lib/listas";

const money = (n: number) => "$" + Math.round(n).toLocaleString("es-AR");
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
type ListaMeta = Omit<Lista, "precios"> & { nProductos: number };
const toneMargen = (m: number) => (m < 0 ? "text-bad" : m < 0.15 ? "text-warn" : "text-ok");

export default function AppsView() {
  const [listas, setListas] = useState<ListaMeta[]>([]);
  const [canales, setCanales] = useState<Canal[]>([]);
  const [listaId, setListaId] = useState("");
  const [canalId, setCanalId] = useState("");
  const [lista, setLista] = useState<Lista | null>(null);
  const [filas, setFilas] = useState<MargenApps[]>([]);
  const [estado, setEstado] = useState<"loading" | "ok" | "error">("loading");
  const [err, setErr] = useState("");

  useEffect(() => {
    fetch("/api/apps").then((r) => r.json()).then((j) => {
      if (j.ok) {
        setListas(j.listas); setCanales(j.canales);
        if (j.listas[0]) setListaId(j.listas[0].id);
        if (j.canales[0]) setCanalId(j.canales[0].id);
      } else { setErr(j.error); setEstado("error"); }
    }).catch(() => setEstado("error"));
  }, []);

  async function cargar() {
    if (!listaId || !canalId) return;
    setEstado("loading"); setErr("");
    try {
      const j = await (await fetch(`/api/apps?lista=${listaId}&canal=${canalId}`)).json();
      if (!j.ok) throw new Error(j.error || "No se pudo cargar.");
      setLista(j.lista); setFilas(j.filas); setEstado("ok");
    } catch (e) { setErr(e instanceof Error ? e.message : "Error."); setEstado("error"); }
  }
  useEffect(() => { cargar(); }, [listaId, canalId]);

  const canal = canales.find((c) => c.id === canalId);

  async function guardarComision(pct: number) {
    await fetch("/api/apps", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ canal: canalId, comisionPct: pct }) });
    const j = await (await fetch("/api/apps")).json();
    if (j.ok) setCanales(j.canales);
    cargar();
  }
  async function guardarPrecio(sku: string, precio: number) {
    setFilas((fs) => fs.map((f) => (f.skuTango === sku ? { ...f, precioApps: precio } : f)));
    await fetch("/api/apps", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: listaId, sku, precio }) });
    cargar();
  }

  const ordenadas = useMemo(() => [...filas].sort((a, b) => b.unidades - a.unidades), [filas]);
  const kpis = useMemo(() => {
    const u = filas.reduce((s, f) => s + f.unidades, 0) || 1;
    return {
      margenPond: filas.reduce((s, f) => s + f.margen * f.unidades, 0) / u,
      cmvPond: filas.reduce((s, f) => s + f.cmvPct * f.unidades, 0) / u,
      sinReceta: filas.filter((f) => f.recetaFalta).length,
      negativos: filas.filter((f) => f.margen < 0 && !f.recetaFalta).length,
    };
  }, [filas]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-xl font-semibold text-ink">Precios y margen · Apps</h1>
        <p className="mt-0.5 max-w-2xl text-sm text-muted">
          Margen en delivery por <b>plataforma</b>: precio de apps − costo de receta − IIBB − regalías − <b>comisión del canal</b>.
          Cambiá la comisión y se recalcula todo, ponderado por las ventas reales.
        </p>
      </div>

      <Card className="p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <Field label="Lista de apps">
            <select className={inputClass} value={listaId} onChange={(e) => setListaId(e.target.value)}>
              {listas.map((l) => <option key={l.id} value={l.id}>{l.nombre} ({l.nProductos})</option>)}
            </select>
          </Field>
          <Field label="Plataforma">
            <select className={inputClass} value={canalId} onChange={(e) => setCanalId(e.target.value)}>
              {canales.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </Field>
          {canal && (
            <Field label="Comisión %" hint="editable por canal">
              <input type="number" step="0.5" className={inputClass} defaultValue={canal.comisionPct} key={canal.id + canal.comisionPct}
                onBlur={(e) => { const v = Number(e.target.value); if (v !== canal.comisionPct) guardarComision(v); }} />
            </Field>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Margen $ ponderado" value={money(kpis.margenPond)} sub="por unidad vendida" tone={kpis.margenPond < 0 ? "bad" : undefined} money />
        <Kpi label="CMV ponderado" value={pct(kpis.cmvPond)} />
        <Kpi label="Margen negativo" value={String(kpis.negativos)} sub="productos que pierden" tone={kpis.negativos ? "bad" : undefined} />
        <Kpi label="Sin receta" value={String(kpis.sinReceta)} tone={kpis.sinReceta ? "warn" : undefined} />
      </div>

      <Card className="overflow-hidden">
        {estado === "loading" ? (
          <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
        ) : estado === "error" ? (
          <div className="p-4"><ErrorState msg={err} onRetry={cargar} /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-2xs uppercase tracking-wide text-faint">
                  <th className="px-4 py-2 font-medium">Producto</th>
                  <th className="px-3 py-2 text-right font-medium">Precio apps</th>
                  <th className="px-3 py-2 text-right font-medium">Costo</th>
                  <th className="px-3 py-2 text-right font-medium">CMV</th>
                  <th className="px-3 py-2 text-right font-medium">Costo canal</th>
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
                      <div className="text-2xs text-faint">SKU {f.skuTango}{f.precioSalon ? <> · salón <span className="monto">{money(f.precioSalon)}</span></> : ""}{f.recetaFalta && <span className="ml-1 text-warn">· sin receta</span>}</div>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input type="number" defaultValue={f.precioApps} key={f.precioApps}
                        onBlur={(e) => { const v = Math.round(Number(e.target.value)); if (v && v !== f.precioApps) guardarPrecio(f.skuTango, v); }}
                        className="w-24 rounded border border-line bg-surface px-2 py-1 text-right font-mono tnum text-sm text-ink focus:border-action monto" />
                    </td>
                    <td className="px-3 py-2 text-right font-mono tnum text-muted monto">{f.recetaFalta ? "—" : money(f.costo)}</td>
                    <td className="px-3 py-2 text-right font-mono tnum text-muted">{f.recetaFalta ? "—" : pct(f.cmvPct)}</td>
                    <td className="px-3 py-2 text-right font-mono tnum text-faint monto">{money(f.costoCanal)}</td>
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
        Margen apps = precio − costo − IIBB (neto×{lista?.iibbPct ?? 3}%) − regalías (precio×{lista?.regaliasPct ?? 6}%) − costo del canal (comisión×1,21).
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
