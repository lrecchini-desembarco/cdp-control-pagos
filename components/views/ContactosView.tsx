"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, EmptyState, ErrorState, Field, SectionTitle, Skeleton, inputClass } from "@/components/ui/primitives";
import { waLink, telLink, mailLink, type Contacto } from "@/lib/contactos";

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const vacio = (): Partial<Contacto> => ({ nombre: "", empresa: "", rol: "", telefono: "", email: "", temas: "", notas: "", urgente: false });

export default function ContactosView() {
  const [contactos, setContactos] = useState<Contacto[]>([]);
  const [puedeEditar, setPuedeEditar] = useState(false);
  const [estado, setEstado] = useState<"cargando" | "listo" | "error">("cargando");
  const [errorMsg, setErrorMsg] = useState("");
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<Partial<Contacto> | null>(null); // null = modal cerrado
  const [guardando, setGuardando] = useState(false);
  const [errForm, setErrForm] = useState("");

  async function cargar() {
    setEstado("cargando");
    try {
      const j = await (await fetch("/api/contactos", { cache: "no-store" })).json();
      if (!j.ok) throw new Error(j.error || "No se pudo cargar.");
      setContactos(j.contactos ?? []);
      setPuedeEditar(Boolean(j.puedeEditar));
      setEstado("listo");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Error"); setEstado("error");
    }
  }
  useEffect(() => { cargar(); }, []);

  async function guardar() {
    if (!edit) return;
    if (!String(edit.nombre ?? "").trim()) { setErrForm("Poné al menos un nombre."); return; }
    setGuardando(true); setErrForm("");
    try {
      const j = await (await fetch("/api/contactos", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ contacto: edit }) })).json();
      if (!j.ok) throw new Error(j.error || "No se pudo guardar.");
      setContactos(j.contactos ?? []); setEdit(null);
    } catch (e) { setErrForm(e instanceof Error ? e.message : "Error al guardar."); }
    finally { setGuardando(false); }
  }
  async function borrar(c: Contacto) {
    if (!confirm(`¿Borrar a ${c.nombre}${c.empresa ? " (" + c.empresa + ")" : ""}? No se puede deshacer.`)) return;
    try {
      const j = await (await fetch(`/api/contactos?id=${encodeURIComponent(c.id)}`, { method: "DELETE" })).json();
      if (j.ok) setContactos(j.contactos ?? []);
    } catch { /* noop */ }
  }

  // Filtrado (búsqueda flat) o vista agrupada (sin búsqueda).
  const filtro = norm(q.trim());
  const filtrados = useMemo(() => {
    if (!filtro) return contactos;
    return contactos.filter((c) => norm([c.nombre, c.empresa, c.rol, c.temas, c.email, c.telefono, c.notas].filter(Boolean).join(" ")).includes(filtro));
  }, [contactos, filtro]);

  const urgentes = useMemo(() => filtrados.filter((c) => c.urgente).sort((a, b) => a.nombre.localeCompare(b.nombre)), [filtrados]);
  const porEmpresa = useMemo(() => {
    const base = filtro ? filtrados : filtrados.filter((c) => !c.urgente); // sin búsqueda, los urgentes van solo arriba
    const mapa = new Map<string, Contacto[]>();
    for (const c of base) {
      const k = c.empresa?.trim() || "Otros";
      const arr = mapa.get(k); if (arr) arr.push(c); else mapa.set(k, [c]);
    }
    return Array.from(mapa.entries())
      .map(([empresa, items]) => ({ empresa, items: items.sort((a, b) => a.nombre.localeCompare(b.nombre)) }))
      .sort((a, b) => (a.empresa === "Otros" ? 1 : b.empresa === "Otros" ? -1 : a.empresa.localeCompare(b.empresa)));
  }, [filtrados, filtro]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <SectionTitle hint="Con quién ver cada tema y cómo llegarle rápido: teléfono, mail y WhatsApp directo. Sumá personas o casillas de mail (soporte, facturación, etc.).">
          Contactos y datos importantes
        </SectionTitle>
        {puedeEditar && (
          <Button onClick={() => { setErrForm(""); setEdit(vacio()); }} className="!py-1.5 !text-xs">+ Agregar contacto</Button>
        )}
      </div>

      {estado !== "error" && (
        <input
          className={inputClass}
          placeholder="Buscar por nombre, empresa, tema…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      )}

      {estado === "cargando" && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-40" />)}</div>}
      {estado === "error" && <ErrorState msg={errorMsg} onRetry={cargar} />}

      {estado === "listo" && contactos.length === 0 && (
        <EmptyState
          title="Todavía no hay contactos"
          desc={puedeEditar ? "Agregá el primero: la persona o casilla, con quién ver cada tema y su teléfono/mail. Ej.: soporte de Tango, sistemas, tu contacto en el banco." : "El administrador todavía no cargó contactos."}
          action={puedeEditar ? <Button onClick={() => { setErrForm(""); setEdit(vacio()); }}>+ Agregar el primero</Button> : undefined}
        />
      )}

      {estado === "listo" && contactos.length > 0 && filtrados.length === 0 && (
        <p className="rounded-card border border-dashed border-line px-4 py-8 text-center text-sm text-muted">Nada coincide con “{q}”.</p>
      )}

      {estado === "listo" && !filtro && urgentes.length > 0 && (
        <div className="rounded-card border border-warn/30 bg-warn/[0.06] p-3">
          <p className="mb-2 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-warn">⚡ Resoluciones urgentes</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {urgentes.map((c) => <Tarjeta key={c.id} c={c} puedeEditar={puedeEditar} onEdit={() => { setErrForm(""); setEdit(c); }} onDel={() => borrar(c)} />)}
          </div>
        </div>
      )}

      {estado === "listo" && porEmpresa.map(({ empresa, items }) => (
        <div key={empresa}>
          <p className="mb-2 mt-1 text-2xs font-semibold uppercase tracking-wide text-faint">{empresa}</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((c) => <Tarjeta key={c.id} c={c} puedeEditar={puedeEditar} onEdit={() => { setErrForm(""); setEdit(c); }} onDel={() => borrar(c)} />)}
          </div>
        </div>
      ))}

      {edit && (
        <Modal onClose={() => setEdit(null)}>
          <p className="mb-3 font-display text-sm font-semibold text-ink">{edit.id ? "Editar contacto" : "Nuevo contacto"}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nombre o casilla"><input autoFocus className={inputClass} placeholder="Juan Pérez / Soporte Tango" value={edit.nombre ?? ""} onChange={(e) => setEdit({ ...edit, nombre: e.target.value })} /></Field>
            <Field label="Empresa"><input className={inputClass} placeholder="Tango, Reven, Banco…" value={edit.empresa ?? ""} onChange={(e) => setEdit({ ...edit, empresa: e.target.value })} /></Field>
            <Field label="Qué hace / cargo"><input className={inputClass} placeholder="Soporte técnico, ejecutivo de cuenta…" value={edit.rol ?? ""} onChange={(e) => setEdit({ ...edit, rol: e.target.value })} /></Field>
            <Field label="Teléfono" hint="Para WhatsApp y llamar. Con característica (ej. 11 5555 5555)."><input className={inputClass} placeholder="+54 9 11 5555 5555" value={edit.telefono ?? ""} onChange={(e) => setEdit({ ...edit, telefono: e.target.value })} /></Field>
            <Field label="Email"><input className={inputClass} placeholder="nombre@empresa.com" value={edit.email ?? ""} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></Field>
            <Field label="Con qué temas verlo"><input className={inputClass} placeholder="Integraciones Tango por local" value={edit.temas ?? ""} onChange={(e) => setEdit({ ...edit, temas: e.target.value })} /></Field>
          </div>
          <div className="mt-3"><Field label="Notas"><input className={inputClass} placeholder="Horario de atención, nº de cliente, etc." value={edit.notas ?? ""} onChange={(e) => setEdit({ ...edit, notas: e.target.value })} /></Field></div>
          <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={Boolean(edit.urgente)} onChange={(e) => setEdit({ ...edit, urgente: e.target.checked })} />
            Marcar como <b>urgente</b> (se destaca arriba para resolver rápido)
          </label>
          {errForm && <p className="mt-3 text-xs text-bad">{errForm}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEdit(null)} className="!py-1.5 !text-xs">Cancelar</Button>
            <Button onClick={guardar} disabled={guardando} className="!py-1.5 !text-xs">{guardando ? "Guardando…" : "Guardar"}</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Tarjeta({ c, puedeEditar, onEdit, onDel }: { c: Contacto; puedeEditar: boolean; onEdit: () => void; onDel: () => void }) {
  const wa = waLink(c.telefono), tel = telLink(c.telefono), mail = mailLink(c.email);
  return (
    <Card className="flex flex-col gap-2 p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">{c.nombre}</p>
          {c.rol && <p className="truncate text-2xs text-muted">{c.rol}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {c.urgente && <Badge tone="warn">urgente</Badge>}
          {c.empresa && <Badge tone="neutral">{c.empresa}</Badge>}
        </div>
      </div>

      {c.temas && <p className="text-xs text-muted"><span className="text-faint">Para: </span>{c.temas}</p>}

      {(c.telefono || c.email) && (
        <div className="mt-0.5 space-y-1 text-xs">
          {c.telefono && <p className="text-muted"><span className="text-faint">Tel: </span>{c.telefono}</p>}
          {c.email && <p className="truncate text-muted"><span className="text-faint">Mail: </span>{c.email}</p>}
        </div>
      )}

      {(wa || tel || mail) && (
        <div className="mt-1 flex flex-wrap gap-1.5">
          {wa && <a href={wa} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md bg-ok/10 px-2 py-1 text-2xs font-medium text-ok hover:bg-ok/20">WhatsApp</a>}
          {tel && <a href={tel} className="inline-flex items-center gap-1 rounded-md bg-ink/[0.04] px-2 py-1 text-2xs font-medium text-muted hover:bg-ink/[0.08]">Llamar</a>}
          {mail && <a href={mail} className="inline-flex items-center gap-1 rounded-md bg-action/10 px-2 py-1 text-2xs font-medium text-action hover:bg-action/20">Email</a>}
        </div>
      )}

      {c.notas && <p className="text-2xs text-faint">{c.notas}</p>}

      {puedeEditar && (
        <div className="mt-auto flex justify-end gap-2 border-t border-line/60 pt-2 text-2xs">
          <button onClick={onEdit} className="font-medium text-muted hover:text-ink">Editar</button>
          <button onClick={onDel} className="font-medium text-muted hover:text-bad">Borrar</button>
        </div>
      )}
    </Card>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4 sm:p-8" onClick={onClose}>
      <div className="w-full max-w-lg rounded-card border border-line bg-surface p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
