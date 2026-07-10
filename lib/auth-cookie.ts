// Cookie de sesión. Módulo puro y edge-safe (sin fs ni next/headers, solo Web
// Crypto) para que lo puedan importar el middleware (edge) y el server.
//
// La cookie NO es un email plano: es `email|firma`, donde la firma es un HMAC-SHA256
// del email con SESSION_SECRET. Así nadie puede fabricar una sesión (p.ej. ponerse
// `cdp_sesion=admin@...`) sin conocer el secreto. El rol igual se deriva del store.
export const COOKIE = "cdp_sesion";

const enc = new TextEncoder();

function toB64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(msg));
  return toB64url(sig);
}

// Comparación en tiempo constante (no cortocircuita ante el primer byte distinto).
export function iguales(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/** Valor a guardar en la cookie: `email|firma`. Sin secreto configurado, email plano (legacy). */
export async function firmarSesion(email: string): Promise<string> {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return email;
  return `${email}|${await hmac(secret, email)}`;
}

/**
 * Lee y VALIDA la cookie. Devuelve el email solo si la firma es válida.
 * - Con SESSION_SECRET configurado: exige firma válida (rechaza cookies legacy sin
 *   firma -> esos usuarios re-loguean una vez; y rechaza cualquier email forjado).
 * - Sin SESSION_SECRET (todavía no configurado): acepta email plano para no romper
 *   prod antes de cargar el secreto. APENAS se configure, la firma pasa a ser obligatoria.
 */
export async function leerSesionCookie(raw: string | undefined | null): Promise<string | null> {
  if (!raw) return null;
  const secret = process.env.SESSION_SECRET;
  const i = raw.lastIndexOf("|");
  if (i === -1) {
    // Cookie sin firma. Solo se acepta mientras no haya secreto configurado.
    return secret ? null : raw;
  }
  if (!secret) return null; // viene firmada pero no hay con qué validarla
  const email = raw.slice(0, i);
  const sig = raw.slice(i + 1);
  const esperado = await hmac(secret, email);
  return iguales(sig, esperado) ? email : null;
}
