import { cookies } from "next/headers";
import { findUsuario } from "./users-store";
import { COOKIE, leerSesionCookie } from "./auth-cookie";
import type { Rol } from "./roles";

export interface Sesion {
  email: string;
  rol: Rol;
  nav?: string[]; // pantallas propias del usuario (pisan el rol); undefined = usar el rol
}

/**
 * Sesión actual (server-only). La cookie guarda el email; el rol se deriva del
 * store de usuarios (fuente de verdad), así no se puede escalar tocando la cookie.
 */
export async function getSesion(): Promise<Sesion | null> {
  const email = await leerSesionCookie(cookies().get(COOKIE)?.value);
  if (!email) return null;
  const u = await findUsuario(email);
  return u ? { email: u.email, rol: u.rol, ...(u.nav ? { nav: u.nav } : {}) } : null;
}
