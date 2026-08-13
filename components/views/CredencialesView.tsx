"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, Field, inputClass, Button, Skeleton, EmptyState } from "@/components/ui/primitives";
import { CATEGORIAS_CRED, EMAILS_CREDENCIALES, type CredencialPublica } from "@/lib/credenciales";

const VACIA = { sistema: "", categoria: "Sistemas", usuario: "", secreto: "", url: "", nota: "" };

const fecha = (iso: string) =>
  iso ? new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "";

export default function CredencialesView() {
  const [items, setItems] = useState<CredencialPublica[]>([]);
  const [estado, setEstado] = useState<"loading" | "ok" | "error">("loading");
  const [cifrado, setCifrado] = useState(true);
  const [q, setQ] = useState("");
  const [fCat, setFCat] = useState("");
  const [alta, setAlta] = useState(false);
  const [nueva, setNueva] = useState(VACIA);
  const [editando, setEditando] = useState<string | null>(null);
  const [visibles, setVisibles] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");
  const [guardando, setGuardando] = useState(false);

  async function cargar() {
    setEstado("loading");
    try {
      const j = await (await fetch("/api/credenciales")).json();
      if (!j.ok) throw new Error();
      setItems(j.items);
      setCifrado(j.cifrado);
      setEstado("ok");
    } catch {
      setEstado("error");
    }
  }
  useEffect(() => {
    cargar();
  }, []);

  // La contraseña no viene en la lista: se pide de a una, solo cuando se aprieta "Ver".
  async function ver(id: string) {
    if (visibles[id]) {
      setVisibles(({ [id]: _, ...resto }) => resto);
      return;
    }
    setMsg("");
    try {
      const j = await (await fetch(`/api/credenciales?revelar=${encodeURIComponent(id)}`)).json();
      if (!j.ok) throw new Error(j.error);
      setVisibles((v) => ({ ...v, [id]: j.secreto }));
    } catch (e) {
      setMsg(e instanceof Error && e.message ? e.message : "No se pudo mostrar la contraseña.");
    }
  }

  async function copiar(id: string) {
    setMsg("");
    try {
      const secreto = visibles[id] ?? (await (await fetch(`/api/credenciales?revelar=${encodeURIComponent(id)}`)).json()).secreto;
      await navigator.clipboard.writeText(secreto);
      setMsg("Contraseña copiada al portapapeles.");
    } catch {
      setMsg("No se pudo copiar (el navegador puede pedir permiso).");
    }
  }

  async function guardar(body: Record<string, unknown>) {
    setGuardando(true);
    setMsg("");
    try {
      const j = await (
        await fetch("/api/credenciales", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      ).json();
      if (!j.ok) throw new Error(j.error);
      setItems(j.items);
      return true;
    } catch (e) {
      setMsg(e instanceof Error && e.message ? e.message : "No se pudo guardar.");
      return false;
    } finally {
      setGuardando(false);
    }
  }

  async function agregar(e: React.FormEvent) {
    e.preventDefault();
    if (!nueva.sistema.trim() || !nueva.secreto) return;
    if (await guardar(nueva)) {
      setNueva(VACIA);
      setAlta(false);
    }
  }

  async function quitar(c: CredencialPublica) {
    if (!confirm(`¿Borrar la credencial de "${c.sistema}"${c.usuario ? ` (${c.usuario})` : ""}?`)) return;
    const j = await (await fetch(`/api/credenciales?id=${encodeURIComponent(c.id)}`, { method: "DELETE" })).json();
    if (j.ok) setItems(j.items);
    else setMsg(j.error || "No se pudo borrar.");
  }

  const campo = (k: keyof typeof VACIA) => ({
    value: nueva[k],
    onChange: (ev: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setNueva((n) => ({ ...n, [k]: ev.target.value })),
  });

  const filtrados = useMemo(() => {
    let l = items;
    if (fCat) l = l.filter((c) => c.categoria === fCat);
    const t = q.trim().toLowerCase();
    if (t) l = l.filter((c) => `${c.sistema} ${c.usuario} ${c.url ?? ""} ${c.nota ?? ""}`.toLowerCase().includes(t));
    return l;
  }, [items, fCat, q]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-xl font-semibold text-ink">Credenciales</h1>
        <p className="mt-0.5 max-w-2xl text-sm text-muted">
          Usuarios y contraseñas de los sistemas. Acceso restringido: solo {EMAILS_CREDENCIALES.join(" y ")}.
          Las contraseñas se guardan cifradas y viajan al navegador únicamente cuando apretás <b className="font-medium text-ink">Ver</b>.
        </p>
      </div>

      {!cifrado && estado === "ok" && (
        <Card className="border-bad/40 bg-bad/5 p-3 text-2xs text-bad">
          Falta configurar <b>CREDENCIALES_KEY</b>: sin esa variable de entorno no se puede guardar ni leer
          ninguna contraseña. Ver <b>docs/credenciales.md</b>.
        </Card>
      )}

      <Card className="p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-2xs font-medium uppercase tracking-wide text-faint">Agregar credencial</p>
          <button onClick={() => setAlta((v) => !v)} className="text-2xs font-medium text-action hover:underline">
            {alta ? "Cancelar" : "+ Agregar credencial"}
          </button>
        </div>
        {alta && (
          <form onSubmit={agregar} className="mt-3 space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Sistema *">
                <input className={inputClass} placeholder="Tango, Qlik, Banco Galicia…" {...campo("sistema")} />
              </Field>
              <Field label="Categoría">
                <select className={inputClass} {...campo("categoria")}>
                  {CATEGORIAS_CRED.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Usuario">
                <input className={inputClass} placeholder="usuario o email" autoComplete="off" {...campo("usuario")} />
              </Field>
              <Field label="Contraseña *">
                <input className={inputClass} type="password" autoComplete="new-password" {...campo("secreto")} />
              </Field>
              <Field label="URL">
                <input className={inputClass} placeholder="https://…" {...campo("url")} />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Nota">
                  <input className={inputClass} placeholder="Segundo factor, quién la administra, vencimiento…" {...campo("nota")} />
                </Field>
              </div>
              <div className="flex items-end">
                <Button type="submit" disabled={!nueva.sistema.trim() || !nueva.secreto || guardando}>
                  {guardando ? "Guardando…" : "Agregar"}
                </Button>
              </div>
            </div>
          </form>
        )}
      </Card>

      <Card className="flex flex-wrap items-center gap-3 p-3">
        <select className={`${inputClass} max-w-[190px] py-1`} value={fCat} onChange={(e) => setFCat(e.target.value)}>
          <option value="">Todas las categorías</option>
          {CATEGORIAS_CRED.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input className={`${inputClass} max-w-[240px] py-1`} placeholder="Buscar sistema, usuario…" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="ml-auto text-2xs text-faint">{filtrados.length} credenciales</span>
      </Card>

      {msg && <p className="text-2xs text-muted">{msg}</p>}

      <Card className="overflow-hidden">
        {estado === "loading" ? (
          <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
        ) : estado === "error" ? (
          <div className="p-4 text-sm text-bad">No se pudieron cargar las credenciales.</div>
        ) : filtrados.length === 0 ? (
          <EmptyState
            title={items.length ? "Sin resultados" : "Todavía no hay credenciales"}
            desc={items.length ? "Probá aflojando los filtros." : "Agregá la primera con el formulario de arriba."}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-2xs uppercase tracking-wide text-faint">
                  <th className="px-4 py-2 font-medium">Sistema</th>
                  <th className="px-3 py-2 font-medium">Categoría</th>
                  <th className="px-3 py-2 font-medium">Usuario</th>
                  <th className="px-3 py-2 font-medium">Contraseña</th>
                  <th className="px-3 py-2 font-medium">Actualizada</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((c) => (
                  <tr key={c.id} className="border-b border-line/70 last:border-0 hover:bg-ink/[0.02]">
                    <td className="px-4 py-2">
                      <p className="font-medium text-ink">{c.sistema}</p>
                      {c.url && (
                        <a href={c.url} target="_blank" rel="noreferrer" className="text-2xs text-action hover:underline">
                          {c.url.replace(/^https?:\/\//, "").slice(0, 40)}
                        </a>
                      )}
                      {c.nota && <p className="text-2xs text-faint">{c.nota}</p>}
                    </td>
                    <td className="px-3 py-2">
                      <span className="rounded-full border border-line bg-ink/5 px-2.5 py-1 text-2xs font-medium text-muted">{c.categoria}</span>
                    </td>
                    <td className="px-3 py-2 font-mono text-2xs text-muted">{c.usuario || "—"}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <code className="rounded bg-ink/5 px-2 py-1 font-mono text-2xs text-ink">
                          {visibles[c.id] ?? "••••••••"}
                        </code>
                        <button onClick={() => ver(c.id)} className="text-2xs font-medium text-action hover:underline">
                          {visibles[c.id] ? "Ocultar" : "Ver"}
                        </button>
                        <button onClick={() => copiar(c.id)} className="text-2xs font-medium text-muted hover:text-ink">Copiar</button>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-2xs text-faint">
                      {fecha(c.actualizado)}
                      {c.actualizadoPor && <span title={c.actualizadoPor}> · {c.actualizadoPor.split("@")[0]}</span>}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => setEditando(editando === c.id ? null : c.id)} className="text-2xs font-medium text-muted hover:text-ink">
                          {editando === c.id ? "Cerrar" : "Editar"}
                        </button>
                        <button onClick={() => quitar(c)} className="text-2xs font-medium text-bad hover:underline">Borrar</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editando && <Editar credencial={items.find((c) => c.id === editando)!} guardando={guardando} onGuardar={guardar} onCerrar={() => setEditando(null)} />}
    </div>
  );
}

/** Edición de una credencial. La contraseña se cambia solo si escribís una nueva. */
function Editar({
  credencial,
  guardando,
  onGuardar,
  onCerrar,
}: {
  credencial: CredencialPublica;
  guardando: boolean;
  onGuardar: (body: Record<string, unknown>) => Promise<boolean>;
  onCerrar: () => void;
}) {
  const [f, setF] = useState({
    sistema: credencial.sistema,
    categoria: credencial.categoria,
    usuario: credencial.usuario,
    url: credencial.url ?? "",
    nota: credencial.nota ?? "",
    secreto: "",
  });
  const campo = (k: keyof typeof f) => ({
    value: f[k],
    onChange: (ev: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((v) => ({ ...v, [k]: ev.target.value })),
  });

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-2xs font-medium uppercase tracking-wide text-faint">Editar · {credencial.sistema}</p>
        <button onClick={onCerrar} className="text-2xs font-medium text-muted hover:text-ink">Cerrar</button>
      </div>
      <form
        className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const { secreto, ...resto } = f;
          if (await onGuardar({ id: credencial.id, ...resto, ...(secreto ? { secreto } : {}) })) onCerrar();
        }}
      >
        <Field label="Sistema"><input className={inputClass} {...campo("sistema")} /></Field>
        <Field label="Categoría">
          <select className={inputClass} {...campo("categoria")}>
            {CATEGORIAS_CRED.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Usuario"><input className={inputClass} autoComplete="off" {...campo("usuario")} /></Field>
        <Field label="Contraseña nueva" >
          <input className={inputClass} type="password" placeholder="dejar vacío = no cambiarla" autoComplete="new-password" {...campo("secreto")} />
        </Field>
        <Field label="URL"><input className={inputClass} {...campo("url")} /></Field>
        <div className="sm:col-span-2">
          <Field label="Nota"><input className={inputClass} {...campo("nota")} /></Field>
        </div>
        <div className="flex items-end">
          <Button type="submit" disabled={guardando}>{guardando ? "Guardando…" : "Guardar"}</Button>
        </div>
      </form>
    </Card>
  );
}
