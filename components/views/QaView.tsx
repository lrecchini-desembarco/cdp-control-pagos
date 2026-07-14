"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, Skeleton, ErrorState } from "@/components/ui/primitives";

// Panel de QA diario: el bot corre las auditorías (reconciliación, margen, identidad,
// mapeo, frescura) atribuidas a cada persona del panel, y acá se ve la salud del día.
interface QaCheck { id: string; persona: string; seccion: string; titulo: string; ok: boolean; severidad: "alta" | "media" | "baja"; valor?: string; detalle: string }
interface QaReporte { cuando: string; total: number; pasan: number; fallan: number; checks: QaCheck[] }
interface HistItem { cuando: string; pasan: number; fallan: number }

const fechaHora = (iso: string) => { const d = new Date(iso); return d.toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); };
const sevTone: Record<string, string> = { alta: "text-bad", media: "text-warn", baja: "text-muted" };

export default function QaView() {
  const [reporte, setReporte] = useState<QaReporte | null>(null);
  const [historial, setHistorial] = useState<HistItem[]>([]);
  const [estado, setEstado] = useState<"loading" | "ok" | "error">("loading");
  const [err, setErr] = useState("");
  const [corriendo, setCorriendo] = useState(false);

  async function cargar() {
    try {
      const j = await (await fetch("/api/qa", { cache: "no-store" })).json();
      if (!j.ok) throw new Error(j.error || "no se pudo cargar");
      setReporte(j.reporte ?? null); setHistorial(j.historial ?? []); setEstado("ok");
    } catch (e) { setErr(e instanceof Error ? e.message : "error"); setEstado("error"); }
  }
  useEffect(() => { cargar(); }, []);

  async function correr() {
    setCorriendo(true);
    try { const j = await (await fetch("/api/qa?run=1", { cache: "no-store" })).json(); if (j.reporte) { setReporte(j.reporte); await cargar(); } }
    catch { /* */ } finally { setCorriendo(false); }
  }

  const porSeccion = useMemo(() => {
    const m = new Map<string, QaCheck[]>();
    // fallidos primero, luego por sección
    const cs = [...(reporte?.checks ?? [])].sort((a, b) => Number(a.ok) - Number(b.ok));
    for (const c of cs) { const a = m.get(c.seccion) ?? []; a.push(c); m.set(c.seccion, a); }
    return Array.from(m.entries());
  }, [reporte]);

  const fallan = reporte?.fallan ?? 0;
  const salud = reporte && reporte.total ? Math.round((reporte.pasan / reporte.total) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold text-ink">QA diario</h1>
          <p className="mt-0.5 max-w-2xl text-sm text-muted">El bot corre todos los días las auditorías de cada sección (como si cada persona del panel controlara la suya) y avisa si algo se rompió.</p>
        </div>
        <div className="flex items-center gap-2">
          {reporte?.cuando && <span className="text-2xs text-faint">última corrida {fechaHora(reporte.cuando)}</span>}
          <button onClick={correr} disabled={corriendo} className="rounded-md border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:bg-ink/[0.03] disabled:opacity-50">{corriendo ? "Corriendo…" : "Correr ahora"}</button>
        </div>
      </div>

      {estado === "loading" && <div className="grid gap-3 sm:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24" />)}</div>}
      {estado === "error" && <ErrorState msg={err} onRetry={cargar} />}

      {estado === "ok" && !reporte && (
        <Card className="p-5 text-sm text-muted">Todavía no corrió ningún control. Tocá <b className="text-ink">«Correr ahora»</b> para el primero (después corre solo cada día).</Card>
      )}

      {estado === "ok" && reporte && (
        <>
          {/* Salud del día */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Card className="p-3.5">
              <p className="text-2xs uppercase tracking-wide text-faint">Salud de hoy</p>
              <p className={`mt-0.5 font-display text-3xl font-semibold ${fallan === 0 ? "text-ok" : salud >= 80 ? "text-warn" : "text-bad"}`}>{salud}%</p>
              <p className="text-2xs text-faint">{reporte.pasan}/{reporte.total} controles OK</p>
            </Card>
            <Card className="p-3.5">
              <p className="text-2xs uppercase tracking-wide text-faint">Problemas</p>
              <p className={`mt-0.5 font-display text-3xl font-semibold ${fallan === 0 ? "text-ok" : "text-bad"}`}>{fallan}</p>
              <p className="text-2xs text-faint">{fallan === 0 ? "todo en verde 🎉" : "revisar abajo"}</p>
            </Card>
            <Card className="col-span-2 p-3.5">
              <p className="text-2xs uppercase tracking-wide text-faint">Últimas corridas</p>
              <div className="mt-2 flex items-end gap-1">
                {historial.slice(-24).map((h, i) => {
                  const tot = h.pasan + h.fallan;
                  const alt = tot ? (h.pasan / tot) : 0;
                  return <div key={i} title={`${fechaHora(h.cuando)} · ${h.fallan} problemas`} className={`w-2.5 rounded-sm ${h.fallan === 0 ? "bg-ok/70" : "bg-bad/60"}`} style={{ height: `${8 + alt * 28}px` }} />;
                })}
                {historial.length === 0 && <span className="text-2xs text-faint">todavía sin serie</span>}
              </div>
            </Card>
          </div>

          {/* Checks por sección */}
          {porSeccion.map(([seccion, checks]) => (
            <Card key={seccion} className="overflow-hidden p-0">
              <div className="flex items-center justify-between border-b border-line px-4 py-2">
                <p className="text-2xs font-medium uppercase tracking-wide text-faint">{seccion}</p>
                <span className="text-2xs text-faint">{checks.filter((c) => c.ok).length}/{checks.length} OK</span>
              </div>
              <div>
                {checks.map((c) => (
                  <div key={c.id} className="flex items-start gap-3 border-b border-line/60 px-4 py-2.5 last:border-0">
                    <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold ${c.ok ? "bg-ok/15 text-ok" : "bg-bad/15 text-bad"}`}>{c.ok ? "✓" : "✗"}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="text-sm font-medium text-ink">{c.titulo}</span>
                        <span className="rounded bg-ink/[0.06] px-1.5 py-px text-[10px] text-muted">{c.persona}</span>
                        {!c.ok && <span className={`text-[10px] font-medium uppercase ${sevTone[c.severidad]}`}>{c.severidad}</span>}
                        {c.valor && <span className="font-mono text-2xs text-faint">{c.valor}</span>}
                      </div>
                      <p className={`text-2xs ${c.ok ? "text-faint" : "text-muted"}`}>{c.detalle}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </>
      )}
    </div>
  );
}
