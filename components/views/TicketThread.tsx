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
}: {
  ticket: Ticket;
  onComentar: (id: string, texto: string) => Promise<boolean>;
}) {
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function enviar() {
    if (!texto.trim()) return;
    setEnviando(true);
    if (await onComentar(ticket.id, texto)) setTexto("");
    setEnviando(false);
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
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <textarea
          className={`${inputClass} min-h-[38px] flex-1`}
          placeholder="Responder…"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
        <Button onClick={enviar} disabled={!texto.trim() || enviando}>
          {enviando ? "Enviando…" : "Responder"}
        </Button>
      </div>
    </div>
  );
}
