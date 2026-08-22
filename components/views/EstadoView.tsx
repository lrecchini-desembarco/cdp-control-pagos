"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/primitives";

interface Estado {
  bridgeHost: string | null;
  endpoints: { metodo: string; ruta: string; desc: string; estado: { ok: boolean; ms: number; detail: string } | null }[];
  fuentes: { nombre: string; valor: string }[];
  config: { nombre: string; ok: boolean; detalle: string }[];
}

export default function EstadoView() {
  const [data, setData] = useState<Estado | null>(null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(true);

  async function cargar() {
    setCargando(true); setError("");
    try {
      const j = await (await fetch("/api/estado", { cache: "no-store" })).json();
      if (j.ok) setData(j); else setError(j.error || "No se pudo leer el estado.");
    } catch (e) { setError(String(e)); } finally { setCargando(false); }
  }
  useEffect(() => { cargar(); }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[23px] font-semibold tracking-[-.02em] text-[#ece9e2]">Salud y endpoints</h1>
          <p className="mt-1 max-w-[640px] text-[12.5px] leading-[1.5] text-ink/55">
            Endpoints del bridge de Tango y chequeo en vivo de las fuentes de datos. Solo visible para admin.
          </p>
        </div>
        <button onClick={cargar} disabled={cargando}
          className="shrink-0 rounded border border-ink/20 px-3 py-1.5 text-[12px] font-medium text-ink/75 transition-colors hover:border-action/60 hover:text-action disabled:opacity-40">
          {cargando ? "Chequeando…" : "↻ Re-chequear"}
        </button>
      </div>

      {error && <Card className="p-3 text-sm text-bad">{error}</Card>}

      {data && (
        <>
          <div>
            <p className="mb-1 font-mono text-[9.5px] uppercase tracking-[.16em] text-ink/40">
              Bridge Tango {data.bridgeHost ? <span className="text-ink/50">· {data.bridgeHost}</span> : <span className="text-warn">· SQL directo (dev, sin bridge)</span>}
            </p>
            <div className="grid grid-cols-[56px_1.1fr_1.4fr_140px] gap-3 border-t border-action/28 border-b border-ink/10 py-2 font-mono text-[9.5px] uppercase tracking-[.16em] text-ink/40">
              <span>Método</span>
              <span>Endpoint</span>
              <span>Descripción</span>
              <span className="text-right">Estado</span>
            </div>
            {data.endpoints.map((e) => (
              <div key={e.ruta} className="grid grid-cols-[56px_1.1fr_1.4fr_140px] items-center gap-3 border-b border-ink/7 py-[9px]">
                <span className="rounded border border-ink/18 px-1.5 py-[2px] font-mono text-[10px] text-ink/60">{e.metodo}</span>
                <span className="truncate font-mono text-[11.5px] text-ink/80">{e.ruta}</span>
                <span className="truncate text-[11.5px] text-ink/55">{e.desc}</span>
                <span className="text-right">
                  {e.estado
                    ? <Semaforo ok={e.estado.ok} texto={e.estado.ok ? `${e.estado.detail} · ${e.estado.ms}ms` : e.estado.detail} />
                    : <span className="text-[11px] text-ink/35">—</span>}
                </span>
              </div>
            ))}
          </div>

          <div className="grid gap-[26px] min-[1100px]:grid-cols-2">
            <div>
              <p className="mb-1 font-mono text-[9.5px] uppercase tracking-[.16em] text-ink/40">Fuentes de datos</p>
              <div className="border-t border-ink/10">
                {data.fuentes.map((f) => (
                  <div key={f.nombre} className="flex items-center justify-between border-b border-ink/7 py-2.5">
                    <span className="text-[12.5px] text-ink/85">{f.nombre}</span>
                    <span className={`rounded border px-2 py-[3px] text-[11px] font-medium ${f.valor === "live" ? "border-ok/30 bg-ok/10 text-ok" : "border-warn/30 bg-warn/10 text-warn"}`}>
                      {f.valor === "live" ? "en vivo" : "ejemplo (mock)"}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-1 font-mono text-[9.5px] uppercase tracking-[.16em] text-ink/40">Configuración</p>
              <div className="border-t border-ink/10">
                {data.config.map((c) => (
                  <div key={c.nombre} className="flex items-center justify-between gap-3 border-b border-ink/7 py-2.5">
                    <span className="text-[12.5px] text-ink/85">{c.nombre}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-[11px] text-ink/45">{c.detalle}</span>
                      <Semaforo ok={c.ok} texto="" />
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <p className="text-[11px] text-ink/40">
            "Pedidos en mock" = falta el token de Raven → el <b>Cruce</b> muestra desvíos irreales (pedido simulado vs venta real).
            Para números reales: cargar <code className="rounded bg-ink/[.06] px-1">RAVEN_TOKEN</code> y mapear las sucursales de Tango a su código canónico.
          </p>
        </>
      )}
    </div>
  );
}

function Semaforo({ ok, texto }: { ok: boolean; texto: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded border px-2 py-[3px] text-[11px] font-medium ${ok ? "border-ok/30 bg-ok/10 text-ok" : "border-bad/30 bg-bad/10 text-bad"}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-ok" : "bg-bad"}`} />
      {texto || (ok ? "OK" : "falta")}
    </span>
  );
}
