"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card, Field, inputClass, Button, Skeleton, EmptyState } from "@/components/ui/primitives";
import {
  ACCEPT_UPLOAD,
  MAX_BYTES,
  extensionDe,
  formatoDe,
  formatoSoportado,
  seccionTut,
  tamanoLegible,
  type SeccionTutorial,
} from "@/lib/tutoriales";

interface Tutorial {
  id: string;
  seccion: string;
  titulo: string;
  archivo: string;
  formato: string;
  bytes: number;
  subido: string;
  subidoPor?: string;
  origen: "seed" | "kv";
}

const fecha = (iso: string) =>
  iso ? new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "";

const urlArchivo = (id: string, descargar = false) =>
  `/api/tutoriales/archivo?id=${encodeURIComponent(id)}${descargar ? "&descargar=1" : ""}`;

/** El HTML lo genera el server desde nuestros propios archivos; igual sacamos script/handlers. */
const limpiarHtml = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");

/** CSV a filas. Soporta ; o , como separador y comillas dobles. */
function parsearCSV(texto: string): string[][] {
  const limpio = texto.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const primera = limpio.split("\n")[0] ?? "";
  const delim = primera.split(";").length > primera.split(",").length ? ";" : ",";
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = "";
  let enComillas = false;
  for (let i = 0; i < limpio.length; i++) {
    const c = limpio[i];
    if (enComillas) {
      if (c === '"' && limpio[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') enComillas = false;
      else campo += c;
    } else if (c === '"' && campo === "") enComillas = true; // 24" en el medio no abre campo
    else if (c === delim) { fila.push(campo); campo = ""; }
    else if (c === "\n") { fila.push(campo); filas.push(fila); fila = []; campo = ""; }
    else campo += c;
  }
  if (campo || fila.length) { fila.push(campo); filas.push(fila); }
  return filas.filter((f) => f.some((v) => v.trim() !== ""));
}

export default function TutorialesView({ seccion }: { seccion: SeccionTutorial }) {
  const info = seccionTut(seccion);
  const [items, setItems] = useState<Tutorial[]>([]);
  const [estado, setEstado] = useState<"loading" | "ok" | "error">("loading");
  const [rol, setRol] = useState("");
  const [q, setQ] = useState("");
  const [abierto, setAbierto] = useState<Tutorial | null>(null);
  const [msg, setMsg] = useState("");
  const [subiendo, setSubiendo] = useState(false);
  const [titulo, setTitulo] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const esAdmin = rol === "admin";

  async function cargar() {
    setEstado("loading");
    try {
      const j = await (await fetch(`/api/tutoriales?seccion=${seccion}`)).json();
      if (!j.ok) throw new Error();
      setItems(j.items);
      setEstado("ok");
    } catch {
      setEstado("error");
    }
  }
  useEffect(() => {
    setAbierto(null);
    cargar();
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((j) => { if (j.ok) setRol(j.rol); })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seccion]);

  async function subir(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    if (!formatoSoportado(file.name)) return setMsg("Formato no soportado. Se aceptan .doc, .docx, .pdf y .csv.");
    if (file.size > MAX_BYTES) return setMsg(`El archivo supera el máximo (${Math.round(MAX_BYTES / 1024 / 1024)} MB).`);

    setSubiendo(true);
    try {
      const dataBase64 = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result).split(",")[1] ?? "");
        r.onerror = () => rej(new Error());
        r.readAsDataURL(file);
      });
      const j = await (
        await fetch("/api/tutoriales", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ seccion, titulo, archivo: file.name, dataBase64 }),
        })
      ).json();
      if (!j.ok) throw new Error(j.error);
      setItems(j.items.filter((t: Tutorial) => t.seccion === seccion));
      setTitulo("");
      if (fileRef.current) fileRef.current.value = "";
    } catch (err) {
      setMsg(err instanceof Error && err.message ? err.message : "No se pudo subir el archivo.");
    } finally {
      setSubiendo(false);
    }
  }

  async function quitar(t: Tutorial) {
    if (!confirm(`¿Quitar "${t.titulo}" de Tutoriales?`)) return;
    const j = await (await fetch(`/api/tutoriales?id=${encodeURIComponent(t.id)}`, { method: "DELETE" })).json();
    if (j.ok) {
      setItems(j.items.filter((x: Tutorial) => x.seccion === seccion));
      if (abierto?.id === t.id) setAbierto(null);
    } else setMsg(j.error || "No se pudo borrar.");
  }

  const filtrados = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return items;
    return items.filter((it) => `${it.titulo} ${it.archivo}`.toLowerCase().includes(t));
  }, [items, q]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-xl font-semibold text-ink">Tutoriales · {info.label}</h1>
        <p className="mt-0.5 max-w-2xl text-sm text-muted">{info.desc} Vas a poder verlos online o descargar el archivo original.</p>
      </div>

      {esAdmin && (
        <Card className="p-4">
          <p className="mb-2 text-2xs font-medium uppercase tracking-wide text-faint">Subir nuevo tutorial</p>
          <form onSubmit={subir} className="grid grid-cols-1 gap-3 sm:grid-cols-[1.4fr_1.4fr_auto] sm:items-end">
            <Field label="Título (opcional)">
              <input className={inputClass} placeholder="Ej: Ayres POS — carga de precios" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
            </Field>
            <Field label="Archivo (.doc, .docx, .pdf, .csv)">
              <input ref={fileRef} type="file" accept={ACCEPT_UPLOAD} className={inputClass} />
            </Field>
            <Button type="submit" disabled={subiendo}>{subiendo ? "Subiendo…" : "Subir nuevo"}</Button>
          </form>
          <p className="mt-2 text-2xs text-faint">Máximo {Math.round(MAX_BYTES / 1024 / 1024)} MB por archivo. Se guarda el original tal cual, con su nombre y extensión.</p>
          {msg && <p className="mt-2 text-2xs text-bad">{msg}</p>}
        </Card>
      )}

      <Card className="flex flex-wrap items-center gap-3 p-3">
        <input className={`${inputClass} max-w-[260px] py-1`} placeholder="Buscar tutorial…" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="ml-auto text-2xs text-faint">{filtrados.length} tutorial{filtrados.length === 1 ? "" : "es"}</span>
      </Card>

      <Card className="overflow-hidden">
        {estado === "loading" ? (
          <div className="space-y-2 p-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
        ) : estado === "error" ? (
          <div className="p-4 text-sm text-bad">No se pudieron cargar los tutoriales.</div>
        ) : filtrados.length === 0 ? (
          <EmptyState
            title="Todavía no hay tutoriales"
            desc={esAdmin ? "Subí el primero con el formulario de arriba (.doc, .docx, .pdf o .csv)." : "Cuando sistemas cargue documentación de este sistema, la vas a ver acá."}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-2xs uppercase tracking-wide text-faint">
                  <th className="px-4 py-2 font-medium">Tutorial</th>
                  <th className="px-3 py-2 font-medium">Formato</th>
                  <th className="px-3 py-2 font-medium">Carga</th>
                  <th className="px-3 py-2 text-right font-medium">Tamaño</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((t) => {
                  const f = formatoDe(t.formato);
                  return (
                    <tr key={t.id} className="border-b border-line/70 last:border-0 hover:bg-ink/[0.02]">
                      <td className="px-4 py-2">
                        <p className="font-medium text-ink">{t.titulo}</p>
                        <p className="text-2xs text-faint">{t.archivo}{t.subidoPor ? ` · ${t.subidoPor.split("@")[0]}` : ""}</p>
                      </td>
                      <td className="px-3 py-2">
                        <span className="rounded-full border border-line bg-ink/5 px-2.5 py-1 text-2xs font-medium text-muted">
                          {f?.icon} {f?.label ?? t.formato.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-2xs text-muted">{fecha(t.subido)}</td>
                      <td className="px-3 py-2 text-right font-mono tnum text-2xs text-muted">{tamanoLegible(t.bytes)}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setAbierto(abierto?.id === t.id ? null : t)}
                            className="rounded-md border border-line px-2.5 py-1 text-2xs font-medium text-muted hover:text-ink"
                          >
                            {abierto?.id === t.id ? "Cerrar" : "Ver online"}
                          </button>
                          <a
                            href={urlArchivo(t.id, true)}
                            className="rounded-md border border-line px-2.5 py-1 text-2xs font-medium text-muted hover:text-ink"
                          >
                            Descargar
                          </a>
                          {esAdmin && t.origen === "kv" && (
                            <button onClick={() => quitar(t)} className="text-2xs font-medium text-bad hover:underline">Quitar</button>
                          )}
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

      {abierto && <Visor tutorial={abierto} onCerrar={() => setAbierto(null)} />}
    </div>
  );
}

/** Render embebido según formato: PDF nativo, Word convertido a HTML, CSV como tabla. */
function Visor({ tutorial, onCerrar }: { tutorial: Tutorial; onCerrar: () => void }) {
  const [html, setHtml] = useState("");
  const [filas, setFilas] = useState<string[][]>([]);
  const [estado, setEstado] = useState<"loading" | "ok" | "error">("loading");
  const [error, setError] = useState("");
  const render = formatoDe(tutorial.formato)?.render;

  useEffect(() => {
    let vivo = true;
    setEstado("loading");
    setError("");

    if (render === "nativo") {
      setEstado("ok");
      return;
    }
    if (render === "tabla") {
      fetch(urlArchivo(tutorial.id))
        .then((r) => r.text())
        .then((txt) => { if (vivo) { setFilas(parsearCSV(txt)); setEstado("ok"); } })
        .catch(() => { if (vivo) setEstado("error"); });
      return () => { vivo = false; };
    }
    fetch(`/api/tutoriales/html?id=${encodeURIComponent(tutorial.id)}`)
      .then((r) => r.json())
      .then((j) => {
        if (!vivo) return;
        if (j.ok) { setHtml(limpiarHtml(j.html)); setEstado("ok"); }
        else { setError(j.error || ""); setEstado("error"); }
      })
      .catch(() => { if (vivo) setEstado("error"); });
    return () => { vivo = false; };
  }, [tutorial.id, render]);

  const [cabecera, ...cuerpo] = filas;

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-4 py-2">
        <p className="truncate text-sm font-medium text-ink">{tutorial.titulo}</p>
        <div className="flex shrink-0 items-center gap-2">
          <a href={urlArchivo(tutorial.id, true)} className="rounded-md border border-line px-2.5 py-1 text-2xs font-medium text-muted hover:text-ink">Descargar original</a>
          <button onClick={onCerrar} className="rounded-md border border-line px-2.5 py-1 text-2xs font-medium text-muted hover:text-ink">Cerrar</button>
        </div>
      </div>

      {estado === "loading" ? (
        <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}</div>
      ) : estado === "error" ? (
        <div className="p-4 text-sm text-muted">
          {error || "No se pudo mostrar el documento."}{" "}
          <a href={urlArchivo(tutorial.id, true)} className="font-medium text-action hover:underline">Descargalo para abrirlo.</a>
        </div>
      ) : render === "nativo" ? (
        <iframe src={urlArchivo(tutorial.id)} title={tutorial.titulo} className="h-[70vh] w-full bg-ink/5" />
      ) : render === "tabla" ? (
        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-surface">
              <tr className="border-b border-line text-2xs uppercase tracking-wide text-faint">
                {(cabecera ?? []).map((c, i) => <th key={i} className="px-3 py-2 font-medium">{c}</th>)}
              </tr>
            </thead>
            <tbody>
              {cuerpo.map((f, i) => (
                <tr key={i} className="border-b border-line/70 last:border-0">
                  {f.map((v, j) => <td key={j} className="px-3 py-1.5 text-muted">{v}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div
          className="doc-embebido max-h-[70vh] overflow-auto px-5 py-4 text-sm leading-relaxed text-ink"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
    </Card>
  );
}
