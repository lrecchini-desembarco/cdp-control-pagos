"use client";

// Usuarios de Google Workspace: listado con su OU, card flotante con permisos
// (admin, 2FA, grupos, shared drives) al hacer click, y carga masiva de la
// foto de perfil corporativa sobre los usuarios que se tilden.

import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, EmptyState, Skeleton, inputClass } from "@/components/ui/primitives";

interface WorkspaceUsuario {
  email: string;
  nombre: string;
  ou: string;
  suspendido: boolean;
  fotoUrl?: string;
}

interface WorkspaceDetalle {
  isAdmin: boolean;
  isDelegatedAdmin: boolean;
  is2svEnrolled: boolean;
  lastLoginTime?: string;
  grupos: string[];
  unidadesCompartidas: { nombre: string; rol: string }[];
}

export default function WorkspaceView() {
  const [usuarios, setUsuarios] = useState<WorkspaceUsuario[]>([]);
  const [estado, setEstado] = useState<"loading" | "ok" | "error" | "no-config">("loading");
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [fOu, setFOu] = useState("");

  const [abierto, setAbierto] = useState<WorkspaceUsuario | null>(null);
  const [detalle, setDetalle] = useState<WorkspaceDetalle | null>(null);
  const [detalleEstado, setDetalleEstado] = useState<"loading" | "ok" | "error">("loading");

  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [foto, setFoto] = useState<File | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [resultados, setResultados] = useState<{ email: string; ok: boolean; error?: string }[] | null>(null);

  async function cargar() {
    setEstado("loading");
    setError("");
    try {
      const j = await (await fetch("/api/panel-sistemas/workspace/usuarios")).json();
      if (!j.ok) {
        setEstado(j.error?.includes("no está configurado") ? "no-config" : "error");
        setError(j.error ?? "");
        return;
      }
      setUsuarios(j.usuarios);
      setEstado("ok");
    } catch {
      setEstado("error");
      setError("Error de red.");
    }
  }
  useEffect(() => {
    cargar();
  }, []);

  const ous = useMemo(() => Array.from(new Set(usuarios.map((u) => u.ou))).sort(), [usuarios]);

  const filtrados = useMemo(() => {
    let l = usuarios;
    if (fOu) l = l.filter((u) => u.ou === fOu);
    const t = q.trim().toLowerCase();
    if (t) l = l.filter((u) => `${u.nombre} ${u.email}`.toLowerCase().includes(t));
    return l;
  }, [usuarios, fOu, q]);

  async function abrirCard(u: WorkspaceUsuario) {
    setAbierto(u);
    setDetalle(null);
    setDetalleEstado("loading");
    try {
      const j = await (await fetch(`/api/panel-sistemas/workspace/usuarios?email=${encodeURIComponent(u.email)}`)).json();
      if (!j.ok) throw new Error(j.error);
      setDetalle(j.detalle);
      setDetalleEstado("ok");
    } catch {
      setDetalleEstado("error");
    }
  }

  function toggleSeleccion(email: string) {
    setSeleccion((s) => {
      const n = new Set(s);
      if (n.has(email)) n.delete(email);
      else n.add(email);
      return n;
    });
  }
  function toggleTodos() {
    setSeleccion((s) => (s.size === filtrados.length ? new Set() : new Set(filtrados.map((u) => u.email))));
  }

  async function subirFoto() {
    if (!foto || seleccion.size === 0) return;
    setSubiendo(true);
    setResultados(null);
    try {
      const form = new FormData();
      form.append("foto", foto);
      form.append("emails", JSON.stringify(Array.from(seleccion)));
      const j = await (await fetch("/api/panel-sistemas/workspace/foto", { method: "POST", body: form })).json();
      if (j.ok) setResultados(j.resultados);
      else setResultados([{ email: "", ok: false, error: j.error }]);
    } catch {
      setResultados([{ email: "", ok: false, error: "Error de red." }]);
    } finally {
      setSubiendo(false);
    }
  }

  const activos = usuarios.filter((u) => !u.suspendido).length;
  const suspendidos = usuarios.filter((u) => u.suspendido).length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-[23px] font-semibold tracking-[-.02em] text-[#ece9e2]">Google Workspace</h1>
        <p className="mt-1 max-w-[640px] text-[12.5px] leading-[1.5] text-ink/55">
          Usuarios del dominio, su unidad organizativa (OU) y sus permisos. Click en un usuario para ver el detalle;
          tildá varios para aplicarles la foto de perfil corporativa.
        </p>
      </div>

      {estado === "ok" && (
        <div className="grid grid-cols-2 border-t border-action/30 border-b border-ink/10">
          <div className="border-r border-ink/8 px-4 py-3">
            <p className="font-mono text-[9.5px] uppercase tracking-[.16em] text-action">Cuentas</p>
            <p className="tnum font-mono text-[26px] text-[#ece9e2]">{activos}</p>
            <p className="mt-0.5 text-[11.5px] text-ink/50">activas</p>
          </div>
          <div className="px-4 py-3">
            <p className="font-mono text-[9.5px] uppercase tracking-[.16em] text-action">Suspendidas</p>
            <p className="tnum font-mono text-[26px] text-bad">{suspendidos}</p>
            <p className="mt-0.5 text-[11.5px] text-ink/50">de {usuarios.length} totales</p>
          </div>
        </div>
      )}

      {estado === "loading" ? (
        <Card className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</Card>
      ) : estado === "no-config" ? (
        <EmptyState
          title="Todavía no está configurado"
          desc="Faltan las variables de entorno del service account de Google Workspace (GOOGLE_WORKSPACE_SA_EMAIL, GOOGLE_WORKSPACE_SA_PRIVATE_KEY, GOOGLE_WORKSPACE_ADMIN_EMAIL)."
        />
      ) : estado === "error" ? (
        <Card className="p-4 text-sm text-bad">{error || "No se pudo conectar con Google Workspace."}</Card>
      ) : (
        <>
          <Card className="flex flex-wrap items-center gap-2 p-3">
            <select className={`${inputClass} max-w-[220px] py-1`} value={fOu} onChange={(e) => setFOu(e.target.value)}>
              <option value="">Toda OU</option>
              {ous.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
            <input className={`${inputClass} max-w-[220px] py-1`} placeholder="Buscar nombre, email…" value={q} onChange={(e) => setQ(e.target.value)} />
            <span className="ml-auto text-2xs text-faint">{filtrados.length} de {usuarios.length}</span>
            <Button variant="ghost" onClick={cargar} className="px-2 py-1 text-2xs h-auto">↻</Button>
          </Card>

          {/* Carga masiva de foto */}
          <Card className="space-y-2.5 p-3.5">
            <p className="text-2xs font-medium uppercase tracking-wide text-faint">
              Foto de perfil masiva · {seleccion.size} seleccionado{seleccion.size === 1 ? "" : "s"}
            </p>
            <div className="flex flex-wrap items-center gap-2.5">
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setFoto(e.target.files?.[0] ?? null)}
                className="text-2xs text-muted"
              />
              <Button onClick={subirFoto} disabled={!foto || seleccion.size === 0 || subiendo}>
                {subiendo ? "Subiendo…" : `Aplicar a ${seleccion.size} usuario${seleccion.size === 1 ? "" : "s"}`}
              </Button>
              {seleccion.size > 0 && (
                <button onClick={() => setSeleccion(new Set())} className="text-2xs font-medium text-muted hover:text-ink">
                  Limpiar selección
                </button>
              )}
            </div>
            {resultados && (
              <div className="max-h-32 overflow-auto rounded-lg bg-ink/[0.03] p-2 text-2xs">
                {resultados.map((r, i) => (
                  <p key={i} className={r.ok ? "text-ok" : "text-bad"}>
                    {r.ok ? "✓" : "✗"} {r.email || "Error general"} {r.error ? `— ${r.error}` : ""}
                  </p>
                ))}
              </div>
            )}
          </Card>

          {filtrados.length === 0 ? (
            <EmptyState title="Sin resultados" desc="Probá aflojando los filtros." />
          ) : (
            <div className="max-h-[70vh] overflow-auto">
              <div className="sticky top-0 z-10 grid grid-cols-[36px_1.5fr_1fr_1fr_132px] items-center gap-3 border-b border-action/28 bg-paper py-2 font-mono text-[9.5px] uppercase tracking-[.16em] text-ink/40">
                <input type="checkbox" checked={seleccion.size === filtrados.length && filtrados.length > 0} onChange={toggleTodos} />
                <span>Usuario</span>
                <span>OU</span>
                <span>Licencia</span>
                <span>Estado</span>
              </div>
              {filtrados.map((u) => (
                <div key={u.email} className="grid grid-cols-[36px_1.5fr_1fr_1fr_132px] items-center gap-3 border-b border-ink/7 py-[11px] hover:bg-ink/[.035]">
                  <input type="checkbox" checked={seleccion.has(u.email)} onChange={() => toggleSeleccion(u.email)} />
                  <button onClick={() => abrirCard(u)} className="min-w-0 text-left">
                    <p className="truncate font-display text-[13px] font-semibold text-[#ece9e2]">{u.nombre}</p>
                    <p className="truncate font-mono text-[11px] text-ink/45">{u.email}</p>
                  </button>
                  <span className="truncate text-[11.5px] text-ink/60">{u.ou}</span>
                  <span className="truncate text-[11.5px] text-ink/40">—</span>
                  <span className="flex items-center justify-between gap-2">
                    <span className={`rounded border px-2 py-[3px] text-[11px] font-medium ${u.suspendido ? "border-bad/30 bg-bad/10 text-bad" : "border-ok/30 bg-ok/10 text-ok"}`}>
                      {u.suspendido ? "Suspendida" : "Activa"}
                    </span>
                    <button onClick={() => abrirCard(u)} className="shrink-0 text-[11px] font-medium text-action hover:underline">Ver</button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {abierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={() => setAbierto(null)}>
          <Card className="max-h-[85vh] w-full max-w-md overflow-auto p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-start justify-between">
              <div>
                <p className="font-display text-base font-semibold text-ink">{abierto.nombre}</p>
                <p className="text-2xs text-faint">{abierto.email}</p>
              </div>
              <button onClick={() => setAbierto(null)} className="text-muted hover:text-ink">✕</button>
            </div>

            {detalleEstado === "loading" ? (
              <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}</div>
            ) : detalleEstado === "error" ? (
              <p className="text-sm text-bad">No se pudo cargar el detalle.</p>
            ) : detalle && (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-1.5">
                  <Badge tone={abierto.suspendido ? "bad" : "ok"}>{abierto.suspendido ? "Suspendido" : "Activo"}</Badge>
                  {detalle.isAdmin && <Badge tone="action">Super admin</Badge>}
                  {detalle.isDelegatedAdmin && <Badge tone="warn">Admin delegado</Badge>}
                  <Badge tone={detalle.is2svEnrolled ? "ok" : "warn"}>{detalle.is2svEnrolled ? "2FA activo" : "2FA sin activar"}</Badge>
                </div>
                <p className="text-2xs text-faint">
                  OU: <span className="text-muted">{abierto.ou}</span>
                  {detalle.lastLoginTime && (
                    <> · Último acceso: <span className="text-muted">{new Date(detalle.lastLoginTime).toLocaleString("es-AR")}</span></>
                  )}
                </p>

                <div>
                  <p className="mb-1 text-2xs font-medium uppercase tracking-wide text-faint">Grupos ({detalle.grupos.length})</p>
                  {detalle.grupos.length === 0 ? (
                    <p className="text-2xs text-faint">No pertenece a ningún grupo.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {detalle.grupos.map((g) => <Badge key={g}>{g}</Badge>)}
                    </div>
                  )}
                </div>

                <div>
                  <p className="mb-1 text-2xs font-medium uppercase tracking-wide text-faint">
                    Unidades compartidas ({detalle.unidadesCompartidas.length})
                  </p>
                  {detalle.unidadesCompartidas.length === 0 ? (
                    <p className="text-2xs text-faint">Sin acceso a shared drives.</p>
                  ) : (
                    <ul className="space-y-1">
                      {detalle.unidadesCompartidas.map((d) => (
                        <li key={d.nombre} className="flex items-center justify-between text-2xs">
                          <span className="text-ink">{d.nombre}</span>
                          <Badge>{d.rol}</Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
