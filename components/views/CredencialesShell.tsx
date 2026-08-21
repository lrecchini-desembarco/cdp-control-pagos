"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/primitives";
import CredencialesView from "@/components/views/CredencialesView";
import AccesosWebView from "@/components/views/AccesosWebView";

// Shell de la pantalla de accesos sensibles. Tres pestañas sobre el MISMO candado
// (lista blanca por email, chequeada en el servidor por cada API):
//   Bóveda        -> contraseñas cargadas a mano, cifradas (CredencialesView)
//   Ecosistema web -> accesos de desembarco-web, con el valor en env de Vercel
//   Bitácora      -> quién reveló o copió qué y cuándo
type Tab = "boveda" | "web" | "bitacora";

interface Evento { fecha: string; email: string; accion: string; recurso: string; detalle?: string }

export default function CredencialesShell() {
  const [tab, setTab] = useState<Tab>("boveda");

  const tabs: { id: Tab; label: string }[] = [
    { id: "boveda", label: "Bóveda de contraseñas" },
    { id: "web", label: "Ecosistema web" },
    { id: "bitacora", label: "Bitácora" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-full border px-3.5 py-1.5 text-2xs font-medium ${
              tab === t.id ? "border-action bg-action/10 text-action" : "border-line bg-surface text-muted hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "boveda" && <CredencialesView />}
      {tab === "web" && <AccesosWebView />}
      {tab === "bitacora" && <Bitacora />}
    </div>
  );
}

function Bitacora() {
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [estado, setEstado] = useState<"loading" | "ok" | "error">("loading");

  useEffect(() => {
    fetch("/api/accesos?bitacora=1")
      .then((r) => r.json())
      .then((j) => { if (j.ok) { setEventos(j.eventos); setEstado("ok"); } else setEstado("error"); })
      .catch(() => setEstado("error"));
  }, []);

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

  if (estado === "loading") return <Card className="p-4 text-sm text-faint">Cargando…</Card>;
  if (estado === "error") return <Card className="p-4 text-sm text-bad">No se pudo leer la bitácora.</Card>;

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-line px-4 py-3">
        <h2 className="font-display text-sm font-semibold text-ink">Quién vio qué</h2>
        <p className="mt-0.5 text-2xs text-muted">
          Últimos {eventos.length} accesos a datos sensibles del ecosistema web. La bitácora no guarda valores, solo qué se pidió.
        </p>
      </div>
      {eventos.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-faint">Todavía no hay registros.</p>
      ) : (
        <ul className="divide-y divide-line">
          {eventos.map((e, i) => (
            <li key={i} className="flex flex-wrap items-center gap-x-3 px-4 py-2 text-2xs">
              <span className="font-mono text-faint">{fmt(e.fecha)}</span>
              <span className="text-ink">{e.email}</span>
              <span className={`rounded-full px-2 py-0.5 font-medium ${e.accion === "revelar" ? "bg-warn/10 text-warn" : "bg-action/10 text-action"}`}>
                {e.accion === "revelar" ? "reveló" : "copió"}
              </span>
              <span className="text-muted">{e.detalle ?? e.recurso}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
