// Tutoriales: secciones y formatos soportados. Config pura (usable en cliente).

export type SeccionTutorial = "tango" | "ayres" | "raven" | "qlik";

export interface SeccionInfo {
  id: SeccionTutorial;
  label: string;
  href: string;
  desc: string;
}

export const SECCIONES_TUT: SeccionInfo[] = [
  { id: "tango", label: "Tango", href: "/tutoriales/tango", desc: "Instructivos de Tango Gestión y Tango Restô: precios, costos, cierres." },
  { id: "ayres", label: "Ayres", href: "/tutoriales/ayres", desc: "Instructivos de Ayres POS: operación en el local y back office." },
  { id: "raven", label: "Raven", href: "/tutoriales/raven", desc: "Instructivos de Raven: pedidos, integraciones y reportes." },
  { id: "qlik", label: "Qlik", href: "/tutoriales/qlik", desc: "Instructivos de Qlik Sense: hub, apps y tableros." },
];

export const esSeccion = (v: unknown): v is SeccionTutorial =>
  v === "tango" || v === "ayres" || v === "raven" || v === "qlik";

export const seccionTut = (id: string): SeccionInfo =>
  SECCIONES_TUT.find((s) => s.id === id) ?? SECCIONES_TUT[0];

// Formatos que se pueden subir y cómo se muestran online.
//   nativo  -> el browser lo dibuja solo (visor embebido)
//   convertido -> el server lo pasa a HTML (mammoth / LibreOffice en el seed)
//   tabla   -> se parsea y se dibuja como tabla
export type Render = "nativo" | "convertido" | "tabla";

export interface FormatoInfo {
  ext: string;
  label: string;
  icon: string;
  mime: string;
  render: Render;
}

export const FORMATOS: FormatoInfo[] = [
  { ext: "pdf",  label: "PDF",   icon: "▤", mime: "application/pdf", render: "nativo" },
  { ext: "docx", label: "Word",  icon: "❏", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", render: "convertido" },
  { ext: "doc",  label: "Word",  icon: "❏", mime: "application/msword", render: "convertido" },
  { ext: "csv",  label: "CSV",   icon: "▦", mime: "text/csv", render: "tabla" },
];

export const EXTENSIONES = FORMATOS.map((f) => f.ext);
export const ACCEPT_UPLOAD = FORMATOS.map((f) => `.${f.ext}`).join(",");

export const extensionDe = (nombre: string) => (nombre.split(".").pop() ?? "").toLowerCase();

export const formatoDe = (ext: string): FormatoInfo | null =>
  FORMATOS.find((f) => f.ext === ext.toLowerCase()) ?? null;

export const formatoSoportado = (nombre: string) => Boolean(formatoDe(extensionDe(nombre)));

/** Tope de subida. El body de una función serverless no pasa de ~4,5 MB y base64 infla 33%. */
export const MAX_BYTES = 3 * 1024 * 1024;

export const tamanoLegible = (bytes: number) => {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};
