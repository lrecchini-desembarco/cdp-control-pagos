"use client";

import { useEffect, useState } from "react";
import { ROLES, ROLES_LIST } from "@/lib/roles";
import type { Rol } from "@/lib/roles";
import { Badge, Button, Card, EmptyState, Field, inputClass, Skeleton } from "@/components/ui/primitives";

interface Usuario {
  email: string;
  rol: Rol;
  tieneClave?: boolean;
  nav?: string[] | null;
}

const tonoRol: Record<Rol, "action" | "warn" | "neutral"> = {
  admin: "action",
  operaciones: "warn",
  local: "neutral",
  comparacion: "neutral",
  resenas: "neutral",
  gerencia: "action",
  "apps-gerencia": "warn",
  pendiente: "warn",
};

export default function UsuariosView() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [email, setEmail] = useState("");
  const [rol, setRol] = useState<Rol>("local");
  const [pass, setPass] = useState("");
  const [navSel, setNavSel] = useState<string[]>([]); // qué ve ESTE usuario (checkboxes)
  const [editando, setEditando] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Permisos del menú por rol (editable)
  const [navByRol, setNavByRol] = useState<Record<string, string[]>>({});
  const [catalog, setCatalog] = useState<{ href: string; label: string; icon: string }[]>([]);
  const [rolesMeta, setRolesMeta] = useState<{ id: Rol; label: string }[]>([]);
  const [fijas, setFijas] = useState<string[]>([]);
  const [guardandoRol, setGuardandoRol] = useState("");

  async function cargar() {
    setStatus("loading");
    try {
      const j = await (await fetch("/api/users")).json();
      if (!j.ok) throw new Error(j.error ?? "No se pudo cargar.");
      setUsuarios(j.usuarios);
      setStatus("ok");
    } catch {
      setStatus("error");
    }
  }
  async function cargarRoles() {
    try {
      const j = await (await fetch("/api/roles")).json();
      if (j.ok) {
        setNavByRol(j.navByRol);
        setCatalog(j.catalog);
        setRolesMeta(j.roles);
        setFijas(j.fijas ?? []);
      }
    } catch {}
  }
  useEffect(() => {
    cargar();
    cargarRoles();
  }, []);

  // Al elegir un rol en un alta nueva, pre-tilda las pantallas base de ese rol.
  useEffect(() => {
    if (!editando) setNavSel((navByRol[rol] ?? []).filter((h) => h !== "/guia"));
  }, [rol, navByRol, editando]);

  const toggleNavSel = (href: string) =>
    setNavSel((s) => (s.includes(href) ? s.filter((h) => h !== href) : [...s, href]));

  function editarUsuario(u: Usuario) {
    setEditando(true);
    setEmail(u.email);
    setRol(u.rol);
    setPass("");
    setNavSel(((u.nav ?? navByRol[u.rol] ?? []) as string[]).filter((h) => h !== "/guia"));
    setMsg(null);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function limpiarForm() {
    setEditando(false); setEmail(""); setPass(""); setRol("local");
  }

  async function toggle(rol: Rol, href: string) {
    if (fijas.includes(href) || (rol === "admin" && href === "/usuarios")) return; // fijas
    const cur = navByRol[rol] ?? [];
    const nuevo = cur.includes(href) ? cur.filter((h) => h !== href) : [...cur, href];
    setNavByRol((s) => ({ ...s, [rol]: nuevo })); // optimista
    setGuardandoRol(rol);
    try {
      const j = await (
        await fetch("/api/roles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rol, nav: nuevo }),
        })
      ).json();
      if (j.ok) setNavByRol(j.navByRol);
      else setMsg({ ok: false, text: j.error ?? "No se pudo guardar el permiso." });
    } finally {
      setGuardandoRol("");
    }
  }
  const esFija = (rol: Rol, href: string) => fijas.includes(href) || (rol === "admin" && href === "/usuarios");

  async function agregar(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    // Los admin ven todo (no se manda nav). Para el resto, se manda lo tildado.
    const body: Record<string, unknown> = { email, rol, password: pass };
    if (rol !== "admin") body.nav = navSel;
    const j = await (
      await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
    ).json();
    if (j.ok) {
      setUsuarios(j.usuarios);
      limpiarForm();
      setMsg({ ok: true, text: "Usuario guardado." });
    } else {
      setMsg({ ok: false, text: j.error ?? "No se pudo agregar." });
    }
  }

  async function quitar(em: string) {
    const j = await (await fetch(`/api/users?email=${encodeURIComponent(em)}`, { method: "DELETE" })).json();
    if (j.ok) setUsuarios(j.usuarios);
    else setMsg({ ok: false, text: j.error ?? "No se pudo quitar." });
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-xl font-semibold text-ink">Usuarios</h1>
        <p className="mt-0.5 text-sm text-muted">
          Quién entra y qué ve. Creás un usuario con <b>email + clave</b> y tildás <b>por usuario</b> qué pantallas puede ver.
        </p>
      </div>

      {/* Alta / edición */}
      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-2xs font-medium uppercase tracking-wide text-faint">
            {editando ? `Editar · ${email}` : "Nuevo usuario"}
          </p>
          {editando && (
            <button type="button" onClick={limpiarForm} className="text-2xs text-action hover:underline">
              + Nuevo (limpiar)
            </button>
          )}
        </div>
        <form onSubmit={agregar} className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_180px_180px]">
            <Field label="Email">
              <input type="email" className={inputClass} placeholder="persona@eldesembarco.com"
                value={email} disabled={editando} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Rol" hint="Admin = ve todo + gestiona">
              <select className={inputClass} value={rol} onChange={(e) => setRol(e.target.value as Rol)}>
                {ROLES_LIST.map((r) => (
                  <option key={r} value={r}>{ROLES[r].label}</option>
                ))}
              </select>
            </Field>
            <Field label="Clave" hint="Vacía = clave genérica">
              <input type="text" className={inputClass} placeholder="propia del usuario"
                value={pass} onChange={(e) => setPass(e.target.value)} />
            </Field>
          </div>

          {rol === "admin" ? (
            <p className="rounded-lg bg-ink/[0.03] px-3 py-2 text-2xs text-muted">
              El <b>Administrador</b> ve todas las pantallas y gestiona usuarios.
            </p>
          ) : (
            <div>
              <p className="mb-1.5 text-2xs font-medium uppercase tracking-wide text-faint">Qué puede ver este usuario</p>
              <div className="flex flex-wrap gap-1.5">
                {catalog.map((it) => {
                  const fija = fijas.includes(it.href);
                  const on = fija || navSel.includes(it.href);
                  return (
                    <button type="button" key={it.href} onClick={() => !fija && toggleNavSel(it.href)} disabled={fija}
                      title={fija ? "Siempre visible" : it.href}
                      className={`rounded-full border px-2.5 py-1 text-2xs font-medium transition-colors ${
                        on ? "border-action bg-action/10 text-action" : "border-line bg-surface text-muted hover:text-ink"
                      } ${fija ? "cursor-default opacity-70" : ""}`}>
                      {on ? "✓ " : ""}{it.label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-2xs text-faint">Empieza con las pantallas del rol elegido; tildá/destildá lo que quieras. “¿Qué puedo hacer?” siempre está.</p>
            </div>
          )}

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={!email}>{editando ? "Guardar cambios" : "Crear usuario"}</Button>
            {msg && <span className={`text-2xs ${msg.ok ? "text-ok" : "text-bad"}`}>{msg.text}</span>}
          </div>
        </form>
      </Card>

      {/* Permisos del menú por rol */}
      {rolesMeta.length > 0 && (
        <Card className="space-y-4 p-4">
          <div>
            <p className="text-2xs font-medium uppercase tracking-wide text-faint">Qué ve cada rol en el menú</p>
            <p className="mt-0.5 text-2xs text-faint">
              Tildá las pantallas que puede ver cada rol. Se guarda al instante. (“¿Qué puedo hacer?” y Usuarios para
              admin quedan siempre activas.)
            </p>
          </div>
          {rolesMeta.map((r) => (
            <div key={r.id} className="rounded-lg border border-line p-3">
              <div className="mb-2 flex items-center gap-2">
                <Badge tone={tonoRol[r.id]}>{r.label}</Badge>
                <span className="text-2xs text-faint">
                  {(navByRol[r.id] ?? []).filter((h) => h !== "/guia").length} pantallas
                  {guardandoRol === r.id && " · guardando…"}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {catalog.map((it) => {
                  const on = (navByRol[r.id] ?? []).includes(it.href);
                  const fija = esFija(r.id, it.href);
                  return (
                    <button
                      key={it.href}
                      onClick={() => toggle(r.id, it.href)}
                      disabled={fija}
                      title={fija ? "Siempre visible" : it.href}
                      className={`rounded-full border px-2.5 py-1 text-2xs font-medium transition-colors ${
                        on ? "border-action bg-action/10 text-action" : "border-line bg-surface text-muted hover:text-ink"
                      } ${fija ? "cursor-default opacity-70" : ""}`}
                    >
                      {on ? "✓ " : ""}
                      {it.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </Card>
      )}

      {/* Lista */}
      {status === "loading" ? (
        <Card className="space-y-2 p-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </Card>
      ) : status === "error" ? (
        <EmptyState title="No autorizado" desc="Necesitás rol Administrador para ver esta pantalla." />
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-2xs uppercase tracking-wide text-faint">
                <th className="px-4 py-2 font-medium">Email</th>
                <th className="px-4 py-2 font-medium">Rol</th>
                <th className="px-4 py-2 font-medium">Clave</th>
                <th className="px-4 py-2 font-medium">Ve</th>
                <th className="px-4 py-2 text-right font-medium">Acción</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.email} className="border-b border-line/70 last:border-0">
                  <td className="px-4 py-2.5 text-ink">{u.email}</td>
                  <td className="px-4 py-2.5">
                    <Badge tone={tonoRol[u.rol]}>{ROLES[u.rol].label}</Badge>
                  </td>
                  <td className="px-4 py-2.5 text-2xs text-muted">
                    {u.tieneClave ? "propia" : "genérica"}
                  </td>
                  <td className="px-4 py-2.5 text-2xs text-muted">
                    {u.rol === "admin"
                      ? "todo"
                      : `${((u.nav ?? navByRol[u.rol] ?? ROLES[u.rol].nav) as string[]).filter((h) => h !== "/guia").length} pantallas${u.nav ? " · propio" : ""}`}
                  </td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    <button onClick={() => editarUsuario(u)} className="text-2xs font-medium text-action hover:underline">
                      Editar
                    </button>
                    <button onClick={() => quitar(u.email)} className="ml-3 text-2xs font-medium text-bad hover:underline">
                      Quitar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
