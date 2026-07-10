// Roles y qué ve cada uno. Es config pura (sin fs), así la puede usar el
// middleware (edge) y también el server.

export type Rol = "admin" | "operaciones" | "local" | "comparacion" | "resenas" | "gerencia" | "apps-gerencia" | "pendiente";

export interface RolInfo {
  label: string;
  nav: string[];          // rutas que ve en el menú (la primera es su "home")
  gestionaUsuarios: boolean;
}

export const ROLES: Record<Rol, RolInfo> = {
  admin: {
    label: "Administrador",
    nav: ["/", "/alertas", "/cruce", "/pedidos", "/ventas", "/precios", "/remitos", "/compras", "/actividad", "/insumos", "/recetas", "/listas", "/apps", "/promos", "/rentabilidad", "/mapeos", "/resenas", "/clientes", "/cupones", "/usuarios", "/inventario", "/apertura", "/organigrama", "/estado", "/firmas", "/guia"],
    gestionaUsuarios: true,
  },
  operaciones: {
    label: "Operaciones",
    nav: ["/", "/alertas", "/cruce", "/pedidos", "/ventas", "/precios", "/remitos", "/compras", "/actividad", "/insumos", "/recetas", "/listas", "/apps", "/promos", "/rentabilidad", "/mapeos", "/resenas", "/clientes", "/cupones", "/apertura", "/organigrama", "/firmas", "/guia"],
    gestionaUsuarios: false,
  },
  local: {
    label: "Local",
    nav: ["/resenas", "/cupones", "/organigrama", "/firmas", "/guia"],
    gestionaUsuarios: false,
  },
  comparacion: {
    label: "Comparación",
    // Solo el comparativo REAL + remitos + compras. El /cruce insumo-nivel (beta,
    // pendiente de receta) se saca para no confundir con el "todo rojo".
    nav: ["/pedidos", "/remitos", "/compras", "/organigrama", "/guia"],
    gestionaUsuarios: false,
  },
  resenas: {
    label: "Reseñas",
    // Solo ve Reseñas + Clientes (el CRM que se arma con las reseñas/cupones).
    nav: ["/resenas", "/clientes", "/organigrama", "/guia"],
    gestionaUsuarios: false,
  },
  gerencia: {
    label: "Gerencia",
    // Gerencia: solo el cuadro de Nuevos locales (Apertura de locales). El admin
    // puede sumarle más pantallas desde Usuarios si hace falta.
    nav: ["/apertura", "/organigrama", "/guia"],
    gestionaUsuarios: false,
  },
  "apps-gerencia": {
    label: "Apps Gerencia",
    // Reportes de gerencia: Ventas por turno, Precios y Compras vs Ventas.
    nav: ["/ventas", "/precios", "/compras", "/organigrama", "/guia"],
    gestionaUsuarios: false,
  },
  pendiente: {
    label: "Sin acceso",
    // Auto-provisionado (entró con Google pero el admin todavía no le asignó rol).
    // Solo ve la ayuda; el admin le cambia el rol desde Usuarios.
    nav: ["/guia"],
    gestionaUsuarios: false,
  },
};

export const ROLES_LIST: Rol[] = ["admin", "operaciones", "local", "comparacion", "resenas", "gerencia", "apps-gerencia", "pendiente"];

export const esRol = (v: unknown): v is Rol =>
  v === "admin" || v === "operaciones" || v === "local" || v === "comparacion" || v === "resenas" || v === "gerencia" || v === "apps-gerencia" || v === "pendiente";

// Catálogo maestro de items del menú (href + label + ícono). El QUÉ VE cada rol
// se define eligiendo de acá (editable desde /usuarios, persistido en el store).
export interface NavItem {
  href: string;
  label: string;
  icon: string;
  beta?: boolean;    // true = en construcción (chip "beta"); si no, productivo (punto verde)
  section?: string;  // encabezado de sección en el menú (ej. "Costos")
}
// Los `beta: true` dependen de datos externos que aún no están (Raven token / recetas
// reales / vista de Sistemas). El resto es productivo.
// Ordenado por secciones (contiguas). El sidebar dibuja el encabezado de cada
// sección al cambiar. Resumen y Alertas van arriba sin sección (son el "home").
export const NAV_CATALOG: NavItem[] = [
  { href: "/", label: "Resumen", icon: "◰" },
  { href: "/alertas", label: "Alertas", icon: "!" },
  // CDP vs Ventas — control de abastecimiento
  { href: "/cruce", label: "Cruce CDP vs ventas", icon: "⇄", beta: true, section: "CDP vs Ventas" },
  { href: "/pedidos", label: "CDP vs Ventas (local)", icon: "⇊", section: "CDP vs Ventas" },
  // Ventas y compras
  { href: "/ventas", label: "Ventas por turno", icon: "▦", section: "Ventas y compras" },
  { href: "/precios", label: "Precios", icon: "$", section: "Ventas y compras" },
  { href: "/remitos", label: "Remitos vs Ventas", icon: "⇉", section: "Ventas y compras" },
  { href: "/compras", label: "Compras vs Ventas", icon: "⇲", section: "Ventas y compras" },
  { href: "/actividad", label: "Actividad de ventas", icon: "◔", section: "Ventas y compras" },
  // Costos y precios (módulo Costos)
  { href: "/insumos", label: "Insumos", icon: "◆", section: "Costos" },
  { href: "/recetas", label: "Recetas", icon: "❏", section: "Costos" },
  { href: "/listas", label: "Precios y margen", icon: "▤", section: "Costos" },
  { href: "/apps", label: "Margen apps", icon: "◧", section: "Costos" },
  { href: "/promos", label: "Promociones", icon: "◎", section: "Costos" },
  { href: "/rentabilidad", label: "Rentabilidad", icon: "◉", section: "Costos" },
  // Clientes — reseñas, CRM y cupones
  { href: "/resenas", label: "Reseñas", icon: "★", section: "Clientes" },
  { href: "/clientes", label: "Clientes", icon: "☺", section: "Clientes" },
  { href: "/cupones", label: "Validar cupón", icon: "◈", section: "Clientes" },
  // Locales
  { href: "/apertura", label: "Apertura de locales", icon: "◱", section: "Locales" },
  { href: "/inventario", label: "Inventario", icon: "▧", section: "Locales" },
  // Empresa — estructura y personas
  { href: "/organigrama", label: "Organigrama", icon: "⧉", section: "Empresa" },
  // Sistema — configuración y salud
  { href: "/mapeos", label: "Mapeos", icon: "⊞", section: "Sistema" },
  { href: "/usuarios", label: "Usuarios", icon: "◑", section: "Sistema" },
  { href: "/estado", label: "Salud y endpoints", icon: "⚙", section: "Sistema" },
  // Ayuda y herramientas
  { href: "/firmas", label: "Firmas", icon: "✎", section: "Ayuda" },
  { href: "/guia", label: "¿Qué puedo hacer?", icon: "?", section: "Ayuda" },
];

// Rutas universales: las ve todo el mundo, no se pueden sacar (evita autobloqueo).
// Solo /guia (ayuda). /organigrama es togglable por rol/usuario desde Usuarios.
export const UNIVERSALES = ["/guia"];
export const NAV_SIEMPRE = UNIVERSALES;

/** Las universales las ve cualquiera; el resto según el rol (defaults de ROLES). */
export function puedeVer(rol: Rol, href: string): boolean {
  if (UNIVERSALES.includes(href)) return true;
  return ROLES[rol].nav.includes(href);
}
export const homeDe = (rol: Rol) => ROLES[rol].nav[0];

// Versiones "config-aware": operan sobre un array de nav (el del store, editable).
export const puedeVerNav = (nav: string[], href: string): boolean => UNIVERSALES.includes(href) || nav.includes(href);
export const homeDeNav = (nav: string[]): string => nav.find((h) => h !== "/guia") ?? nav[0] ?? "/guia";
