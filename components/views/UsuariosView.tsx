"use client";

import { useEffect, useState } from "react";
import { ROLES, ROLES_LIST } from "@/lib/roles";
import type { Rol } from "@/lib/roles";
import { Badge, Button, Card, EmptyState, Field, inputClass, Skeleton } from "@/components/ui/primitives";

interface Usuario {
  email: string;
  rol: Rol;
  tieneClave?: boolean;
}

const tonoRol: Record<Rol, "action" | "warn" | "neutral"> = {
  admin: "action",
  operaciones: "warn",
  local: "neutral",
  comparacion: "neutral",
  resenas: "neutral",
  gerencia: "action",
  "apps-gerencia": "warn",
};

export default function UsuariosView() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [email, setEmail] = useState("");
  const [rol, setRol] = useState<Rol>("local");
  const [pass, setPass] = useState("");
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
    const j = await (
      await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, rol, password: pass }),
      })
    ).json();
    if (j.ok) {
      setUsuarios(j.usuarios);
      setEmail("");
      setPass("");
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
          Quién entra y qué ve. El acceso es por email + clave genérica; el rol define las pantallas
          disponibles.
        </p>
      </div>

      {/* Alta */}
      <Card className="p-4">
        <form onSubmit={agregar} className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_160px_160px_auto] sm:items-end">
          <Field label="Email">
            <input
              type="email"
              className={inputClass}
              placeholder="persona@eldesembarco.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label="Rol">
            <select className={inputClass} value={rol} onChange={(e) => setRol(e.target.value as Rol)}>
              {ROLES_LIST.map((r) => (
                <option key={r} value={r}>
                  {ROLES[r].label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Clave (opcional)" hint="Si la dejás vacía, usa la genérica.">
            <input
              type="text"
              className={inputClass}
              placeholder="propia del usuario"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
            />
          </Field>
          <Button type="submit" disabled={!email}>
            Agregar / actualizar
          </Button>
        </form>
        {msg && <p className={`mt-2 text-2xs ${msg.ok ? "text-ok" : "text-bad"}`}>{msg.text}</p>}
        <p className="mt-2 text-2xs text-faint">
          Roles: <b>Administrador</b> ve todo y gestiona usuarios · <b>Operaciones</b> ve todo el control ·{" "}
          <b>Local</b> ve solo Reseñas.
        </p>
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
                    {(navByRol[u.rol] ?? ROLES[u.rol].nav).filter((h) => h !== "/guia").length} pantallas
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      onClick={() => quitar(u.email)}
                      className="text-2xs font-medium text-bad hover:underline"
                    >
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
