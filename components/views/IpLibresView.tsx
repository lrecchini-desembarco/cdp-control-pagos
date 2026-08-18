"use client";

// IPs libres de la red. La app no escanea nada: solo le pregunta al servidor
// propio de la empresa que lo hace todo el tiempo (ver app/api/ip-libres/route.ts
// y docs/ip-libres.md para cómo se conecta). Mismo espíritu que /estado: un
// puntito de estado de la conexión + los datos, sin pretender ser el dueño del dato.

import { useEffect, useMemo, useState } from "react";
import { Card, Button, EmptyState, Skeleton, inputClass } from "@/components/ui/primitives";
import type { IpLibre } from "@/lib/ip-libres";

const REFRESCO_MS = 30_000;

type Estado = "cargando" | "ok" | "sin-configurar" | "error";

export default function IpLibresView() {
  const [ips, setIps] = useState<IpLibre[]>([]);
  const [estado, setEstado] = useState<Estado>("cargando");
  const [error, setError] = useState("");
  const [ultima, setUltima] = useState<Date | null>(null);
  const [q, setQ] = useState("");
  const [copiada, setCopiada] = useState("");

  async function cargar() {
    try {
      const j = await (await fetch("/api/ip-libres", { cache: "no-store" })).json();
      if (j.ok) {
        setIps(j.ips ?? []);
        setEstado("ok");
        setUltima(new Date());
      } else {
        setEstado(j.configurado === false ? "sin-configurar" : "error");
        setError(j.error || "No se pudo consultar el servidor.");
      }
    } catch {
      setEstado("error");
      setError("Error de red consultando el servidor de IPs libres.");
    }
  }

  useEffect(() => {
    cargar();
    const t = setInterval(cargar, REFRESCO_MS);
    return () => clearInterval(t);
  }, []);

  async function copiar(ip: string) {
    try {
      await navigator.clipboard.writeText(ip);
      setCopiada(ip);
      setTimeout(() => setCopiada(""), 1500);
    } catch {}
  }

  const filtradas = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return ips;
    return ips.filter((x) => `${x.ip} ${x.red ?? ""}`.toLowerCase().includes(t));
  }, [ips, q]);

  const dot = estado === "ok" ? "bg-ok animate-pulse" : estado === "cargando" ? "bg-warn" : "bg-bad";
  const txt =
    estado === "ok" ? "Servidor conectado" : estado === "cargando" ? "Consultando…" : estado === "sin-configurar" ? "Sin configurar" : "Sin respuesta";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-xl font-semibold text-ink">IPs libres</h1>
        <p className="mt-0.5 max-w-2xl text-sm text-muted">
          Direcciones IP disponibles en la red, según el servidor propio de la empresa que la escanea todo el
          tiempo. Esta pantalla solo la consulta: no escanea nada por su cuenta. Para asignar una a un equipo,
          copiala acá y pegala en <b className="font-medium text-ink">Inventario</b>.
        </p>
      </div>

      <Card className="flex flex-wrap items-center gap-3 p-3">
        <span className="inline-flex items-center gap-1.5 text-2xs text-muted">
          <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden />
          {txt}
        </span>
        {ultima && <span className="text-2xs text-faint">Actualizado {ultima.toLocaleTimeString("es-AR")}</span>}
        <input
          className={`${inputClass} max-w-[220px] py-1`}
          placeholder="Buscar IP o red…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          disabled={estado !== "ok"}
        />
        <span className="ml-auto text-2xs text-faint">{estado === "ok" ? `${filtradas.length} de ${ips.length} libres` : ""}</span>
        <Button variant="outline" onClick={cargar} disabled={estado === "cargando"}>
          ↻ Actualizar
        </Button>
      </Card>

      {estado === "cargando" ? (
        <Card className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</Card>
      ) : estado === "sin-configurar" ? (
        <Card className="border-warn/30 bg-warn/5 p-4 text-2xs text-ink">
          <p className="font-medium">Todavía no se conectó el servidor de IPs libres.</p>
          <p className="mt-1 text-muted">
            El watchdog de esa máquina tiene que publicar su URL vigente (igual que el bridge de Tango). Ver{" "}
            <b className="font-medium text-ink">docs/ip-libres.md</b> para las variables de entorno y el endpoint que
            tiene que exponer.
          </p>
        </Card>
      ) : estado === "error" ? (
        <Card className="border-bad/30 bg-bad/5 p-4 text-2xs text-bad">{error}</Card>
      ) : filtradas.length === 0 ? (
        <EmptyState
          title={ips.length ? "Sin resultados" : "No hay IPs libres"}
          desc={ips.length ? "Probá con otra búsqueda." : "El servidor no reporta ninguna dirección disponible en este momento."}
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-2xs uppercase tracking-wide text-faint">
                  <th className="px-4 py-2 font-medium">IP</th>
                  <th className="px-3 py-2 font-medium">Red</th>
                  <th className="px-3 py-2 font-medium">Visto libre</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {filtradas.map((x) => (
                  <tr key={x.ip} className="border-b border-line/70 last:border-0 hover:bg-ink/[0.02]">
                    <td className="px-4 py-2 font-mono text-sm text-ink">{x.ip}</td>
                    <td className="px-3 py-2 text-2xs text-muted">{x.red || "—"}</td>
                    <td className="px-3 py-2 text-2xs text-faint">{x.vistoLibreEn || "—"}</td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => copiar(x.ip)} className="text-2xs font-medium text-action hover:underline">
                        {copiada === x.ip ? "Copiada ✓" : "Copiar"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
