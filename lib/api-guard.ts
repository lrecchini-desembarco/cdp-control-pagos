import { NextResponse } from "next/server";
import { getSesion, type Sesion } from "./session";
import { sesionPuedeVer } from "./roles-store";

// Guards reutilizables para las rutas /api. El middleware NO cubre /api (el cron
// necesita pegarles), así que cada ruta se protege sola con esto.
const j = (error: string, status: number) => NextResponse.json({ ok: false, error }, { status });

/**
 * Exige sesión válida y, si se pasa `href`, que el usuario tenga permiso de ver esa
 * pantalla (mismo criterio que el sidebar). Uso:
 *   const g = await guard("/cruce"); if ("res" in g) return g.res;  // luego g.s
 */
export async function guard(href?: string): Promise<{ s: Sesion } | { res: NextResponse }> {
  const s = await getSesion();
  if (!s) return { res: j("No autorizado.", 401) };
  if (href && !(await sesionPuedeVer(s, href))) return { res: j("Sin permiso.", 403) };
  return { s };
}

/** Igual que guard() pero además exige rol admin. */
export async function guardAdmin(): Promise<{ s: Sesion } | { res: NextResponse }> {
  const s = await getSesion();
  if (!s) return { res: j("No autorizado.", 401) };
  if (s.rol !== "admin") return { res: j("Solo admin.", 403) };
  return { s };
}

/**
 * Autoriza endpoints de cron (notify / *-refresh): pasa si trae el header del cron
 * de Vercel (Authorization: Bearer CRON_SECRET) o si es un admin logueado (botón
 * manual). Sin CRON_SECRET configurado NO bloquea, para no romper el cron antes de
 * cargarlo — conviene setear CRON_SECRET en Vercel.
 */
export async function cronOAdmin(req: Request): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") === `Bearer ${secret}`) return true;
  const s = await getSesion();
  if (s?.rol === "admin") return true;
  return !secret;
}
