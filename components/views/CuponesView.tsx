"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, inputClass } from "@/components/ui/primitives";

interface Cupon {
  codigo: string;
  local: string;
  marca?: string;
  nombre: string;
  telefono: string;
  emitido: string;
  vence?: string;
  usosRestantes: number;
  usos: string[];
}

const fecha = (iso: string) => (iso ? iso.slice(0, 10) : "");
const tel = (t: string) => (t.length > 6 ? `+${t}` : t);
// Vencimiento efectivo (mismo criterio que el server: emitido + 60 días si no viene guardado).
const venceDe = (c: Cupon) => { if (c.vence) return c.vence; const d = new Date(c.emitido); d.setDate(d.getDate() + 60); return d.toISOString(); };
const vigente = (c: Cupon) => new Date().toISOString() <= venceDe(c);

export default function CuponesView() {
  const [q, setQ] = useState("");
  const [cupon, setCupon] = useState<Cupon | null | undefined>(undefined); // undefined = sin buscar
  const [buscando, setBuscando] = useState(false);
  const [msg, setMsg] = useState("");
  const [recientes, setRecientes] = useState<Cupon[]>([]);

  async function cargarRecientes() {
    try {
      const j = await (await fetch("/api/cupones")).json();
      if (j.ok) setRecientes(j.cupones);
    } catch {}
  }
  useEffect(() => { cargarRecientes(); }, []);

  async function buscar() {
    if (!q.trim()) return;
    setBuscando(true); setMsg("");
    try {
      const j = await (await fetch(`/api/cupones?q=${encodeURIComponent(q.trim())}`)).json();
      setCupon(j.ok ? j.cupon : null);
      if (j.ok && !j.cupon) setMsg("No se encontró ningún cupón con ese código o teléfono.");
    } catch { setMsg("Error de red."); } finally { setBuscando(false); }
  }

  async function canjear() {
    if (!cupon) return;
    setMsg("");
    try {
      const j = await (await fetch("/api/cupones", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo: cupon.codigo }),
      })).json();
      if (j.ok) { setCupon(j.cupon); setMsg("✓ Canjeado. Aplicá el 15% en esta compra."); cargarRecientes(); }
      else { if (j.cupon) setCupon(j.cupon); setMsg(j.error || "No se pudo canjear."); }
    } catch { setMsg("Error de red."); }
  }

  const kpis = useMemo(() => {
    const emitidos = recientes.length;
    const activos = recientes.filter((c) => c.usosRestantes > 0 && vigente(c)).length;
    const canjes = recientes.reduce((s, c) => s + c.usos.length, 0);
    return { emitidos, activos, canjes };
  }, [recientes]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-xl font-semibold text-ink">Validar cupón</h1>
        <p className="mt-0.5 max-w-2xl text-sm text-muted">
          Ingresá el código del cupón (o el teléfono del cliente), verificá que sea válido y canjeá una de las 3 compras con 15% OFF.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Kpi label="Cupones emitidos" value={String(kpis.emitidos)} />
        <Kpi label="Con saldo" value={String(kpis.activos)} />
        <Kpi label="Canjes totales" value={String(kpis.canjes)} />
      </div>

      {/* Buscador */}
      <Card className="p-4">
        <label className="mb-1 block text-2xs font-medium uppercase tracking-wide text-faint">Código o teléfono</label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            className={`${inputClass} max-w-xs font-mono uppercase`}
            placeholder="DS-XXXXXX o 549…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && buscar()}
          />
          <button onClick={buscar} disabled={buscando}
            className="rounded-lg bg-action px-4 py-2 text-sm font-medium text-white hover:bg-action-700 disabled:opacity-40">
            {buscando ? "Buscando…" : "Buscar"}
          </button>
        </div>
      </Card>

      {/* Resultado */}
      {cupon === null && <Card className="p-3 text-sm text-bad">{msg || "No se encontró el cupón."}</Card>}
      {cupon && (
        <Card className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-mono text-2xl font-semibold text-ink">{cupon.codigo}</p>
              <p className="mt-1 text-sm text-ink">{cupon.nombre} · {tel(cupon.telefono)}</p>
              <p className="text-2xs text-faint">Local: {cupon.local} · emitido {fecha(cupon.emitido)}</p>
              <p className={`text-2xs ${vigente(cupon) ? "text-faint" : "font-medium text-bad"}`}>
                {vigente(cupon) ? `Válido hasta ${fecha(venceDe(cupon))}` : `Venció el ${fecha(venceDe(cupon))}`}
              </p>
            </div>
            <div className="text-right">
              <span className={`rounded-full px-3 py-1 text-sm font-semibold ${!vigente(cupon) ? "bg-bad/10 text-bad" : cupon.usosRestantes > 0 ? "bg-ok/10 text-ok" : "bg-bad/10 text-bad"}`}>
                {!vigente(cupon) ? "Vencido" : cupon.usosRestantes > 0 ? `${cupon.usosRestantes} de 3 disponibles` : "Agotado"}
              </span>
            </div>
          </div>

          <button
            onClick={canjear}
            disabled={cupon.usosRestantes <= 0 || !vigente(cupon)}
            className="mt-4 w-full rounded-lg bg-action px-4 py-3 text-base font-semibold text-white hover:bg-action-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {!vigente(cupon) ? "Cupón vencido" : cupon.usosRestantes > 0 ? "Canjear 15% en esta compra" : "Sin usos disponibles"}
          </button>
          {msg && <p className={`mt-2 text-sm ${msg.startsWith("✓") ? "text-ok" : "text-bad"}`}>{msg}</p>}
          {cupon.usos.length > 0 && (
            <p className="mt-2 text-2xs text-faint">Compras usadas: {cupon.usos.map((u) => fecha(u)).join(" · ")}</p>
          )}
        </Card>
      )}

      {/* Emitidos recientes */}
      <Card className="overflow-hidden">
        <div className="border-b border-line px-4 py-2.5">
          <p className="text-2xs font-medium uppercase tracking-wide text-faint">Cupones recientes</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-2xs uppercase tracking-wide text-faint">
                <th className="px-4 py-2 font-medium">Código</th>
                <th className="px-4 py-2 font-medium">Cliente</th>
                <th className="px-4 py-2 font-medium">Local</th>
                <th className="px-4 py-2 text-right font-medium">Saldo</th>
                <th className="px-4 py-2 font-medium">Emitido</th>
              </tr>
            </thead>
            <tbody>
              {recientes.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-faint">Todavía no hay cupones.</td></tr>
              ) : recientes.slice(0, 50).map((c) => (
                <tr key={c.codigo} className="cursor-pointer border-b border-line last:border-0 hover:bg-ink/5"
                  onClick={() => { setQ(c.codigo); setCupon(c); setMsg(""); }}>
                  <td className="px-4 py-2 font-mono text-ink">{c.codigo}</td>
                  <td className="px-4 py-2 text-muted">{c.nombre}</td>
                  <td className="px-4 py-2 text-muted">{c.local}</td>
                  <td className="px-4 py-2 text-right">
                    {!vigente(c) ? <span className="text-bad">Vencido</span> : <span className={c.usosRestantes > 0 ? "text-ok" : "text-faint"}>{c.usosRestantes}/3</span>}
                  </td>
                  <td className="px-4 py-2 text-2xs text-faint">{fecha(c.emitido)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-3">
      <p className="text-2xs uppercase tracking-wide text-faint">{label}</p>
      <p className="mt-0.5 font-display text-lg font-semibold text-ink">{value}</p>
    </Card>
  );
}
