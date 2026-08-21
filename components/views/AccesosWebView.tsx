"use client";

import { useEffect, useState } from "react";
import { Card, Skeleton } from "@/components/ui/primitives";
import { REGLA_COMMITS, type AccesoPublico, type GrupoAccesos } from "@/lib/accesos";

// Accesos del ecosistema de la web nueva (desembarco-web).
//
// Los valores NO vienen en la carga: la lista trae solo la estructura. Cada secreto
// se pide de a uno al apretar "Mostrar", y lo revelado vive únicamente en el estado
// de este componente — al salir de la pantalla se descarta (no hay storage). "Copiar"
// nunca lo muestra: lo manda al portapapeles y listo. Todo revelado o copiado queda
// registrado en la bitácora del servidor.

type Grupo = Omit<GrupoAccesos, "items"> & { items: AccesoPublico[] };

export default function AccesosWebView() {
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [estado, setEstado] = useState<"loading" | "ok" | "error">("loading");
  const [error, setError] = useState("");
  // Secretos revelados en esta visita. Se limpia al desmontar.
  const [visibles, setVisibles] = useState<Record<string, string>>({});
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [aviso, setAviso] = useState("");

  useEffect(() => {
    let vivo = true;
    fetch("/api/accesos")
      .then((r) => r.json())
      .then((j) => {
        if (!vivo) return;
        if (j.ok) { setGrupos(j.grupos); setEstado("ok"); }
        else { setError(j.error || "No autorizado."); setEstado("error"); }
      })
      .catch(() => { if (vivo) { setError("No se pudo cargar."); setEstado("error"); } });
    return () => { vivo = false; };
  }, []);

  // Al salir de la pantalla, nada de lo revelado queda en memoria.
  useEffect(() => () => setVisibles({}), []);

  async function mostrar(a: AccesoPublico) {
    setAviso("");
    if (visibles[a.id]) { setVisibles((v) => { const { [a.id]: _, ...resto } = v; return resto; }); return; }
    setOcupado(a.id);
    try {
      const j = await (await fetch(`/api/accesos?revelar=${encodeURIComponent(a.id)}`)).json();
      if (j.ok) setVisibles((v) => ({ ...v, [a.id]: j.valor }));
      else setAviso(j.error || "No se pudo revelar.");
    } catch {
      setAviso("Error de red.");
    } finally {
      setOcupado(null);
    }
  }

  // Copia sin mostrar: pide el valor, lo manda al portapapeles y avisa al server.
  async function copiar(a: AccesoPublico) {
    setAviso("");
    setOcupado(a.id);
    try {
      const valor = visibles[a.id] ?? (await (await fetch(`/api/accesos?revelar=${encodeURIComponent(a.id)}`)).json()).valor;
      if (!valor) { setAviso(`"${a.nombre}" no está cargado.`); return; }
      await navigator.clipboard.writeText(valor);
      fetch("/api/accesos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: a.id }) }).catch(() => {});
      setAviso(`✓ "${a.nombre}" copiado al portapapeles.`);
    } catch {
      setAviso("No se pudo copiar.");
    } finally {
      setOcupado(null);
    }
  }

  if (estado === "loading") {
    return <Card className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</Card>;
  }
  if (estado === "error") return <Card className="p-4 text-sm text-bad">{error}</Card>;

  return (
    <div className="space-y-4">
      <Card className="border-l-4 border-l-action/50 p-4">
        <p className="text-sm text-ink">
          Todo lo que hace falta para operar <b>desembarco-web</b>: ambientes, pantallas internas y secretos de servicio.
        </p>
        <p className="mt-1 text-2xs text-muted">
          Los valores llegan <b>ocultos</b>: se piden de a uno y solo cuando apretás <b>Mostrar</b>. Al salir de la pantalla
          se descartan. Queda registrado quién revela o copia cada acceso.
        </p>
      </Card>

      {/* Regla operativa: tiene que estar a la vista, no enterrada en un doc. */}
      <Card className="border-warn/30 bg-warn/5 p-3">
        <p className="text-2xs text-warn">⚠ {REGLA_COMMITS}</p>
      </Card>

      {aviso && <Card className="p-2.5 text-2xs text-action">{aviso}</Card>}

      {grupos.map((g) => (
        <Card key={g.id} className="overflow-hidden">
          <div className="border-b border-line px-4 py-3">
            <h2 className="font-display text-sm font-semibold text-ink">{g.titulo}</h2>
            {g.desc && <p className="mt-0.5 text-2xs text-muted">{g.desc}</p>}
          </div>
          <ul className="divide-y divide-line">
            {g.items.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5">
                <div className="min-w-[220px] flex-1">
                  <p className="text-sm text-ink">{a.nombre}</p>
                  <p className="text-2xs text-muted">
                    {a.para}
                    {a.donde && <span className="text-faint"> · {a.donde}</span>}
                    {a.formato && <span className="text-faint"> · formato: <code className="rounded bg-paper px-1">{a.formato}</code></span>}
                  </p>
                </div>

                {a.tipo === "url" && (
                  <div className="flex items-center gap-2">
                    {a.acceso && <span className="rounded-full bg-ink/5 px-2 py-0.5 text-2xs text-muted">{a.acceso}</span>}
                    <a href={a.url} target="_blank" rel="noopener noreferrer"
                      className="rounded-lg border border-line bg-surface px-2.5 py-1 text-2xs font-medium text-ink hover:border-action/40 hover:text-action">
                      Abrir ↗
                    </a>
                  </div>
                )}

                {a.tipo === "dato" && (
                  <span className="font-mono text-2xs text-muted">{a.valor}</span>
                )}

                {a.tipo === "secreto" && (
                  <div className="flex items-center gap-2">
                    {a.disponible ? (
                      <>
                        <code className="min-w-[120px] max-w-[320px] truncate rounded bg-paper px-2 py-1 font-mono text-2xs text-ink">
                          {visibles[a.id] ?? "••••••••••"}
                        </code>
                        <button onClick={() => mostrar(a)} disabled={ocupado === a.id}
                          className="rounded-lg border border-line bg-surface px-2.5 py-1 text-2xs font-medium text-ink hover:border-action/40 hover:text-action disabled:opacity-40">
                          {visibles[a.id] ? "Ocultar" : ocupado === a.id ? "…" : "Mostrar"}
                        </button>
                        <button onClick={() => copiar(a)} disabled={ocupado === a.id}
                          title="Copia al portapapeles sin mostrarlo en pantalla"
                          className="rounded-lg border border-line bg-surface px-2.5 py-1 text-2xs font-medium text-ink hover:border-action/40 hover:text-action disabled:opacity-40">
                          Copiar
                        </button>
                      </>
                    ) : (
                      <span className="rounded-full bg-warn/10 px-2 py-0.5 text-2xs text-warn" title="Cargá la variable en Vercel (Sensitive) para poder verlo acá">
                        no cargado
                      </span>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Card>
      ))}

      <p className="text-2xs text-faint">
        Los valores se guardan como variables de entorno <b>Sensitive</b> en Vercel, nunca en el repositorio
        (que es público). Si un acceso figura <b>no cargado</b>, falta darlo de alta en Vercel.
      </p>
    </div>
  );
}
