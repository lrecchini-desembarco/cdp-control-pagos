import { readStore, writeStore } from "./store";
import { ROLES, ROLES_LIST, NAV_CATALOG, type Rol } from "./roles";

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
  set.add("/guia");
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
