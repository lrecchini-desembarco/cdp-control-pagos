import { CATEGORIAS_CRED, type CredencialPublica } from "./credenciales";

// Carga masiva de credenciales desde CSV/Excel. Puro (recibe las filas ya leídas por
// SheetJS o por el split del CSV) para poder testearlo y correrlo en el cliente:
// así el archivo se parsea y se previsualiza en el navegador, y al servidor solo
// viajan las filas que el usuario confirmó.

export interface FilaCredencial {
  sistema: string;
  categoria: string;
  usuario: string;
  secreto: string;
  url: string;
  nota: string;
}

export interface FilaImport extends FilaCredencial {
  /** Número de fila en el archivo (1 = primera fila de datos), para señalar errores. */
  fila: number;
  /** Qué va a pasar si se confirma la importación. */
  accion: "alta" | "actualiza" | "error";
  /** Por qué no se puede importar (solo si accion === "error"). */
  error?: string;
  /** Id de la credencial existente que se va a pisar (solo si accion === "actualiza"). */
  id?: string;
}

const norm = (s: unknown) =>
  String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

const txt = (s: unknown) => String(s ?? "").trim();

// Nombres aceptados para cada columna. La idea es que el que arma el Excel no tenga
// que adivinar: sirve "clave", "contraseña", "password", "pass"…
const ALIAS: Record<keyof FilaCredencial, string[]> = {
  sistema: ["sistema", "servicio", "plataforma", "aplicacion", "app", "nombre"],
  categoria: ["categoria", "rubro", "tipo", "grupo"],
  usuario: ["usuario", "user", "username", "email", "mail", "cuenta", "login"],
  secreto: ["contrasena", "contrasenia", "clave", "password", "pass", "secreto", "pin"],
  url: ["url", "link", "sitio", "direccion", "web"],
  nota: ["nota", "notas", "observacion", "observaciones", "comentario", "detalle"],
};

/** Columnas de la plantilla, en orden (también las que exporta el botón de ejemplo). */
export const COLUMNAS_PLANTILLA = ["Sistema", "Categoria", "Usuario", "Contrasena", "URL", "Nota"];

/** Ubica cada columna por su encabezado. Devuelve -1 en las que no están. */
function mapearColumnas(encabezado: string[]): Record<keyof FilaCredencial, number> {
  const celdas = encabezado.map(norm);
  const buscar = (alias: string[]) => celdas.findIndex((c) => alias.includes(c));
  return {
    sistema: buscar(ALIAS.sistema),
    categoria: buscar(ALIAS.categoria),
    usuario: buscar(ALIAS.usuario),
    secreto: buscar(ALIAS.secreto),
    url: buscar(ALIAS.url),
    nota: buscar(ALIAS.nota),
  };
}

/**
 * ¿Esta fila parece el encabezado? Se busca en las primeras filas porque los Excel
 * suelen traer título o filas vacías arriba de la tabla.
 */
function buscarEncabezado(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const m = mapearColumnas(rows[i] ?? []);
    if (m.sistema >= 0 && m.secreto >= 0) return i;
  }
  return -1;
}

/** La categoría del archivo, si coincide con alguna de las nuestras; si no, "Otros". */
function categoriaValida(v: string): string {
  const t = norm(v);
  return CATEGORIAS_CRED.find((c) => norm(c) === t) ?? (t ? "Otros" : "Otros");
}

/** Clave de identidad de una credencial: mismo sistema + mismo usuario = la misma. */
export const claveCred = (sistema: string, usuario: string) => `${norm(sistema)}|${norm(usuario)}`;

export interface ResultadoParseo {
  filas: FilaImport[];
  /** Problema que impide importar el archivo entero (encabezado ausente, archivo vacío). */
  fatal?: string;
}

/**
 * Filas crudas del archivo -> filas listas para importar, ya cotejadas contra lo que
 * hay cargado. No escribe nada: solo dice qué pasaría.
 */
export function parsearCredenciales(rows: string[][], existentes: CredencialPublica[]): ResultadoParseo {
  const iCab = buscarEncabezado(rows);
  if (iCab < 0) {
    return {
      filas: [],
      fatal:
        "No encontré los encabezados. El archivo necesita al menos una columna \"Sistema\" y una \"Contraseña\" (o \"Clave\").",
    };
  }

  const col = mapearColumnas(rows[iCab]);
  const dato = (fila: string[], i: number) => (i >= 0 ? txt(fila[i]) : "");

  // Índice de lo ya cargado, para saber si cada fila es alta o pisa una credencial.
  const porClave = new Map(existentes.map((c) => [claveCred(c.sistema, c.usuario), c]));
  // Duplicados DENTRO del archivo: la segunda aparición se marca error, no se pisa sola.
  const vistas = new Set<string>();

  const filas: FilaImport[] = [];
  for (let i = iCab + 1; i < rows.length; i++) {
    const cruda = rows[i] ?? [];
    const sistema = dato(cruda, col.sistema);
    const usuario = dato(cruda, col.usuario);
    const secreto = dato(cruda, col.secreto);
    const url = dato(cruda, col.url);
    const nota = dato(cruda, col.nota);
    const categoria = categoriaValida(dato(cruda, col.categoria));

    // Fila totalmente vacía: es relleno del Excel, se saltea sin ruido.
    if (!sistema && !usuario && !secreto && !url && !nota) continue;

    const base = { fila: i - iCab, sistema, categoria, usuario, secreto, url, nota };
    const clave = claveCred(sistema, usuario);

    if (!sistema) {
      filas.push({ ...base, accion: "error", error: "Falta el sistema." });
      continue;
    }
    if (!secreto) {
      filas.push({ ...base, accion: "error", error: "Falta la contraseña." });
      continue;
    }
    if (vistas.has(clave)) {
      filas.push({ ...base, accion: "error", error: "Repetida en el archivo (mismo sistema y usuario)." });
      continue;
    }
    vistas.add(clave);

    const previa = porClave.get(clave);
    filas.push(previa ? { ...base, accion: "actualiza", id: previa.id } : { ...base, accion: "alta" });
  }

  if (filas.length === 0) return { filas, fatal: "El archivo no tiene filas con datos." };
  return { filas };
}

/** Resumen para el cartel de confirmación. */
export const resumenImport = (filas: FilaImport[]) => ({
  altas: filas.filter((f) => f.accion === "alta").length,
  actualiza: filas.filter((f) => f.accion === "actualiza").length,
  errores: filas.filter((f) => f.accion === "error").length,
});
