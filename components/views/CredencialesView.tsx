"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card, Field, inputClass, Button, Skeleton, EmptyState } from "@/components/ui/primitives";
import { CATEGORIAS_CRED, EMAILS_CREDENCIALES, type CredencialPublica } from "@/lib/credenciales";
import { COLUMNAS_PLANTILLA, parsearCredenciales, resumenImport, type FilaImport } from "@/lib/credenciales-import";

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

  // Cuántas credenciales tiene cada categoría (para el filtro) y cuántos sistemas
  // distintos hay en total: con 40+ filas, el número de filas solo no dice nada.
  const porCategoria = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of items) m[c.categoria] = (m[c.categoria] ?? 0) + 1;
    return m;
  }, [items]);
  const sistemas = useMemo(() => new Set(items.map((c) => c.sistema.toLowerCase())).size, [items]);

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
                <CampoClave {...campo("secreto")} />
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

      <ImportarMasivo items={items} onImportado={(l, aviso) => { setItems(l); setMsg(aviso); }} />

      <Card className="flex flex-wrap items-center gap-3 p-3">
        {/* Con la cuenta al lado no hay que abrir el filtro para saber si tiene algo. */}
        <select className={`${inputClass} max-w-[220px] py-1`} value={fCat} onChange={(e) => setFCat(e.target.value)}>
          <option value="">Todas las categorías ({items.length})</option>
          {CATEGORIAS_CRED.filter((c) => porCategoria[c]).map((c) => (
            <option key={c} value={c}>{c} ({porCategoria[c]})</option>
          ))}
        </select>
        <input className={`${inputClass} max-w-[240px] py-1`} placeholder="Buscar sistema, usuario…" value={q} onChange={(e) => setQ(e.target.value)} />
        {(fCat || q) && (
          <button onClick={() => { setFCat(""); setQ(""); }} className="text-2xs font-medium text-muted hover:text-ink">
            Limpiar
          </button>
        )}
        <span className="ml-auto text-2xs text-faint">
          {filtrados.length === items.length ? `${items.length} credenciales` : `${filtrados.length} de ${items.length}`}
          {" · "}
          {sistemas} sistemas
        </span>
      </Card>

      {msg && (
        <Card className="flex items-start gap-3 border-action/30 bg-action/5 p-3">
          <p className="flex-1 text-2xs text-ink">{msg}</p>
          <button onClick={() => setMsg("")} className="shrink-0 text-2xs font-medium text-muted hover:text-ink">Cerrar</button>
        </Card>
      )}

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
          // La tabla scrollea adentro de su caja (no la página): así el encabezado
          // sticky tiene contra qué pegarse y no se pierde con 40+ credenciales.
          <div className="max-h-[70vh] overflow-auto">
            <table className="w-full text-left text-sm">
              {/* El encabezado acompaña el scroll: con 40+ credenciales, si no, se pierde. */}
              <thead className="sticky top-0 z-10 bg-surface">
                <tr className="border-b border-line text-2xs uppercase tracking-wide text-faint">
                  <th className="px-4 py-2 font-medium">Sistema</th>
                  <th className="px-3 py-2 font-medium">Usuario</th>
                  <th className="px-3 py-2 font-medium">Contraseña</th>
                  <th className="px-3 py-2 font-medium">Categoría</th>
                  <th className="px-3 py-2 font-medium">Actualizada</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((c, i) => {
                  // Un sistema con varias claves (BI Ventas, Cierres de caja…) se escribe
                  // una sola vez: las filas siguientes cuelgan de la primera.
                  const primera = filtrados[i - 1]?.sistema !== c.sistema;
                  const abierta = visibles[c.id] !== undefined;
                  return (
                    <tr
                      key={c.id}
                      className={`last:border-0 hover:bg-ink/[0.02] ${primera ? "border-t border-line/70" : ""}`}
                    >
                      <td className="px-4 py-2 align-top">
                        {primera ? (
                          <>
                            <p className="font-medium text-ink">{c.sistema}</p>
                            {c.url && (
                              <a href={c.url} target="_blank" rel="noreferrer" className="text-2xs text-action hover:underline">
                                {c.url.replace(/^https?:\/\//, "").slice(0, 40)}
                              </a>
                            )}
                          </>
                        ) : (
                          <span className="sr-only">{c.sistema}</span>
                        )}
                        {c.nota && <p className="max-w-xs text-2xs leading-snug text-faint">{c.nota}</p>}
                      </td>
                      <td className="px-3 py-2 align-top font-mono text-2xs text-muted">{c.usuario || "—"}</td>
                      <td className="px-3 py-2 align-top">
                        <div className="flex items-center gap-2">
                          {/* Ancho fijo (no max-): tapada o revelada mide igual, así al
                              apretar "Ver" la columna no se ensancha ni corre a las demás.
                              Si la clave no entra, se trunca y queda entera en el title. */}
                          <code
                            title={abierta ? visibles[c.id] : undefined}
                            className="block w-[140px] shrink-0 truncate rounded bg-ink/5 px-2 py-1 font-mono text-2xs text-ink"
                          >
                            {visibles[c.id] ?? "••••••••"}
                          </code>
                          <button onClick={() => ver(c.id)} className="shrink-0 text-2xs font-medium text-action hover:underline">
                            {abierta ? "Ocultar" : "Ver"}
                          </button>
                          <button onClick={() => copiar(c.id)} className="shrink-0 text-2xs font-medium text-muted hover:text-ink">Copiar</button>
                        </div>
                      </td>
                      <td className="px-3 py-2 align-top">
                        <span className="inline-block whitespace-nowrap rounded-full border border-line bg-ink/5 px-2.5 py-1 text-2xs font-medium text-muted">
                          {c.categoria}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 align-top text-2xs text-faint">
                        {fecha(c.actualizado)}
                        {c.actualizadoPor && <span title={c.actualizadoPor}> · {c.actualizadoPor.split("@")[0]}</span>}
                      </td>
                      <td className="px-3 py-2 text-right align-top">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => setEditando(editando === c.id ? null : c.id)} className="text-2xs font-medium text-muted hover:text-ink">
                            {editando === c.id ? "Cerrar" : "Editar"}
                          </button>
                          <button onClick={() => quitar(c)} className="text-2xs font-medium text-bad hover:underline">Borrar</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editando && <Editar credencial={items.find((c) => c.id === editando)!} guardando={guardando} onGuardar={guardar} onCerrar={() => setEditando(null)} />}
    </div>
  );
}

/**
 * Input de contraseña con ojo para verla mientras se escribe: cargando una clave a
 * mano el punteado no deja controlar si quedó bien tipeada. Mismo ícono que el modo
 * privacidad del Topbar. Arranca siempre tapada.
 */
function CampoClave({
  value,
  onChange,
  placeholder,
  autoComplete = "new-password",
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  autoComplete?: string;
}) {
  const [ver, setVer] = useState(false);
  return (
    <div className="relative">
      <input
        className={`${inputClass} pr-10`}
        type={ver ? "text" : "password"}
        placeholder={placeholder}
        autoComplete={autoComplete}
        value={value}
        onChange={onChange}
      />
      {/* type="button": sin eso, dentro del form el ojo dispararía el submit. */}
      <button
        type="button"
        onClick={() => setVer((v) => !v)}
        title={ver ? "Ocultar la contraseña" : "Ver lo que escribí"}
        aria-label={ver ? "Ocultar la contraseña" : "Mostrar la contraseña"}
        aria-pressed={ver}
        className="absolute right-1.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-faint transition-colors hover:bg-ink/5 hover:text-ink"
      >
        {ver ? (
          // ojo tachado
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 10 8 10 8a18.5 18.5 0 0 1-2.16 3.19M6.61 6.61A18.5 18.5 0 0 0 2 12s3 8 10 8a9.12 9.12 0 0 0 5.39-1.61" />
            <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
            <line x1="2" y1="2" x2="22" y2="22" />
          </svg>
        ) : (
          // ojo abierto
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M2 12s3-8 10-8 10 8 10 8-3 8-10 8-10-8-10-8Z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  );
}

/**
 * Carga masiva desde CSV/Excel. El archivo se lee y se previsualiza EN EL NAVEGADOR:
 * el binario con contraseñas nunca se sube. Recién al confirmar viajan las filas
 * válidas al endpoint, que las cifra con CREDENCIALES_KEY como cualquier alta.
 */
function ImportarMasivo({
  items,
  onImportado,
}: {
  items: CredencialPublica[];
  onImportado: (items: CredencialPublica[], aviso: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [archivo, setArchivo] = useState("");
  const [filas, setFilas] = useState<FilaImport[]>([]);
  const [error, setError] = useState("");
  const [subiendo, setSubiendo] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const limpiar = () => {
    setArchivo("");
    setFilas([]);
    setError("");
    if (input.current) input.current.value = "";
  };

  async function leer(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setError("");
    setFilas([]);
    setArchivo(f.name);
    try {
      // xlsx pesa: se carga on-demand, solo cuando alguien importa de verdad.
      const { filasDeArchivo } = await import("@/lib/bancos");
      const r = parsearCredenciales(filasDeArchivo(f.name, await f.arrayBuffer()), items);
      if (r.fatal) setError(r.fatal);
      setFilas(r.filas);
    } catch {
      setError("No pude leer el archivo. Tiene que ser .csv, .xlsx o .xls.");
    }
  }

  // Plantilla de ejemplo, para que nadie tenga que adivinar los encabezados.
  function plantilla() {
    const csv = [
      COLUMNAS_PLANTILLA.join(","),
      "Tango Gestion,Tango,admin,LA-CLAVE-ACA,https://tango.local,Usuario de sistemas",
      "Banco Galicia,Bancos y pagos,30-11111111-1,LA-CLAVE-ACA,https://www.bancogalicia.com,Token en el celular de admin",
    ].join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    a.download = "plantilla-credenciales.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function importar() {
    const validas = filas.filter((f) => f.accion !== "error");
    if (validas.length === 0) return;
    if (!confirm(`¿Importar ${validas.length} credenciales? Las repetidas (mismo sistema y usuario) se pisan con la contraseña del archivo.`)) return;
    setSubiendo(true);
    setError("");
    try {
      const j = await (
        await fetch("/api/credenciales/importar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filas: validas.map(({ sistema, categoria, usuario, secreto, url, nota }) => ({ sistema, categoria, usuario, secreto, url, nota })),
          }),
        })
      ).json();
      if (!j.ok) throw new Error(j.error);
      onImportado(j.items, `Importadas: ${j.altas} nuevas y ${j.actualizadas} actualizadas. Acordate de borrar el archivo con las contraseñas.`);
      limpiar();
      setAbierto(false);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "No se pudo importar.");
    } finally {
      setSubiendo(false);
    }
  }

  const r = resumenImport(filas);
  const validas = r.altas + r.actualiza;

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-2xs font-medium uppercase tracking-wide text-faint">Carga masiva · CSV o Excel</p>
        <button
          onClick={() => { setAbierto((v) => !v); if (abierto) limpiar(); }}
          className="text-2xs font-medium text-action hover:underline"
        >
          {abierto ? "Cancelar" : "+ Importar archivo"}
        </button>
      </div>

      {abierto && (
        <div className="mt-3 space-y-3">
          <p className="text-2xs text-muted">
            Columnas: <b className="font-medium text-ink">Sistema</b> y <b className="font-medium text-ink">Contraseña</b> son
            obligatorias; <span className="text-ink">Categoría</span>, <span className="text-ink">Usuario</span>,{" "}
            <span className="text-ink">URL</span> y <span className="text-ink">Nota</span> son opcionales. No importa el orden
            ni las mayúsculas, y valen los sinónimos habituales (Clave, Password, Servicio, Mail…). Si el sistema y el usuario
            ya existen, se actualiza esa credencial en vez de duplicarla.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={input}
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={leer}
              className="text-2xs text-muted file:mr-3 file:rounded-lg file:border file:border-line file:bg-ink/5 file:px-3 file:py-1.5 file:text-2xs file:font-medium file:text-ink hover:file:bg-ink/10"
            />
            <button onClick={plantilla} className="text-2xs font-medium text-action hover:underline">
              Descargar plantilla
            </button>
          </div>

          {archivo && !error && (
            <p className="text-2xs text-faint">
              {archivo} · <b className="font-medium text-ok">{r.altas} nuevas</b> ·{" "}
              <b className="font-medium text-ink">{r.actualiza} se actualizan</b>
              {r.errores > 0 && <> · <b className="font-medium text-bad">{r.errores} con problemas</b></>}
            </p>
          )}

          {error && <p className="text-2xs text-bad">{error}</p>}

          {filas.length > 0 && (
            <div className="max-h-72 overflow-auto rounded-lg border border-line">
              <table className="w-full text-left text-2xs">
                <thead className="sticky top-0 z-10 bg-surface">
                  <tr className="border-b border-line uppercase tracking-wide text-faint">
                    <th className="px-3 py-2 font-medium">#</th>
                    <th className="px-3 py-2 font-medium">Sistema</th>
                    <th className="px-3 py-2 font-medium">Categoría</th>
                    <th className="px-3 py-2 font-medium">Usuario</th>
                    <th className="px-3 py-2 font-medium">Contraseña</th>
                    <th className="px-3 py-2 font-medium">Qué pasa</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f) => (
                    <tr key={f.fila} className={`border-b border-line/70 last:border-0 ${f.accion === "error" ? "bg-bad/5" : ""}`}>
                      <td className="px-3 py-1.5 text-faint">{f.fila}</td>
                      <td className="px-3 py-1.5 text-ink">{f.sistema || "—"}</td>
                      <td className="px-3 py-1.5 text-muted">{f.categoria}</td>
                      <td className="px-3 py-1.5 font-mono text-muted">{f.usuario || "—"}</td>
                      {/* La contraseña se previsualiza tapada: alcanza con saber que vino. */}
                      <td className="px-3 py-1.5 font-mono text-faint">{f.secreto ? "•".repeat(Math.min(f.secreto.length, 12)) : "—"}</td>
                      <td className="px-3 py-1.5">
                        {f.accion === "alta" ? (
                          <span className="text-ok">Se agrega</span>
                        ) : f.accion === "actualiza" ? (
                          <span className="text-ink">Actualiza la existente</span>
                        ) : (
                          <span className="text-bad">{f.error}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {validas > 0 && (
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={importar} disabled={subiendo}>
                {subiendo ? "Importando…" : `Importar ${validas} credenciales`}
              </Button>
              <button onClick={limpiar} className="text-2xs font-medium text-muted hover:text-ink">Descartar</button>
              <span className="text-2xs text-faint">
                El archivo se lee en tu navegador; no se sube. Borralo cuando termines.
              </span>
            </div>
          )}
        </div>
      )}
    </Card>
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
          <CampoClave placeholder="dejar vacío = no cambiarla" {...campo("secreto")} />
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
