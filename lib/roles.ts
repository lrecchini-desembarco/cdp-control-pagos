// Roles y qué ve cada uno. Es config pura (sin fs), así la puede usar el
// middleware (edge) y también el server.

export type Rol = "admin" | "operaciones" | "local";

export interface RolInfo {
  label: string;
  nav: string[];          // rutas que ve en el menú (la primera es su "home")
  gestionaUsuarios: boolean;
}

export const ROLES: Record<Rol, RolInfo> = {
  admin: {
    label: "Administrador",
    nav: ["/", "/alertas", "/cruce", "/ventas", "/raven", "/mapeos", "/catalogo", "/resenas", "/usuarios", "/firmas", "/comunicados", "/guia"],
    gestionaUsuarios: true,
  },
  operaciones: {
    label: "Operaciones",
    nav: ["/", "/alertas", "/cruce", "/ventas", "/raven", "/mapeos", "/catalogo", "/resenas", "/firmas", "/comunicados", "/guia"],
    gestionaUsuarios: false,
  },
  local: {
    label: "Local",
    nav: ["/resenas", "/firmas", "/guia"],
    gestionaUsuarios: false,
  },
};

export const ROLES_LIST: Rol[] = ["admin", "operaciones", "local"];

export const esRol = (v: unknown): v is Rol => v === "admin" || v === "operaciones" || v === "local";

/** /guia es accesible para todos; el resto según el rol. */
export function puedeVer(rol: Rol, href: string): boolean {
  if (href === "/guia") return true;
  return ROLES[rol].nav.includes(href);
}

export const homeDe = (rol: Rol) => ROLES[rol].nav[0];
