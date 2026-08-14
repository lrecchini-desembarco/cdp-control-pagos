import { cookies } from "next/headers";
import { findUsuario } from "./users-store";
import { COOKIE, leerSesionCookie } from "./auth-cookie";
import type { Rol, Puesto } from "./roles";

export interface Sesion {
  email: string;
  rol: Rol;
  nav?: string[]; // pantallas propias del usuario (pisan el rol); undefined = usar el rol
  // Perfil del franquiciado (lo completa en su primer ingreso).
  marca?: string;
  local?: string;
  puesto?: Puesto;
}

/**
 * Sesión actual (server-only). La cookie guarda el email; el rol se deriva del
 * store de usuarios (fuente de verdad), así no se puede escalar tocando la cookie.
 */
export async function getSesion(): Promise<Sesion | null> {
  const email = await leerSesionCookie(cookies().get(COOKIE)?.value) || sesionDevEmail();
  if (!email) return null;
  const u = await findUsuario(email);
  // En dev, si el email de auto-login no está en el store, se entra igual como admin.
  if (!u && sesionDevEmail() === email) return { email, rol: "admin" };
  return u
    ? {
        email: u.email, rol: u.rol,
        ...(u.nav ? { nav: u.nav } : {}),
        ...(u.marca ? { marca: u.marca } : {}),
        ...(u.local ? { local: u.local } : {}),
        ...(u.puesto ? { puesto: u.puesto } : {}),
      }
    : null;
}

/**
 * Email de auto-login para desarrollo LOCAL, o "" si no aplica. Doble candado para
 * que NUNCA corra en producción: exige NODE_ENV != production Y la var DEV_AUTOLOGIN
 * (que solo está en el .env.local de la máquina, no en Vercel).
 */
function sesionDevEmail(): string {
  if (process.env.NODE_ENV === "production") return "";
  return process.env.DEV_AUTOLOGIN ?? "";
}
