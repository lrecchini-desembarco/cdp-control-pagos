// Directorio de contactos y datos importantes para resolver temas rápido (Tango,
// sistemas, proveedores, bancos…). Módulo puro (sin fs): lo importan la View
// (cliente) y la API (server). La persistencia vive en el store, key "contactos".

export interface Contacto {
  id: string;
  nombre: string;      // persona ("Juan Pérez") o área/casilla ("Soporte Tango")
  empresa?: string;    // "Tango", "Reven", "DS Group · Sistemas"…
  rol?: string;        // qué hace / cargo ("Soporte técnico")
  telefono?: string;   // como lo escriben; se normaliza para WhatsApp/llamada
  email?: string;
  temas?: string;      // con qué temas verlo ("Integraciones Tango por local")
  urgente?: boolean;   // resoluciones urgentes -> se destaca arriba
  notas?: string;      // cualquier aclaración (horarios, nº de cliente, etc.)
}

const s = (v: unknown, max = 200): string => String(v ?? "").trim().slice(0, max);

/** Normaliza/valida lo que llega del cliente antes de guardar. Devuelve null si no hay nombre. */
export function limpiarContacto(raw: Partial<Contacto>, id: string): Contacto | null {
  const nombre = s(raw.nombre, 120);
  if (!nombre) return null;
  return {
    id,
    nombre,
    empresa: s(raw.empresa, 80) || undefined,
    rol: s(raw.rol, 100) || undefined,
    telefono: s(raw.telefono, 40) || undefined,
    email: s(raw.email, 120) || undefined,
    temas: s(raw.temas, 400) || undefined,
    urgente: Boolean(raw.urgente),
    notas: s(raw.notas, 400) || undefined,
  };
}

// --- Links de acción rápida ---

/** Link a WhatsApp (wa.me). Best-effort para números de Argentina. */
export function waLink(telefono?: string): string | null {
  if (!telefono) return null;
  let d = telefono.replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("00")) d = d.slice(2);          // prefijo internacional 00
  d = d.replace(/^0/, "");                          // 0 de larga distancia nacional
  d = d.replace(/^(\d{2,4})15/, "$1");              // "15" viejo de celular tras la característica
  if (!d.startsWith("54")) d = "549" + d;           // AR: código país 54 + 9 de celular
  return `https://wa.me/${d}`;
}

/** Link para llamar (tel:). Conserva un "+" inicial si lo hay. */
export function telLink(telefono?: string): string | null {
  if (!telefono) return null;
  const mas = telefono.trim().startsWith("+") ? "+" : "";
  const d = telefono.replace(/\D/g, "");
  return d ? `tel:${mas}${d}` : null;
}

/** Link para escribir un mail (mailto:), si el email tiene forma válida. */
export function mailLink(email?: string): string | null {
  if (!email) return null;
  const e = email.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? `mailto:${e}` : null;
}
