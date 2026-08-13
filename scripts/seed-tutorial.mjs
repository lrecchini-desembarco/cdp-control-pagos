// Carga un tutorial al repositorio "precargado" (el que anda siempre, con o sin KV).
//
//   node scripts/seed-tutorial.mjs --seccion=ayres --titulo="Ayres POS" "C:\ruta\archivo.pdf"
//
// Qué hace:
//   1. Copia el archivo ORIGINAL a public/tutoriales/ (se descarga tal cual).
//   2. Si es .doc/.docx y hay LibreOffice, deja además un HTML para "Ver online"
//      (el .doc viejo no se puede convertir en el server; por eso se hace acá).
//   3. Anota la entrada en lib/tutoriales-seed.json.
//
// Los tutoriales que suben desde la UI NO pasan por acá: van al store (KV).

import { copyFile, mkdir, readFile, writeFile, stat, readdir, rm } from "fs/promises";
import { existsSync } from "fs";
import { execFile } from "child_process";
import { promisify } from "util";
import { basename, extname, join } from "path";

const ejecutar = promisify(execFile);
const RAIZ = process.cwd();
const PUBLICO = join(RAIZ, "public", "tutoriales");
const SEED = join(RAIZ, "lib", "tutoriales-seed.json");
const SECCIONES = ["tango", "ayres", "raven", "qlik"];
const EXTENSIONES = [".doc", ".docx", ".pdf", ".csv"];

const SOFFICE = [
  "C:/Program Files/LibreOffice/program/soffice.exe",
  "C:/Program Files (x86)/LibreOffice/program/soffice.exe",
  "/usr/bin/soffice",
  "/usr/bin/libreoffice",
].find((p) => existsSync(p));

const arg = (nombre) => {
  const p = process.argv.find((a) => a.startsWith(`--${nombre}=`));
  return p ? p.slice(nombre.length + 3) : "";
};

// nombre-de-archivo seguro para servir desde public/
const slug = (s) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-|-$/g, "").toLowerCase();

/** .doc/.docx -> HTML con LibreOffice headless, para el visor online. */
async function convertirAHtml(origen, destinoDir) {
  if (!SOFFICE) return null;
  const tmp = join(destinoDir, ".conv");
  await mkdir(tmp, { recursive: true });
  try {
    await ejecutar(SOFFICE, ["--headless", "--convert-to", "html:HTML", "--outdir", tmp, origen], { timeout: 120000 });
    const salida = (await readdir(tmp)).find((f) => f.toLowerCase().endsWith(".html"));
    if (!salida) return null;
    return await readFile(join(tmp, salida), "utf8");
  } catch {
    return null;
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

async function main() {
  const seccion = arg("seccion");
  const origen = process.argv.slice(2).find((a) => !a.startsWith("--"));

  if (!SECCIONES.includes(seccion)) {
    console.error(`Falta --seccion. Opciones: ${SECCIONES.join(" | ")}`);
    process.exit(1);
  }
  if (!origen || !existsSync(origen)) {
    console.error("Falta la ruta del archivo (o no existe).");
    process.exit(1);
  }
  const ext = extname(origen).toLowerCase();
  if (!EXTENSIONES.includes(ext)) {
    console.error(`Formato no soportado (${ext}). Se aceptan: ${EXTENSIONES.join(" ")}`);
    process.exit(1);
  }

  await mkdir(PUBLICO, { recursive: true });
  const archivo = basename(origen);
  const nombrePublico = `${seccion}-${slug(archivo)}`;
  await copyFile(origen, join(PUBLICO, nombrePublico));
  const { size } = await stat(origen);

  const entrada = {
    id: `seed-${seccion}-${slug(basename(archivo, ext))}`.slice(0, 60),
    seccion,
    titulo: arg("titulo") || basename(archivo, ext).replace(/[_-]+/g, " "),
    archivo,                                   // nombre ORIGINAL (así se descarga)
    formato: ext.slice(1),
    bytes: size,
    subido: new Date().toISOString(),
    origen: "seed",
    url: `/tutoriales/${nombrePublico}`,
  };

  if (ext === ".doc" || ext === ".docx") {
    const html = await convertirAHtml(origen, PUBLICO);
    if (html) {
      const nombreHtml = `${nombrePublico}.html`;
      await writeFile(join(PUBLICO, nombreHtml), html, "utf8");
      entrada.preview = `/tutoriales/${nombreHtml}`;
      console.log("· Preview HTML generado con LibreOffice.");
    } else if (ext === ".doc") {
      console.log("· Sin LibreOffice: el .doc va a quedar solo para descargar (no se ve online).");
    }
  }

  const actual = JSON.parse(await readFile(SEED, "utf8"));
  const seed = [...actual.filter((t) => t.id !== entrada.id), entrada];
  await writeFile(SEED, JSON.stringify(seed, null, 2) + "\n", "utf8");

  console.log(`✔ ${entrada.titulo} → Tutoriales · ${seccion}  (${(size / 1024 / 1024).toFixed(1)} MB)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
