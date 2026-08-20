"use client";

// Gestión de tickets para sistemas: pestaña del Panel de Sistemas. Cualquier
// cuenta con acceso al panel puede tomar, reasignar y resolver — el pool de
// "asignado a" es la misma lista de acceso del panel (Inicio → Quién tiene acceso).

import { Fragment, useEffect, useMemo, useState } from "react";
import { Card, Button, EmptyState, Skeleton, inputClass } from "@/components/ui/primitives";
import { CATEGORIAS_TICKET, PRIORIDADES, ESTADOS_TICKET, prioridad, estadoTicket, toneClsTicket, type Ticket } from "@/lib/tickets";
import TicketThread from "@/components/views/TicketThread";

export default function TicketsView() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [estadoCarga, setEstadoCarga] = useState<"loading" | "ok" | "error">("loading");
  const [staff, setStaff] = useState<string[]>([]);
  const [fEstado, setFEstado] = useState("");
  const [fPrioridad, setFPrioridad] = useState("");
  const [fCategoria, setFCategoria] = useState("");
  const [q, setQ] = useState("");
  const [detalle, setDetalle] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [cargando, setCargando] = useState(false);

  async function cargar() {
    setEstadoCarga("loading");
    setCargando(true);
    try {
      const [jt, ja] = await Promise.all([
        (await fetch("/api/tickets")).json(),
        (await fetch("/api/panel-sistemas/usuarios")).json(),
      ]);
      if (!jt.ok) throw new Error();
      setTickets(jt.items);
      if (ja.ok) setStaff([...ja.base, ...ja.extra]);
      setEstadoCarga("ok");
    } catch {
      setEstadoCarga("error");
    } finally {
      setCargando(false);
    }
  }
  useEffect(() => {
    cargar();
  }, []);

  async function actualizar(id: string, patch: Record<string, string>) {
    setMsg("");
    setTickets((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    try {
      const j = await (
        await fetch("/api/tickets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...patch }) })
      ).json();
      if (j.ok) setTickets(j.items);
      else setMsg(j.error || "No se pudo guardar.");
    } catch {
      setMsg("Error de red.");
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

  const stats = useMemo(() => {
    const hace7d = Date.now() - 7 * 86_400_000;
    return {
      abiertos: tickets.filter((t) => t.estado === "abierto").length,
      enCurso: tickets.filter((t) => t.estado === "en-curso").length,
      espera: tickets.filter((t) => t.estado === "espera").length,
      resueltosSemana: tickets.filter((t) => (t.estado === "resuelto" || t.estado === "cerrado") && Date.parse(t.actualizado) >= hace7d).length,
    };
  }, [tickets]);

  const filtrados = useMemo(() => {
    let l = tickets;
    if (fEstado) l = l.filter((t) => t.estado === fEstado);
    if (fPrioridad) l = l.filter((t) => t.prioridad === fPrioridad);
    if (fCategoria) l = l.filter((t) => t.categoria === fCategoria);
    const t = q.trim().toLowerCase();
    if (t) l = l.filter((x) => `${x.titulo} ${x.solicitante} ${x.descripcion}`.toLowerCase().includes(t));
    return l;
  }, [tickets, fEstado, fPrioridad, fCategoria, q]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-xl font-semibold text-ink">Tickets</h1>
        <p className="mt-0.5 max-w-2xl text-sm text-muted">
          Lo que la empresa le pide a sistemas: prioridad, quién lo atiende y el historial de la conversación.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Card className="p-3.5">
          <p className="font-mono text-2xl font-semibold text-bad">{stats.abiertos}</p>
          <p className="text-2xs text-muted">Abiertos</p>
        </Card>
        <Card className="p-3.5">
          <p className="font-mono text-2xl font-semibold text-warn">{stats.enCurso}</p>
          <p className="text-2xs text-muted">En curso</p>
        </Card>
        <Card className="p-3.5">
          <p className="font-mono text-2xl font-semibold text-action">{stats.espera}</p>
          <p className="text-2xs text-muted">Esperando al usuario</p>
        </Card>
        <Card className="p-3.5">
          <p className="font-mono text-2xl font-semibold text-ok">{stats.resueltosSemana}</p>
          <p className="text-2xs text-muted">Resueltos esta semana</p>
        </Card>
      </div>

      <Card className="flex flex-wrap items-center justify-between gap-2 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <select className={`${inputClass} max-w-[170px] py-1`} value={fEstado} onChange={(e) => setFEstado(e.target.value)}>
            <option value="">Todos los estados</option>
            {ESTADOS_TICKET.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
          </select>
          <select className={`${inputClass} max-w-[150px] py-1`} value={fPrioridad} onChange={(e) => setFPrioridad(e.target.value)}>
            <option value="">Toda prioridad</option>
            {PRIORIDADES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
          <select className={`${inputClass} max-w-[170px] py-1`} value={fCategoria} onChange={(e) => setFCategoria(e.target.value)}>
            <option value="">Toda categoría</option>
            {CATEGORIAS_TICKET.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input className={`${inputClass} max-w-[200px] py-1`} placeholder="Buscar ticket, persona…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-2xs text-faint">{filtrados.length} de {tickets.length}</span>
          <Button variant="ghost" onClick={cargar} disabled={cargando} className="px-2 py-1 text-2xs h-auto">
            {cargando ? "..." : "↻"}
          </Button>
        </div>
      </Card>

      {msg && <p className="text-2xs text-bad">{msg}</p>}

      {estadoCarga === "loading" ? (
        <Card className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</Card>
      ) : estadoCarga === "error" ? (
        <Card className="p-4 text-sm text-bad">No se pudieron cargar los tickets.</Card>
      ) : filtrados.length === 0 ? (
        <EmptyState title={tickets.length ? "Sin resultados" : "No hay tickets"} desc={tickets.length ? "Probá aflojando los filtros." : "Todavía nadie mandó un ticket."} />
      ) : (
        <Card className="overflow-hidden">
          <div className="max-h-[70vh] overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 z-10 bg-surface">
                <tr className="border-b border-line text-2xs uppercase tracking-wide text-faint">
                  <th className="px-4 py-2 font-medium">Ticket</th>
                  <th className="px-3 py-2 font-medium">Categoría</th>
                  <th className="px-3 py-2 font-medium">Prioridad</th>
                  <th className="px-3 py-2 font-medium">Estado</th>
                  <th className="px-3 py-2 font-medium">Asignado</th>
                  <th className="px-3 py-2 font-medium">Actualizado</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((t) => {
                  const es = estadoTicket(t.estado);
                  const pr = prioridad(t.prioridad);
                  const ab = detalle === t.id;
                  return (
                    <Fragment key={t.id}>
                      <tr className="border-b border-line/70 hover:bg-ink/[0.02]">
                        <td className="px-4 py-2">
                          <p className="font-medium text-ink">
                            {t.titulo}
                            {t.origen === "whatsapp" && (
                              <span className="ml-1.5 rounded border border-ok/30 bg-ok/10 px-1.5 py-0.5 text-[10px] font-medium text-ok">WhatsApp</span>
                            )}
                          </p>
                          <p className="text-2xs text-faint">
                            #{t.nro} · {t.solicitante}
                            {t.trelloUrl && (
                              <>
                                {" · "}
                                <a href={t.trelloUrl} target="_blank" rel="noreferrer" className="text-action hover:underline">Ver en Trello ↗</a>
                              </>
                            )}
                          </p>
                        </td>
                        <td className="px-3 py-2 text-2xs text-muted">{t.categoria}</td>
                        <td className="px-3 py-2">
                          <span className={`rounded-full border px-2 py-0.5 text-2xs font-medium ${toneClsTicket(pr.tone)}`}>{pr.label.split(" (")[0]}</span>
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={t.estado}
                            onChange={(e) => actualizar(t.id, { estado: e.target.value })}
                            className={`rounded-full border px-2 py-1 text-2xs font-medium ${toneClsTicket(es.tone)}`}
                          >
                            {ESTADOS_TICKET.map((x) => <option key={x.id} value={x.id} className="bg-surface text-ink">{x.label}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={t.asignado ?? ""}
                            onChange={(e) => actualizar(t.id, { asignado: e.target.value })}
                            className={`${inputClass} max-w-[160px] py-1 text-2xs`}
                          >
                            <option value="">— sin asignar —</option>
                            {staff.map((e) => <option key={e} value={e}>{e}</option>)}
                          </select>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-2xs text-faint">
                          {new Date(t.actualizado).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button onClick={() => setDetalle(ab ? null : t.id)} className="text-2xs font-medium text-muted hover:text-ink">
                            {ab ? "Cerrar" : "Ver"}
                          </button>
                        </td>
                      </tr>
                      {ab && (
                        <tr className="border-b border-line/70 bg-ink/[0.02]">
                          <td colSpan={7} className="px-4 py-3">
                            <TicketThread ticket={t} onComentar={comentar} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
