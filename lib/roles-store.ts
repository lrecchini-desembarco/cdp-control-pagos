import { readStore, writeStore } from "./store";
import { ROLES, ROLES_LIST, NAV_CATALOG, UNIVERSALES, puedeVerNav, homeDeNav, type Rol } from "./roles";

// Qué items del menú ve cada rol. Editable desde /usuarios y persistido (KV/file).
// Si el store está vacío, usa los defaults de ROLES (comportamiento actual).
export type NavByRol = Record<Rol, string[]>;

const CATALOGO = new Set(NAV_CATALOG.map((i) => i.href));
const defaults = (): NavByRol =>
  Object.fromEntries(ROLES_LIST.map((r) => [r, [...ROLES[r].nav]])) as NavByRol;

// Garantías anti-autobloqueo: /guia siempre. El ADMIN es superusuario y SIEMPRE ve
// todo el catálogo (así las rutas nuevas aparecen solas, sin habilitarlas a mano).
export function blindar(rol: Rol, nav: string[]): string[] {
  if (rol === "admin") return NAV_CATALOG.map((i) => i.href);
  const limpio = nav.filter((h) => CATALOGO.has(h));
  const set = new Set(limpio);
  for (const u of UNIVERSALES) set.add(u);
  // preserva el orden del catálogo
  return NAV_CATALOG.map((i) => i.href).filter((h) => set.has(h));
}

export async function getRolesNav(): Promise<NavByRol> {
  const saved = await readStore<Partial<NavByRol> | null>("roles_nav", null);
  const d = defaults();
  const out = {} as NavByRol;
  for (const r of ROLES_LIST) {
    const nav = saved && Array.isArray(saved[r]) ? (saved[r] as string[]) : d[r];
    out[r] = blindar(r, nav);
  }
  return out;
}

export async function setRolNav(rol: Rol, nav: string[]): Promise<NavByRol> {
  const cur = await getRolesNav();
  cur[rol] = blindar(rol, nav);
  await writeStore("roles_nav", cur);
  return cur;
}

// --- Permiso EFECTIVO de un usuario (respeta el nav propio, si lo tiene) ---
// Es lo que deben usar los guards de las páginas: el sidebar (layout) ya usa este
// mismo nav, así que "lo que ve" y "a dónde puede entrar" quedan siempre alineados.
interface SesionNav { rol: Rol; nav?: string[] }

/** Nav efectivo del usuario: su nav propio si lo tiene; si no, el del rol. Admin ve todo. */
export async function navDeSesion(s: SesionNav): Promise<string[]> {
  if (s.rol === "admin") return blindar("admin", []);
  if (s.nav) return blindar(s.rol, s.nav);
  return (await getRolesNav())[s.rol] ?? [];
}
export async function sesionPuedeVer(s: SesionNav, href: string): Promise<boolean> {
  return puedeVerNav(await navDeSesion(s), href);
}
export async function homeDeSesion(s: SesionNav): Promise<string> {
  return homeDeNav(await navDeSesion(s));
}
