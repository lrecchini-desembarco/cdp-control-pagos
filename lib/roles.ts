// Roles y qué ve cada uno. Es config pura (sin fs), así la puede usar el
// middleware (edge) y también el server.

export type Rol = "admin" | "operaciones" | "local" | "comparacion";

export interface RolInfo {
  label: string;
  nav: string[];          // rutas que ve en el menú (la primera es su "home")
  gestionaUsuarios: boolean;
}

export const ROLES: Record<Rol, RolInfo> = {
  admin: {
    label: "Administrador",
    nav: ["/", "/alertas", "/cruce", "/pedidos", "/ventas", "/precios", "/remitos", "/compras", "/raven", "/mapeos", "/catalogo", "/resenas", "/clientes", "/cupones", "/usuarios", "/estado", "/firmas", "/guia"],
    gestionaUsuarios: true,
  },
  operaciones: {
    label: "Operaciones",
    nav: ["/", "/alertas", "/cruce", "/pedidos", "/ventas", "/precios", "/remitos", "/compras", "/raven", "/mapeos", "/catalogo", "/resenas", "/clientes", "/cupones", "/firmas", "/guia"],
    gestionaUsuarios: false,
  },
  local: {
    label: "Local",
    nav: ["/resenas", "/cupones", "/firmas", "/guia"],
    gestionaUsuarios: false,
  },
  comparacion: {
    label: "Comparación",
    // Solo la parte de comparación CDP vs ventas (y lo nuevo). Home = Cruce.
    nav: ["/cruce", "/pedidos", "/remitos", "/compras", "/guia"],
    gestionaUsuarios: false,
  },
};

export const ROLES_LIST: Rol[] = ["admin", "operaciones", "local", "comparacion"];

export const esRol = (v: unknown): v is Rol =>
  v === "admin" || v === "operaciones" || v === "local" || v === "comparacion";

// Catálogo maestro de items del menú (href + label + ícono). El QUÉ VE cada rol
// se define eligiendo de acá (editable desde /usuarios, persistido en el store).
export interface NavItem {
  href: string;
  label: string;
  icon: string;
  beta?: boolean; // true = en construcción (chip "beta"); si no, productivo (punto verde)
}
// Los `beta: true` dependen de datos externos que aún no están (Raven token / recetas
// reales / vista de Sistemas). El resto es productivo.
export const NAV_CATALOG: NavItem[] = [
  { href: "/", label: "Resumen", icon: "◰" },
  { href: "/alertas", label: "Alertas", icon: "!" },
  { href: "/cruce", label: "Cruce CDP vs ventas", icon: "⇄", beta: true },
  { href: "/pedidos", label: "CDP vs Ventas (local)", icon: "⇊" },
  { href: "/ventas", label: "Ventas por turno", icon: "▦" },
  { href: "/precios", label: "Precios", icon: "$" },
  { href: "/remitos", label: "Remitos vs Ventas", icon: "⇉" },
  { href: "/compras", label: "Compras vs Ventas", icon: "⇲" },
  { href: "/raven", label: "Consultar Raven", icon: "↧", beta: true },
  { href: "/mapeos", label: "Mapeos", icon: "⊞" },
  { href: "/catalogo", label: "Control de catálogo", icon: "▤", beta: true },
  { href: "/resenas", label: "Reseñas", icon: "★" },
  { href: "/clientes", label: "Clientes", icon: "☺" },
  { href: "/cupones", label: "Validar cupón", icon: "◈" },
  { href: "/usuarios", label: "Usuarios", icon: "◑" },
  { href: "/estado", label: "Sistema · Endpoints", icon: "⚙" },
  { href: "/firmas", label: "Firmas", icon: "✎" },
  { href: "/guia", label: "¿Qué puedo hacer?", icon: "?" },
];

// /guia y /usuarios (para admin) son "fijas": nunca se pueden sacar (evita autobloqueo).
export const NAV_SIEMPRE = ["/guia"];

/** /guia es accesible para todos; el resto según el rol (defaults de ROLES). */
export function puedeVer(rol: Rol, href: string): boolean {
  if (href === "/guia") return true;
  return ROLES[rol].nav.includes(href);
}
export const homeDe = (rol: Rol) => ROLES[rol].nav[0];

// Versiones "config-aware": operan sobre un array de nav (el del store, editable).
export const puedeVerNav = (nav: string[], href: string): boolean => href === "/guia" || nav.includes(href);
export const homeDeNav = (nav: string[]): string => nav.find((h) => h !== "/guia") ?? nav[0] ?? "/guia";
