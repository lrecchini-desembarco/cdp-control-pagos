"use client";

// Hilo de comentarios de un ticket + caja para responder. Lo usan tanto la
// vista del empleado (su propio ticket) como la de sistemas (cualquiera).

import { useState } from "react";
import { Button, inputClass } from "@/components/ui/primitives";
import type { Ticket } from "@/lib/tickets";

const fecha = (iso: string) =>
  new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export default function TicketThread({
  ticket,
  onComentar,
  esSistemas = false,
  onToggleConversacion,
}: {
  ticket: Ticket;
  onComentar: (id: string, texto: string) => Promise<boolean>;
  /** Solo sistemas ve el control de cerrar/reabrir — es una acción de gestión, no del solicitante. */
  esSistemas?: boolean;
  onToggleConversacion?: (id: string, cerrar: boolean) => Promise<boolean>;
}) {
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [cambiando, setCambiando] = useState(false);

  const cerrada = Boolean(ticket.conversacionCerrada);
  // Sistemas no puede escribir si está cerrada; el solicitante siempre puede (eso la reabre solo).
  const bloqueada = esSistemas && cerrada;

  async function enviar() {
    if (!texto.trim()) return;
    setEnviando(true);
    if (await onComentar(ticket.id, texto)) setTexto("");
    setEnviando(false);
  }

  async function toggle() {
    if (!onToggleConversacion) return;
    setCambiando(true);
    await onToggleConversacion(ticket.id, !cerrada);
    setCambiando(false);
  }

  return (
    <div className="mt-3 space-y-2 border-t border-dashed border-line pt-3">
      <div className="space-y-2">
        <div className="rounded-lg border border-line bg-surface p-2.5 text-2xs">
          <p className="font-medium text-faint">{ticket.solicitante} · {fecha(ticket.creado)}</p>
          <p className="mt-1 text-ink">{ticket.descripcion}</p>
        </div>
        {ticket.comentarios.map((c) => (
          <div
            key={c.id}
            className={`rounded-lg border p-2.5 text-2xs ${c.deSistemas ? "border-action/25 bg-action/5" : "border-line bg-surface"}`}
          >
            <p className="font-medium text-faint">{c.autor} · {fecha(c.cuando)}</p>
            <p className="mt-1 text-ink">{c.texto}</p>
          </div>
        ))}
        {cerrada && (
          <p className="rounded-lg border border-line bg-ink/[0.03] px-2.5 py-2 text-2xs text-faint">
            Conversación cerrada{esSistemas ? " — se reabre sola si el solicitante escribe" : ""}.
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <textarea
          className={`${inputClass} min-h-[38px] flex-1`}
          placeholder={bloqueada ? "Reabrí la conversación para responder…" : "Responder…"}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          disabled={bloqueada}
        />
        <Button onClick={enviar} disabled={!texto.trim() || enviando || bloqueada}>
          {enviando ? "Enviando…" : "Responder"}
        </Button>
        {esSistemas && onToggleConversacion && (
          <button
            type="button"
            onClick={toggle}
            disabled={cambiando}
            className="text-2xs font-medium text-muted hover:text-ink disabled:opacity-50"
          >
            {cambiando ? "…" : cerrada ? "Reabrir conversación" : "Cerrar conversación"}
          </button>
        )}
      </div>
    </div>
  );
}
