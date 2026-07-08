"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, Button, inputClass, Skeleton, EmptyState } from "@/components/ui/primitives";
import {
  construirArbol,
  caminoAlRaiz,
  descendientes,
  nodoDeEmail,
  type NodoOrg,
  type NodoArbol,
} from "@/lib/organigrama";

interface Datos {
  nodos: NodoOrg[];
  editable: boolean;
  email: string;
}

type Form = { id?: string; nombre: string; cargo: string; email: string; parentId: string | null; avisar: boolean };

const vacio = (parentId: string | null = null): Form => ({ nombre: "", cargo: "", email: "", parentId, avisar: true });

export default function OrganigramaView() {
  const [d, setD] = useState<Datos | null>(null);
  const [estado, setEstado] = useState<"loading" | "ok" | "error">("loading");
  const [form, setForm] = useState<Form | null>(null); // modal abierto
  const [msg, setMsg] = useState("");
  const [toast, setToast] = useState("");
  const [hoy, setHoy] = useState("");

  async function cargar() {
    setEstado("loading");
    try {
      const j = await (await fetch("/api/organigrama")).json();
      if (!j.ok) throw new Error();
      setD({ nodos: j.nodos, editable: !!j.editable, email: j.email || "" });
      setEstado("ok");
    } catch {
      setEstado("error");
    }
  }
  useEffect(() => {
    cargar();
    setHoy(new Date().toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" }));
  }, []);

  // Exportar a PDF: usa la impresión del navegador ("Guardar como PDF"). Inyecta
  // orientación apaisada solo para esta impresión (no toca el resto del sistema).
  function exportarPDF() {
    const st = document.createElement("style");
    st.id = "org-print-page";
    st.textContent = "@page { size: A4 landscape; margin: 8mm; }";
    document.head.appendChild(st);
    const limpiar = () => { document.getElementById("org-print-page")?.remove(); window.removeEventListener("afterprint", limpiar); };
    window.addEventListener("afterprint", limpiar);
    window.print();
    setTimeout(limpiar, 1000);
  }

  const nodos = d?.nodos ?? [];
  const editable = d?.editable ?? false;
  const arbol = useMemo(() => construirArbol(nodos), [nodos]);
  const miNodo = useMemo(() => nodoDeEmail(nodos, d?.email), [nodos, d?.email]);
  const miLinea = useMemo(() => (miNodo ? caminoAlRaiz(nodos, miNodo.id) : []), [nodos, miNodo]);

  async function post(body: unknown): Promise<any | null> {
    setMsg("");
    try {
      const j = await (await fetch("/api/organigrama", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      })).json();
      if (j.ok) setD((prev) => (prev ? { ...prev, nodos: j.nodos } : prev));
      else setMsg(j.error || "No se pudo guardar.");
      return j;
    } catch {
      setMsg("Error de red.");
      return null;
    }
  }

  function avisar(t: string) { setToast(t); setTimeout(() => setToast(""), 4000); }

  async function guardarForm(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    if (!form.nombre.trim() && !form.cargo.trim()) { setMsg("Poné al menos nombre o cargo."); return; }
    const esAlta = !form.id;
    const j = await post({
      ...(form.id ? { id: form.id } : {}),
      nombre: form.nombre, cargo: form.cargo, email: form.email, parentId: form.parentId,
      ...(esAlta ? { notificar: form.avisar } : {}),
    });
    if (j?.ok) {
      setForm(null);
      if (esAlta) {
        const nombre = form.nombre.trim() || form.cargo.trim();
        avisar(j.notificado?.enviado ? `Se agregó a ${nombre} y se avisó el ingreso.` : `Se agregó a ${nombre}.`);
      }
    }
  }

  async function borrar(n: NodoOrg) {
    const hijos = nodos.filter((x) => x.parentId === n.id).length;
    const aviso = hijos
      ? `¿Borrar a "${n.nombre || n.cargo}"? Sus ${hijos} dependiente(s) pasan a colgar de su jefe.`
      : `¿Borrar a "${n.nombre || n.cargo}" del organigrama?`;
    if (!confirm(aviso)) return;
    const j = await (await fetch(`/api/organigrama?id=${encodeURIComponent(n.id)}`, { method: "DELETE" })).json();
    if (j.ok) setD((prev) => (prev ? { ...prev, nodos: j.nodos } : prev));
    setForm(null);
  }

  const mover = (id: string, dir: -1 | 1) => post({ accion: "mover", id, dir });

  // Opciones de "jefe" para el modal: todos menos uno mismo y sus descendientes.
  const opcionesJefe = useMemo(() => {
    if (!form) return nodos;
    const excluir = form.id ? new Set([form.id, ...Array.from(descendientes(nodos, form.id))]) : new Set<string>();
    return nodos.filter((n) => !excluir.has(n.id));
  }, [form, nodos]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold text-ink">Organigrama</h1>
          <p className="mt-0.5 max-w-2xl text-sm text-muted">
            Quién reporta a quién. {editable
              ? "Agregá personas, cambialas de jefe y reordenalas — se guarda al instante."
              : "Podés verlo completo y ubicar tu casillero."}
          </p>
        </div>
        <div className="flex items-center gap-2 no-print">
          <Button variant="outline" onClick={exportarPDF} disabled={estado !== "ok" || arbol.length === 0}>⬇ Exportar PDF</Button>
          {editable && (
            <Button onClick={() => { setMsg(""); setForm(vacio(null)); }}>＋ Agregar persona</Button>
          )}
        </div>
      </div>

      {/* Tu ubicación */}
      {estado === "ok" && (
        miNodo ? (
          <Card className="flex flex-wrap items-center gap-x-2 gap-y-1 border-action/30 bg-action/5 p-3 text-sm">
            <span className="text-2xs font-semibold uppercase tracking-wide text-action">Estás acá</span>
            {miLinea.map((n, i) => (
              <span key={n.id} className="flex items-center gap-2">
                {i > 0 && <span className="text-faint">›</span>}
                <span className={i === miLinea.length - 1 ? "font-semibold text-ink" : "text-muted"}>
                  {n.nombre || n.cargo}
                  {n.cargo && n.nombre && <span className="text-faint"> · {n.cargo}</span>}
                </span>
              </span>
            ))}
          </Card>
        ) : (
          <Card className="border-warn/30 bg-warn/5 p-3 text-sm text-muted">
            Todavía no estás ubicado en el organigrama.{" "}
            {editable
              ? "Editá tu casillero y ponete tu email para que se resalte."
              : "Pedile a un admin que asigne tu email a tu casillero para verte resaltado."}
          </Card>
        )
      )}

      <Card id="print-area" className="overflow-hidden">
        <div className="hidden px-4 pt-4 print:block">
          <p className="font-display text-lg font-semibold text-ink">Organigrama · El Desembarco</p>
          <p className="text-2xs text-faint">Generado el {hoy}</p>
        </div>
        {estado === "loading" ? (
          <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : estado === "error" ? (
          <div className="p-4 text-sm text-bad">No se pudo cargar el organigrama.</div>
        ) : arbol.length === 0 ? (
          <EmptyState
            title="Organigrama vacío"
            desc={editable ? "Agregá la primera persona (arriba de todo, la máxima autoridad)." : "Todavía no se cargó."}
            action={editable ? <Button onClick={() => setForm(vacio(null))}>＋ Agregar persona</Button> : undefined}
          />
        ) : (
          <div className="overflow-x-auto p-4">
            <div className="min-w-max mx-auto">
              <ul className="org">
                {arbol.map((n) => (
                  <Rama key={n.id} n={n} miId={miNodo?.id} editable={editable}
                    onAdd={(pid) => { setMsg(""); setForm(vacio(pid)); }}
                    onEdit={(x) => { setMsg(""); setForm({ id: x.id, nombre: x.nombre, cargo: x.cargo, email: x.email ?? "", parentId: x.parentId, avisar: false }); }}
                    onMove={mover} onDelete={borrar} />
                ))}
              </ul>
            </div>
          </div>
        )}
      </Card>

      {/* Modal alta/edición */}
      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setForm(null)}>
          <div className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
          <Card className="p-5">
            <form onSubmit={guardarForm} className="space-y-3">
              <h2 className="font-display text-base font-semibold text-ink">
                {form.id ? "Editar casillero" : "Agregar persona"}
              </h2>
              <label className="block">
                <span className="mb-1 block text-2xs font-medium uppercase tracking-wide text-faint">Nombre</span>
                <input autoFocus className={inputClass} placeholder="Nombre y apellido"
                  value={form.nombre} onChange={(e) => setForm((f) => f && { ...f, nombre: e.target.value })} />
              </label>
              <label className="block">
                <span className="mb-1 block text-2xs font-medium uppercase tracking-wide text-faint">Cargo / área</span>
                <input className={inputClass} placeholder="Ej: Finanzas y tesorería"
                  value={form.cargo} onChange={(e) => setForm((f) => f && { ...f, cargo: e.target.value })} />
              </label>
              <label className="block">
                <span className="mb-1 block text-2xs font-medium uppercase tracking-wide text-faint">Reporta a (jefe)</span>
                <select className={inputClass} value={form.parentId ?? ""}
                  onChange={(e) => setForm((f) => f && { ...f, parentId: e.target.value || null })}>
                  <option value="">— Sin jefe (máxima autoridad) —</option>
                  {opcionesJefe.map((n) => (
                    <option key={n.id} value={n.id}>{n.nombre || n.cargo}{n.nombre && n.cargo ? ` · ${n.cargo}` : ""}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-2xs font-medium uppercase tracking-wide text-faint">Email (para resaltar su casillero)</span>
                <input type="email" className={inputClass} placeholder="nombre@eldesembarco.com"
                  value={form.email} onChange={(e) => setForm((f) => f && { ...f, email: e.target.value })} />
              </label>
              {!form.id && (
                <label className="flex items-start gap-2 rounded-lg border border-line bg-ink/[0.02] px-3 py-2">
                  <input type="checkbox" className="mt-0.5" checked={form.avisar}
                    onChange={(e) => setForm((f) => f && { ...f, avisar: e.target.checked })} />
                  <span className="text-2xs text-muted">
                    <span className="font-medium text-ink">Avisar el ingreso</span> por el canal de notificaciones (Slack).
                    Si no hay canal configurado, no se manda nada.
                  </span>
                </label>
              )}
              {msg && <p className="text-2xs text-bad">{msg}</p>}
              <div className="flex items-center gap-2 pt-1">
                <Button type="submit">{form.id ? "Guardar" : "Agregar"}</Button>
                <Button type="button" variant="ghost" onClick={() => setForm(null)}>Cancelar</Button>
                {form.id && (
                  <button type="button" onClick={() => { const n = nodos.find((x) => x.id === form.id); if (n) borrar(n); }}
                    className="ml-auto text-2xs font-medium text-bad hover:underline">Borrar</button>
                )}
              </div>
            </form>
          </Card>
          </div>
        </div>
      )}

      {toast && (
        <div className="no-print fixed bottom-5 right-5 z-50 rounded-lg border border-ok/30 bg-ok/10 px-4 py-2.5 text-sm font-medium text-ok shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

// Un nodo + su subárbol (recursivo).
function Rama({
  n, miId, editable, onAdd, onEdit, onMove, onDelete,
}: {
  n: NodoArbol;
  miId?: string;
  editable: boolean;
  onAdd: (parentId: string) => void;
  onEdit: (n: NodoOrg) => void;
  onMove: (id: string, dir: -1 | 1) => void;
  onDelete: (n: NodoOrg) => void;
}) {
  const esVos = n.id === miId;
  return (
    <li>
      <div className={`group relative w-[190px] rounded-xl border px-3 py-2 text-center shadow-sm transition-colors ${
        esVos ? "border-action bg-action/10 ring-2 ring-action/40" : "border-line bg-surface hover:border-action/40"
      }`}>
        {esVos && (
          <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-action px-2 py-0.5 text-[10px] font-semibold text-white">Vos</span>
        )}
        <p className="truncate text-sm font-semibold text-ink" title={n.cargo}>{n.cargo || "—"}</p>
        <p className="truncate text-2xs text-muted" title={n.nombre}>{n.nombre || <span className="text-faint">Sin asignar</span>}</p>

        {editable && (
          <div className="pointer-events-none absolute -bottom-3 left-1/2 z-10 flex -translate-x-1/2 gap-0.5 rounded-full border border-line bg-surface px-1 py-0.5 opacity-0 shadow-sm transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
            <Mini title="Agregar dependiente" onClick={() => onAdd(n.id)}>＋</Mini>
            <Mini title="Editar" onClick={() => onEdit(n)}>✎</Mini>
            <Mini title="Subir" onClick={() => onMove(n.id, -1)}>↑</Mini>
            <Mini title="Bajar" onClick={() => onMove(n.id, 1)}>↓</Mini>
            <Mini title="Borrar" danger onClick={() => onDelete(n)}>✕</Mini>
          </div>
        )}
      </div>

      {n.hijos.length > 0 && (
        <ul>
          {n.hijos.map((h) => (
            <Rama key={h.id} n={h} miId={miId} editable={editable}
              onAdd={onAdd} onEdit={onEdit} onMove={onMove} onDelete={onDelete} />
          ))}
        </ul>
      )}
    </li>
  );
}

function Mini({ children, title, onClick, danger }: { children: React.ReactNode; title: string; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" title={title} onClick={onClick}
      className={`grid h-5 w-5 place-items-center rounded-full text-[11px] leading-none ${
        danger ? "text-bad hover:bg-bad/10" : "text-muted hover:bg-ink/10 hover:text-ink"
      }`}>
      {children}
    </button>
  );
}
