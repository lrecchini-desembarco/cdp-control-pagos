"use client";

// Gestión de tickets para sistemas: pestaña del Panel de Sistemas. Cualquier
// cuenta con acceso al panel puede tomar, reasignar y resolver — el pool de
// "asignado a" es la misma lista de acceso del panel (Inicio → Quién tiene acceso).
//
// Rediseño (handoff "consola aparte"): las 4 stat-cards pasan a ser la tira de
// estados (y el filtro a la vez), los 3 <select> + botones de Trello se
// colapsan en un renglón de comando con chips, y el editor de categorías pasa
// a un cajón colapsable. Mismos endpoints y mismo estado de siempre — solo
// cambia cómo se ven los controles.

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, EmptyState, Skeleton, inputClass } from "@/components/ui/primitives";
import { PRIORIDADES, ESTADOS_TICKET, prioridad, estadoTicket, toneClsTicket, type PrioridadTicket, type Ticket } from "@/lib/tickets";
import TicketThread from "@/components/views/TicketThread";

type FiltroEstado = "" | "abierto" | "en-curso" | "espera" | "resuelto";

export default function TicketsView() {
  const router = useRouter();
  const params = useSearchParams();

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [estadoCarga, setEstadoCarga] = useState<"loading" | "ok" | "error">("loading");
  const [staff, setStaff] = useState<string[]>([]);
  const [categorias, setCategorias] = useState<string[]>([]);

  const [fEstado, setFEstado] = useState<FiltroEstado>((params.get("estado") as FiltroEstado) || "");
  const [fPrioridad, setFPrioridad] = useState<PrioridadTicket | "">((params.get("prioridad") as PrioridadTicket) || "");
  const [fCategoria, setFCategoria] = useState(params.get("categoria") || "");
  const [q, setQ] = useState(params.get("q") || "");

  const [detalle, setDetalle] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [cargando, setCargando] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [recategorizando, setRecategorizando] = useState(false);
  const [nuevaCategoria, setNuevaCategoria] = useState("");

  const [cajonCategorias, setCajonCategorias] = useState(false);
  const [agregandoCategoria, setAgregandoCategoria] = useState(false);
  const [menuTrello, setMenuTrello] = useState(false);
  const [chipAbierto, setChipAbierto] = useState<"prioridad" | "categoria" | null>(null);

  // Filtros compartibles por link (deep-link de la paleta de comandos incluido).
  useEffect(() => {
    const p = new URLSearchParams();
    if (fEstado) p.set("estado", fEstado);
    if (fPrioridad) p.set("prioridad", fPrioridad);
    if (fCategoria) p.set("categoria", fCategoria);
    if (q.trim()) p.set("q", q.trim());
    const qs = p.toString();
    router.replace(qs ? `/panel-sistemas/tickets?${qs}` : "/panel-sistemas/tickets", { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fEstado, fPrioridad, fCategoria, q]);

  async function cargar() {
    setEstadoCarga("loading");
    setCargando(true);
    try {
      const [jt, ja, jc] = await Promise.all([
        (await fetch("/api/tickets")).json(),
        (await fetch("/api/panel-sistemas/usuarios")).json(),
        (await fetch("/api/tickets/categorias")).json(),
      ]);
      if (!jt.ok) throw new Error();
      setTickets(jt.items);
      if (ja.ok) setStaff([...ja.base, ...ja.extra]);
      if (jc.ok) setCategorias(jc.categorias);
      setEstadoCarga("ok");
    } catch {
      setEstadoCarga("error");
    } finally {
      setCargando(false);
    }
  }
  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function sincronizarTrello() {
    setMsg("");
    setSincronizando(true);
    try {
      const j = await (await fetch("/api/tickets/importar-trello", { method: "POST" })).json();
      if (!j.ok) throw new Error(j.error);
      setTickets(j.items);
      setMsg(j.agregados > 0 ? `Se importaron ${j.agregados} ticket${j.agregados === 1 ? "" : "s"} nuevo${j.agregados === 1 ? "" : "s"} desde Trello.` : "No hay cards nuevas en Trello.");
    } catch (err) {
      setMsg(err instanceof Error && err.message ? err.message : "No se pudo sincronizar con Trello.");
    } finally {
      setSincronizando(false);
      setMenuTrello(false);
    }
  }

  async function recategorizarTrello() {
    setMsg("");
    setRecategorizando(true);
    try {
      const j = await (await fetch("/api/tickets/recategorizar-trello", { method: "POST" })).json();
      if (!j.ok) throw new Error(j.error);
      setTickets(j.items);
      const partes = [`Se actualizaron ${j.actualizados} ticket${j.actualizados === 1 ? "" : "s"}.`];
      if (j.sinCard > 0) partes.push(`${j.sinCard} card${j.sinCard === 1 ? "" : "s"} ya no existe${j.sinCard === 1 ? "" : "n"} en Trello.`);
      setMsg(partes.join(" "));
    } catch (err) {
      setMsg(err instanceof Error && err.message ? err.message : "No se pudo recategorizar desde Trello.");
    } finally {
      setRecategorizando(false);
      setMenuTrello(false);
    }
  }

  async function agregarCategoria() {
    const c = nuevaCategoria.trim();
    if (!c || categorias.includes(c)) return;
    await guardarCategorias([...categorias, c]);
    setNuevaCategoria("");
    setAgregandoCategoria(false);
  }
  async function quitarCategoria(c: string) {
    await guardarCategorias(categorias.filter((x) => x !== c));
  }
  async function guardarCategorias(lista: string[]) {
    try {
      const j = await (
        await fetch("/api/tickets/categorias", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ categorias: lista }) })
      ).json();
      if (j.ok) setCategorias(j.categorias);
      else setMsg(j.error ?? "No se pudo guardar la categoría.");
    } catch {
      setMsg("Error de red.");
    }
  }

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

  async function toggleConversacion(id: string, cerrar: boolean): Promise<boolean> {
    setMsg("");
    try {
      const j = await (
        await fetch("/api/tickets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, conversacionCerrada: cerrar }),
        })
      ).json();
      if (!j.ok) throw new Error(j.error);
      setTickets(j.items);
      return true;
    } catch (err) {
      setMsg(err instanceof Error && err.message ? err.message : "No se pudo cambiar la conversación.");
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

  const TIRA: { id: FiltroEstado; n: number; label: string }[] = [
    { id: "abierto", n: stats.abiertos, label: "abiertos" },
    { id: "en-curso", n: stats.enCurso, label: "en curso" },
    { id: "espera", n: stats.espera, label: "esperan al usuario" },
    { id: "resuelto", n: stats.resueltosSemana, label: "resueltos esta semana" },
  ];

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
    <div className="space-y-0">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="font-display text-[23px] font-semibold tracking-[-.02em] text-[#ece9e2]">Tickets</h1>
          <p className="mt-1 max-w-[640px] text-[12.5px] leading-[1.5] text-ink/55">
            Lo que la empresa le pide a sistemas: prioridad, quién lo atiende y el historial de la conversación.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <button
              onClick={() => setMenuTrello((v) => !v)}
              className="rounded border border-ink/20 px-3 py-[7px] font-display text-[13px] font-semibold text-ink/75 transition-colors hover:border-action/60 hover:text-action"
            >
              Trello ▾
            </button>
            {menuTrello && (
              <div className="absolute right-0 z-20 mt-1.5 w-64 overflow-hidden rounded border border-line bg-surface shadow-[0_16px_40px_rgba(0,0,0,.35)]">
                <button onClick={sincronizarTrello} disabled={sincronizando} className="block w-full px-3.5 py-2.5 text-left text-[12.5px] text-ink hover:bg-action/8 disabled:opacity-50">
                  {sincronizando ? "Sincronizando…" : "Sincronizar con Trello"}
                </button>
                <button onClick={recategorizarTrello} disabled={recategorizando} className="block w-full px-3.5 py-2.5 text-left text-[12.5px] text-ink hover:bg-action/8 disabled:opacity-50">
                  {recategorizando ? "Recategorizando…" : "Recategorizar desde Trello"}
                </button>
                <button onClick={() => { cargar(); setMenuTrello(false); }} disabled={cargando} className="block w-full border-t border-line px-3.5 py-2.5 text-left text-[12.5px] text-ink hover:bg-action/8 disabled:opacity-50">
                  {cargando ? "Actualizando…" : "↻ Actualizar lista"}
                </button>
              </div>
            )}
          </div>
          <Link
            href="/tickets"
            className="rounded border border-action px-3.5 py-[7px] font-display text-[13px] font-semibold text-action transition-colors hover:bg-action/[.12]"
          >
            + Nuevo ticket
          </Link>
        </div>
      </div>

      {/* Tira de estados — también es el filtro (reemplaza el <select> de estado) */}
      <div className="mt-[18px] grid grid-cols-4 border-t border-action/30 border-b border-ink/10">
        {TIRA.map((m, i) => {
          const activo = fEstado === m.id;
          return (
            <button
              key={m.id}
              onClick={() => setFEstado(activo ? "" : m.id)}
              className={`flex items-baseline gap-2 px-3.5 py-[11px] text-left transition-colors ${i < TIRA.length - 1 ? "border-r border-ink/8" : ""} ${
                activo ? "bg-action/8" : "hover:bg-ink/4"
              }`}
            >
              <span className={`tnum font-mono text-[19px] ${activo ? "text-action" : "text-ink/85"}`}>{m.n}</span>
              <span className={`text-[11.5px] ${activo ? "text-[#d3ecee]" : "text-ink/50"}`}>{m.label}</span>
            </button>
          );
        })}
      </div>

      {/* Renglón de comando */}
      <div className="flex flex-wrap items-center gap-2.5 border-b border-ink/10 py-3">
        <div className="flex flex-1 items-center gap-2 rounded border border-ink/18 bg-ink/[.03] px-2.5 py-[7px]">
          <span className="text-[11px] text-ink/40">⌕</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar ticket, persona o local…"
            className="flex-1 bg-transparent text-[12.5px] text-ink placeholder:text-ink/40 focus:outline-none"
          />
        </div>

        <ChipFiltro
          label="prioridad"
          abierto={chipAbierto === "prioridad"}
          onAbrir={() => setChipAbierto(chipAbierto === "prioridad" ? null : "prioridad")}
          aplicado={fPrioridad ? prioridad(fPrioridad).label.split(" (")[0] : null}
          onQuitar={() => setFPrioridad("")}
        >
          {PRIORIDADES.map((p) => (
            <button key={p.id} onClick={() => { setFPrioridad(p.id); setChipAbierto(null); }} className="block w-full px-3 py-2 text-left text-[12.5px] text-ink hover:bg-action/8">
              {p.label}
            </button>
          ))}
        </ChipFiltro>

        <ChipFiltro
          label="categoría"
          abierto={chipAbierto === "categoria"}
          onAbrir={() => setChipAbierto(chipAbierto === "categoria" ? null : "categoria")}
          aplicado={fCategoria || null}
          onQuitar={() => setFCategoria("")}
        >
          {categorias.map((c) => (
            <button key={c} onClick={() => { setFCategoria(c); setChipAbierto(null); }} className="block w-full px-3 py-2 text-left text-[12.5px] text-ink hover:bg-action/8">
              {c}
            </button>
          ))}
        </ChipFiltro>

        <span className="h-5 w-px bg-ink/14" />
        <button onClick={() => setCajonCategorias((v) => !v)} className="text-[11.5px] text-ink/55 underline decoration-ink/30 hover:text-action">
          Editar categorías ({categorias.length})
        </button>
        <span className="tnum ml-auto font-mono text-[10.5px] text-ink/35">{filtrados.length} de {tickets.length}</span>
      </div>

      {/* Cajón de categorías — colapsado por default */}
      {cajonCategorias && (
        <div className="flex flex-wrap items-center gap-1.5 border border-t-0 border-action/35 bg-action/5 px-3.5 py-3">
          <span className="mr-1.5 font-mono text-[9.5px] uppercase tracking-[.18em] text-action">Categorías</span>
          {categorias.map((c) => (
            <span key={c} className="inline-flex items-center gap-1.5 rounded-full border border-ink/20 px-2.5 py-[3px] text-[11px] text-ink/80">
              {c}
              <button onClick={() => quitarCategoria(c)} title={`Quitar "${c}"`} className="text-ink/35 hover:text-bad">✕</button>
            </span>
          ))}
          {agregandoCategoria ? (
            <input
              autoFocus
              className={`${inputClass} max-w-[160px] py-1 text-[11px]`}
              placeholder="Nombre…"
              value={nuevaCategoria}
              onChange={(e) => setNuevaCategoria(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && agregarCategoria()}
              onBlur={() => !nuevaCategoria.trim() && setAgregandoCategoria(false)}
            />
          ) : (
            <button onClick={() => setAgregandoCategoria(true)} className="rounded-full border border-dashed border-ink/25 px-2.5 py-[3px] text-[11px] text-ink/45 hover:border-action/60 hover:text-action">
              + nueva
            </button>
          )}
          <button onClick={() => setCajonCategorias(false)} className="ml-auto text-[11px] text-action hover:underline">
            Cerrar cajón
          </button>
        </div>
      )}

      {msg && <p className="pt-2.5 text-2xs text-bad">{msg}</p>}

      <div className="pt-4">
        {estadoCarga === "loading" ? (
          <Card className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</Card>
        ) : estadoCarga === "error" ? (
          <p className="p-4 text-sm text-bad">No se pudieron cargar los tickets.</p>
        ) : filtrados.length === 0 ? (
          <EmptyState title={tickets.length ? "Sin resultados" : "No hay tickets"} desc={tickets.length ? "Probá aflojando los filtros." : "Todavía nadie mandó un ticket."} />
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[720px]">
              <div className="sticky top-0 z-10 grid grid-cols-[1fr_108px_152px_130px_96px] gap-3 border-b border-action/28 bg-paper py-2 font-mono text-[9.5px] uppercase tracking-[.16em] text-ink/40">
                <span>Ticket</span>
                <span>Categoría</span>
                <span>Estado</span>
                <span>Asignado</span>
                <span className="text-right">Últ. mov.</span>
              </div>
              {filtrados.map((t) => {
                const es = estadoTicket(t.estado);
                const ab = detalle === t.id;
                return (
                  <Fragment key={t.id}>
                    <div
                      onClick={() => setDetalle(ab ? null : t.id)}
                      className="grid cursor-pointer grid-cols-[1fr_108px_152px_130px_96px] items-center gap-3 border-b border-ink/7 py-[11px] hover:bg-ink/[.035]"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="shrink-0 font-mono text-[10.5px] text-ink/32">#{t.nro}</span>
                          <span className={`h-[5px] w-[5px] shrink-0 rounded-full ${dotDeTono(es.tone)}`} aria-hidden />
                          <span className="truncate font-display text-[13.5px] font-semibold text-[#ece9e2]">{t.titulo}</span>
                        </div>
                        <p className="truncate pl-[38px] text-[11px] text-ink/42">
                          {t.solicitante}
                          {t.origen === "whatsapp" && " · WhatsApp"}
                          {t.origen === "trello" && " · Trello"}
                        </p>
                      </div>
                      <span className="truncate text-[11.5px] text-ink/60">{t.categoria}</span>
                      <span onClick={(e) => e.stopPropagation()}>
                        <select
                          value={t.estado}
                          onChange={(e) => actualizar(t.id, { estado: e.target.value })}
                          className={`rounded border px-2 py-1 text-[11px] font-medium ${toneClsTicket(es.tone)}`}
                        >
                          {ESTADOS_TICKET.map((x) => <option key={x.id} value={x.id} className="bg-surface text-ink">{x.label}</option>)}
                        </select>
                      </span>
                      <span onClick={(e) => e.stopPropagation()}>
                        <select
                          value={t.asignado ?? ""}
                          onChange={(e) => actualizar(t.id, { asignado: e.target.value })}
                          className={`${inputClass} py-1 text-[11.5px]`}
                        >
                          <option value="">— sin asignar —</option>
                          {staff.map((e) => <option key={e} value={e}>{e}</option>)}
                        </select>
                      </span>
                      <span className="tnum text-right font-mono text-[10.5px] text-ink/40">
                        {new Date(t.actualizado).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    {ab && (
                      <div className="border-b border-ink/7 bg-ink/[.02] px-2 py-3" onClick={(e) => e.stopPropagation()}>
                        {t.trelloUrl && (
                          <a href={t.trelloUrl} target="_blank" rel="noreferrer" className="mb-1 inline-block text-2xs text-action hover:underline">
                            Ver en Trello ↗
                          </a>
                        )}
                        <TicketThread ticket={t} onComentar={comentar} esSistemas onToggleConversacion={toggleConversacion} />
                      </div>
                    )}
                  </Fragment>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function dotDeTono(tone: string) {
  return (
    {
      ok: "bg-ok",
      action: "bg-action",
      warn: "bg-warn",
      bad: "bg-bad",
      muted: "bg-ink/30",
    }[tone] ?? "bg-ink/30"
  );
}

// Chip "+ x" que abre un desplegable de opciones y se convierte en chip
// aplicado (con ✕) al elegir un valor. Cierra al elegir o al clickear afuera.
function ChipFiltro({
  label,
  abierto,
  onAbrir,
  aplicado,
  onQuitar,
  children,
}: {
  label: string;
  abierto: boolean;
  onAbrir: () => void;
  aplicado: string | null;
  onQuitar: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!abierto) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onAbrir();
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [abierto, onAbrir]);

  if (aplicado) {
    return (
      <button onClick={onQuitar} className="flex items-center gap-1.5 rounded border border-action/45 bg-action/10 px-2.5 py-[7px] text-[11.5px] text-action">
        {aplicado} <span aria-hidden>✕</span>
      </button>
    );
  }
  return (
    <div ref={ref} className="relative">
      <button
        onClick={onAbrir}
        className="rounded border border-dashed border-ink/22 px-2.5 py-[7px] text-[11.5px] text-ink/62 transition-colors hover:border-action/60 hover:text-action"
      >
        + {label}
      </button>
      {abierto && (
        <div className="absolute left-0 z-20 mt-1.5 max-h-64 w-52 overflow-y-auto rounded border border-line bg-surface shadow-[0_16px_40px_rgba(0,0,0,.35)]">
          {children}
        </div>
      )}
    </div>
  );
}
