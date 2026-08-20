"use client";

// Vista universal: cualquier cuenta logueada abre un ticket y ve el estado de
// los propios. Gestionarlos (asignar, cambiar estado) es del Panel de Sistemas
// (components/views/TicketsView.tsx) — acá solo se crea y se puede comentar.

import { useEffect, useState } from "react";
import { Card, Field, Button, EmptyState, Skeleton, inputClass } from "@/components/ui/primitives";
import { CATEGORIAS_TICKET, PRIORIDADES, estadoTicket, toneClsTicket, type Ticket } from "@/lib/tickets";
import TicketThread from "@/components/views/TicketThread";

const VACIO = { titulo: "", categoria: CATEGORIAS_TICKET[0], prioridad: "media", descripcion: "" };

export default function TicketNuevoView() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [estado, setEstado] = useState<"loading" | "ok" | "error">("loading");
  const [categorias, setCategorias] = useState<string[]>(CATEGORIAS_TICKET);
  const [form, setForm] = useState(VACIO);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState("");
  const [abierto, setAbierto] = useState<string | null>(null);

  async function cargar() {
    setEstado("loading");
    try {
      const [jt, jc] = await Promise.all([
        (await fetch("/api/tickets")).json(),
        (await fetch("/api/tickets/categorias")).json(),
      ]);
      if (!jt.ok) throw new Error();
      setTickets(jt.items);
      if (jc.ok) setCategorias(jc.categorias);
      setEstado("ok");
    } catch {
      setEstado("error");
    }
  }
  useEffect(() => {
    cargar();
  }, []);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!form.titulo.trim() || !form.descripcion.trim()) return;
    setGuardando(true);
    setMsg("");
    try {
      const j = await (
        await fetch("/api/tickets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) })
      ).json();
      if (!j.ok) throw new Error(j.error);
      setTickets(j.items);
      setForm(VACIO);
      setMsg("Ticket enviado. Lo va a ver sistemas apenas se conecte.");
    } catch (err) {
      setMsg(err instanceof Error && err.message ? err.message : "No se pudo enviar.");
    } finally {
      setGuardando(false);
    }
  }

  async function comentar(id: string, texto: string): Promise<boolean> {
    try {
      const j = await (
        await fetch("/api/tickets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, comentario: texto }) })
      ).json();
      if (!j.ok) throw new Error(j.error);
      setTickets(j.items);
      return true;
    } catch (err) {
      setMsg(err instanceof Error && err.message ? err.message : "No se pudo comentar.");
      return false;
    }
  }

  const campo = (k: keyof typeof VACIO) => ({
    value: form[k],
    onChange: (ev: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: ev.target.value })),
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-xl font-semibold text-ink">Tickets a sistemas</h1>
        <p className="mt-0.5 max-w-2xl text-sm text-muted">
          Contanos qué pasa — lo ve el equipo de sistemas apenas lo mandás, y podés seguir la conversación
          acá mismo.
        </p>
      </div>

      <Card className="p-4">
        <p className="text-2xs font-medium uppercase tracking-wide text-faint">Nuevo ticket</p>
        <form onSubmit={enviar} className="mt-3 space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Categoría">
              <select className={inputClass} {...campo("categoria")}>
                {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Prioridad">
              <select className={inputClass} {...campo("prioridad")}>
                {PRIORIDADES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Título *">
            <input className={inputClass} placeholder="Ej: La impresora de Caja no anda" {...campo("titulo")} />
          </Field>
          <Field label="Descripción *">
            <textarea
              className={`${inputClass} min-h-[80px]`}
              placeholder="Contá qué pasó, desde cuándo, y si hay un mensaje de error…"
              {...campo("descripcion")}
            />
          </Field>
          <Button type="submit" disabled={!form.titulo.trim() || !form.descripcion.trim() || guardando}>
            {guardando ? "Enviando…" : "Enviar ticket"}
          </Button>
        </form>
      </Card>

      {msg && <p className="text-2xs text-muted">{msg}</p>}

      <div>
        <p className="mb-2 text-2xs font-medium uppercase tracking-wide text-faint">Mis tickets</p>
        {estado === "loading" ? (
          <Card className="space-y-2 p-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</Card>
        ) : estado === "error" ? (
          <Card className="p-4 text-sm text-bad">No se pudieron cargar tus tickets.</Card>
        ) : tickets.length === 0 ? (
          <EmptyState title="Todavía no abriste ningún ticket" desc="Cuando mandes uno, va a aparecer acá con su estado." />
        ) : (
          <div className="space-y-2">
            {tickets.map((t) => {
              const es = estadoTicket(t.estado);
              const ab = abierto === t.id;
              return (
                <Card key={t.id} className="p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-ink">{t.titulo}</p>
                      <p className="text-2xs text-faint">#{t.nro} · {t.categoria}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full border px-2.5 py-1 text-2xs font-medium ${toneClsTicket(es.tone)}`}>{es.label}</span>
                      <button onClick={() => setAbierto(ab ? null : t.id)} className="text-2xs font-medium text-muted hover:text-ink">
                        {ab ? "Cerrar" : "Ver"}
                      </button>
                    </div>
                  </div>
                  {ab && <TicketThread ticket={t} onComentar={comentar} />}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
