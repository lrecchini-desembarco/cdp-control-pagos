import { readFile, writeFile, readdir, stat, mkdir, unlink } from "fs/promises";
import { join, resolve, basename } from "path";
import { readStore, writeStore } from "./store";
import seed from "./tutoriales-seed.json";
import { MAX_BYTES, SECCIONES_TUT, esSeccion, extensionDe, formatoDe, type SeccionTutorial } from "./tutoriales";

// Repositorio de tutoriales por sistema (Tango / Ayres / Raven / Qlik).
//
// Tres orígenes, una sola lista:
//   - seed : archivos versionados en public/tutoriales (lib/tutoriales-seed.json).
//            Andan siempre, incluso sin KV. Los carga scripts/seed-tutorial.mjs.
//   - red  : carpeta compartida de la oficina (el SMB del Proxmox), si está seteada
//            TUTORIALES_DIR. Es la fuente de verdad: un subdirectorio por sección
//            (<TUTORIALES_DIR>/ayres/…) y lo que se sube desde la UI se escribe ahí.
//            OJO: solo funciona si el server llega al SMB (ver docs/tutoriales.md).
//   - kv   : fallback cuando no hay carpeta de red. Metadata en la key "tutoriales"
//            y el archivo en "tutorial-<id>" (base64).
// Ver y descargar: cualquiera. Subir y borrar: solo admin (lo corta la API).

export type OrigenTutorial = "seed" | "red" | "kv";

/** Carpeta compartida (SMB montado o ruta UNC). Vacía = se usa el store. */
const DIR_RED = process.env.TUTORIALES_DIR?.trim() || "";
export const usaRed = () => Boolean(DIR_RED);

const dirSeccion = (seccion: string) => join(DIR_RED, seccion);
const idRed = (seccion: string, archivo: string) => `red-${Buffer.from(`${seccion}/${archivo}`).toString("base64url")}`;

/** Ruta real de un id de red, ya validada contra path traversal. */
function rutaDeIdRed(id: string): string | null {
  if (!DIR_RED || !id.startsWith("red-")) return null;
  let rel: string;
  try {
    rel = Buffer.from(id.slice(4), "base64url").toString("utf8");
  } catch {
    return null;
  }
  const [seccion, ...resto] = rel.split("/");
  if (!esSeccion(seccion) || resto.length !== 1) return null;
  const ruta = resolve(dirSeccion(seccion), basename(resto[0]));
  return ruta.startsWith(resolve(dirSeccion(seccion))) ? ruta : null;
}

/** Lo que hay hoy en la carpeta de red. Si no se puede leer, devuelve vacío (no rompe la vista). */
async function desdeRed(): Promise<Tutorial[]> {
  if (!DIR_RED) return [];
  const out: Tutorial[] = [];
  for (const s of SECCIONES_TUT) {
    let archivos: string[];
    try {
      archivos = await readdir(dirSeccion(s.id));
    } catch {
      continue; // la sección todavía no tiene carpeta
    }
    for (const archivo of archivos) {
      const formato = formatoDe(extensionDe(archivo));
      if (!formato) continue;
      try {
        const info = await stat(join(dirSeccion(s.id), archivo));
        if (!info.isFile()) continue;
        out.push({
          id: idRed(s.id, archivo),
          seccion: s.id,
          titulo: archivo.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "),
          archivo,
          formato: formato.ext,
          bytes: info.size,
          subido: info.mtime.toISOString(),
          origen: "red",
        });
      } catch {
        /* archivo que desapareció entre el readdir y el stat */
      }
    }
  }
  return out;
}

export interface Tutorial {
  id: string;
  seccion: SeccionTutorial;
  titulo: string;
  archivo: string;        // nombre original con extensión (así se descarga)
  formato: string;        // pdf | docx | doc | csv
  bytes: number;
  subido: string;         // ISO
  subidoPor?: string;
  origen: OrigenTutorial;
  url?: string;           // seed: ruta pública del original (/tutoriales/…)
  preview?: string;       // seed: ruta pública del HTML ya convertido (opcional)
}

const KEY = "tutoriales";
const keyArchivo = (id: string) => `tutorial-${id}`;

const nuevoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const desdeSeed = (): Tutorial[] => (seed as Tutorial[]).map((t) => ({ ...t, origen: "seed" }));

async function subidos(): Promise<Tutorial[]> {
  return (await readStore<Tutorial[] | null>(KEY, null)) ?? [];
}

/** Lista completa (seed + red + subidos), la más nueva primero. Filtra por sección si se pide. */
export async function getTutoriales(seccion?: string): Promise<Tutorial[]> {
  const todos = [...desdeSeed(), ...(await desdeRed()), ...(await subidos())];
  const l = seccion ? todos.filter((t) => t.seccion === seccion) : todos;
  return l.sort((a, b) => (b.subido || "").localeCompare(a.subido || ""));
}

export async function getTutorial(id: string): Promise<Tutorial | null> {
  return (await getTutoriales()).find((t) => t.id === id) ?? null;
}

/** Alta de un tutorial subido desde la UI. `dataBase64` es el archivo original. */
export async function addTutorial(input: {
  seccion?: string;
  titulo?: string;
  archivo?: string;
  dataBase64?: string;
  email?: string;
}): Promise<Tutorial[]> {
  const seccion = String(input.seccion ?? "");
  if (!esSeccion(seccion)) throw new Error("Sección inválida.");

  const archivo = String(input.archivo ?? "").trim();
  if (!archivo) throw new Error("Falta el archivo.");
  const formato = formatoDe(extensionDe(archivo));
  if (!formato) throw new Error("Formato no soportado. Se aceptan .doc, .docx, .pdf y .csv.");

  const data = String(input.dataBase64 ?? "").replace(/^data:[^;]+;base64,/, "");
  if (!data) throw new Error("El archivo llegó vacío.");
  const bytes = Buffer.from(data, "base64").length;
  if (bytes > MAX_BYTES) throw new Error(`El archivo supera el máximo (${Math.round(MAX_BYTES / 1024 / 1024)} MB).`);

  // Con carpeta de red, el archivo va al SMB (fuente de verdad, se ve desde el explorador).
  if (usaRed()) {
    const nombre = basename(archivo);
    await mkdir(dirSeccion(seccion), { recursive: true });
    await writeFile(join(dirSeccion(seccion), nombre), Buffer.from(data, "base64"));
    return getTutoriales();
  }

  const id = nuevoId();
  const t: Tutorial = {
    id,
    seccion,
    titulo: String(input.titulo ?? "").trim() || archivo.replace(/\.[^.]+$/, ""),
    archivo,
    formato: formato.ext,
    bytes,
    subido: new Date().toISOString(),
    subidoPor: input.email,
    origen: "kv",
  };

  await writeStore(keyArchivo(id), data);
  await writeStore(KEY, [...(await subidos()), t]);
  return getTutoriales();
}

/** Baja. Los del seed no se borran desde la UI (se sacan del repo). */
export async function removeTutorial(id: string): Promise<Tutorial[]> {
  const ruta = rutaDeIdRed(id);
  if (ruta) {
    await unlink(ruta);
    return getTutoriales();
  }
  const items = await subidos();
  if (!items.some((t) => t.id === id)) throw new Error("Ese tutorial viene precargado; no se borra desde acá.");
  await writeStore(keyArchivo(id), "");
  await writeStore(KEY, items.filter((t) => t.id !== id));
  return getTutoriales();
}

/** Bytes del archivo original, para ver online o descargar. */
export async function getArchivo(id: string): Promise<{ tutorial: Tutorial; buffer: Buffer } | null> {
  const t = await getTutorial(id);
  if (!t) return null;
  if (t.origen === "red") {
    const ruta = rutaDeIdRed(id);
    if (!ruta) return null;
    try {
      return { tutorial: t, buffer: await readFile(ruta) };
    } catch {
      return null;
    }
  }
  if (t.origen === "seed") {
    if (!t.url) return null;
    try {
      return { tutorial: t, buffer: await readFile(join(process.cwd(), "public", t.url.replace(/^\//, ""))) };
    } catch {
      return null;
    }
  }
  const data = await readStore<string>(keyArchivo(id), "");
  if (!data) return null;
  return { tutorial: t, buffer: Buffer.from(data, "base64") };
}

/** HTML para ver online un .doc/.docx. El .doc viejo solo si el seed dejó el preview. */
export async function getHtml(id: string): Promise<{ html: string } | { error: string }> {
  const archivo = await getArchivo(id);
  if (!archivo) return { error: "No se encontró el archivo." };
  const { tutorial, buffer } = archivo;

  if (tutorial.preview) {
    try {
      return { html: await readFile(join(process.cwd(), "public", tutorial.preview.replace(/^\//, "")), "utf8") };
    } catch {
      /* si el preview no está, se intenta convertir abajo */
    }
  }

  if (tutorial.formato === "docx") {
    try {
      // import perezoso: mammoth solo se carga cuando hay que convertir un .docx.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mammoth = require("mammoth") as typeof import("mammoth");
      const { value } = await mammoth.convertToHtml({ buffer });
      return { html: value };
    } catch {
      return { error: "No se pudo convertir el documento. Descargalo para verlo." };
    }
  }

  return { error: "Este formato no se puede ver online. Descargalo para abrirlo." };
}
