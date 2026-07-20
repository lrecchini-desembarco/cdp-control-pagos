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
    nav: ["/", "/alertas", "/cruce", "/pedidos", "/ventas", "/precios", "/remitos", "/compras", "/actividad", "/facturacion", "/mercadopago", "/bancos", "/franquicias", "/insumos", "/recetas", "/listas", "/apps", "/promos", "/rentabilidad", "/mapeos", "/resenas", "/clientes", "/cupones", "/usuarios", "/inventario", "/apertura", "/organigrama", "/estado", "/qa", "/firmas", "/guia"],
    gestionaUsuarios: true,
  },
  operaciones: {
    label: "Operaciones",
    nav: ["/", "/alertas", "/cruce", "/pedidos", "/ventas", "/precios", "/remitos", "/compras", "/actividad", "/facturacion", "/mercadopago", "/bancos", "/franquicias", "/cobros", "/horas", "/mozos", "/anulados", "/insumos", "/estimacion", "/recetas", "/listas", "/apps", "/promos", "/rentabilidad", "/mapeos", "/resenas", "/clientes", "/cupones", "/apertura", "/organigrama", "/contactos", "/qa", "/firmas", "/guia"],
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
    nav: ["/ventas", "/precios", "/compras", "/facturacion", "/actividad", "/organigrama", "/guia"],
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
// Frescura del dato de cada pantalla (el "tag" del menú):
//   vivo    -> tiempo real, se actualiza solo (Tango / Raven / sistema).
//   carga   -> dato real pero que el equipo carga/edita (KV / CSV); no es feed automático.
//   revisar -> frescura a confirmar (foto/snapshot o dato que puede estar viejo).
export type Fresh = "vivo" | "carga" | "revisar";
export const FRESH_META: Record<Fresh, { label: string; desc: string }> = {
  vivo:    { label: "En vivo",  desc: "Datos en tiempo real; se actualizan solos (Tango / Raven / sistema)." },
  carga:   { label: "Se carga", desc: "Datos reales que el equipo carga o edita; se actualizan cuando los tocás." },
  revisar: { label: "Revisar",  desc: "Frescura a confirmar: es una foto/snapshot o un dato que puede estar viejo." },
};

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  beta?: boolean;    // true = en construcción (chip "beta")
  section?: string;  // encabezado de sección en el menú (ej. "Costos")
  fresh?: Fresh;     // tag de frescura del dato (default: carga)
  desc?: string;     // qué podés hacer ahí (para el cartel de bienvenida y la guía)
}
// Los `beta: true` dependen de datos externos que aún no están (Raven token / recetas
// reales / vista de Sistemas). El resto es productivo.
// Ordenado por secciones (contiguas). El sidebar dibuja el encabezado de cada
// sección al cambiar. Resumen y Alertas van arriba sin sección (son el "home").
export const NAV_CATALOG: NavItem[] = [
  { href: "/", label: "Resumen", icon: "◰", fresh: "vivo", desc: "El estado general de la operación de un vistazo." },
  { href: "/alertas", label: "Alertas", icon: "!", fresh: "vivo", desc: "Qué mirar primero: quiebres, sobre-pedidos y puntos ciegos." },
  // CDP vs Ventas — control de abastecimiento
  { href: "/cruce", label: "Cruce CDP vs ventas", icon: "⇄", beta: true, section: "CDP vs Ventas", fresh: "vivo", desc: "Cruce fino: pedido vs venta traducida a insumo, por sucursal y día." },
  { href: "/pedidos", label: "CDP vs Ventas (local)", icon: "⇊", section: "CDP vs Ventas", fresh: "vivo", desc: "Local por local: lo que pidió al CDP contra lo que vendió." },
  // Ventas y compras
  { href: "/ventas", label: "Ventas por turno", icon: "▦", section: "Ventas y compras", fresh: "vivo", desc: "Qué se vendió por artículo y turno (unidades reales de Tango)." },
  { href: "/precios", label: "Precios", icon: "$", section: "Ventas y compras", fresh: "vivo", desc: "Precio vigente por producto y sucursal (Tango)." },
  { href: "/remitos", label: "Remitos vs Ventas", icon: "⇉", section: "Ventas y compras", fresh: "carga", desc: "Subís el CSV de remitos y lo cruzás contra las ventas." },
  { href: "/compras", label: "Compras vs Ventas", icon: "⇲", section: "Ventas y compras", fresh: "carga", desc: "Subís el CSV de compras y lo cruzás contra las ventas." },
  { href: "/actividad", label: "Actividad de ventas", icon: "◔", section: "Ventas y compras", fresh: "vivo", desc: "Ranking de locales por actividad y productos que se durmieron." },
  { href: "/facturacion", label: "Facturación", icon: "≣", section: "Ventas y compras", fresh: "vivo", desc: "Cuánta plata mueve cada producto, local y marca (estimada, Tango)." },
  { href: "/mercadopago", label: "Cobros · Mercado Pago", icon: "◐", section: "Ventas y compras", fresh: "vivo", desc: "Lo que cobró Mercado Pago, por medio de pago y día; para conciliar." },
  { href: "/bancos", label: "Bancos", icon: "◫", section: "Ventas y compras", fresh: "carga", desc: "Liquidaciones de tarjetas y bancos: bruto, comisiones y neto acreditado (subís el CSV)." },
  { href: "/franquicias", label: "Cuentas Corrientes · Franquicias", icon: "◨", section: "Ventas y compras", fresh: "carga", desc: "Lo que cada franquiciado debe: subís el estado de cuenta y la app recalcula mora, punitorios y neto — con parámetros que controlás vos. Aging y gestión de cobranza." },
  { href: "/cobros", label: "Cobros · Medios de pago", icon: "▚", section: "Ventas y compras", fresh: "vivo", desc: "Cuánto entró por cada medio de pago (efectivo, tarjetas, Mercado Pago/QR, PedidosYa, Rappi), de los cierres de Tango." },
  { href: "/horas", label: "Ticket y horarios", icon: "◷", section: "Ventas y compras", fresh: "vivo", desc: "Ticket promedio y mapa de calor de horas: cuándo y cuánto se vende, con cantidad de tickets (Tango)." },
  { href: "/mozos", label: "Mozos", icon: "☰", section: "Ventas y compras", fresh: "vivo", desc: "Ventas y ticket promedio por mozo (de las comandas de Tango), filtrable por local." },
  { href: "/anulados", label: "Anulados y devoluciones", icon: "⊘", section: "Ventas y compras", fresh: "vivo", desc: "Control anti-fuga: qué se anula/devuelve/invita, cuánto, sobre qué productos, cuándo y quién autoriza (Tango)." },
  // Costos y precios (módulo Costos) — se cargan a mano (Excel), hoy vigentes
  { href: "/insumos", label: "Insumos", icon: "◆", section: "Costos", fresh: "carga", desc: "Maestro de insumos con costo por unidad." },
  { href: "/estimacion", label: "Estimación de insumos", icon: "≈", section: "Costos", fresh: "vivo", desc: "Cuánto de cada insumo vas a necesitar (pronóstico por día de semana × recetas), para planificar compras." },
  { href: "/recetas", label: "Recetas", icon: "❏", section: "Costos", fresh: "carga", desc: "Qué insumos (y cuánto) lleva cada producto." },
  { href: "/listas", label: "Precios y margen", icon: "▤", section: "Costos", fresh: "carga", desc: "Costo de receta, CMV y margen por lista de precios." },
  { href: "/apps", label: "Margen apps", icon: "◧", section: "Costos", fresh: "carga", desc: "Margen por app de delivery, según sus comisiones." },
  { href: "/promos", label: "Promociones", icon: "◎", section: "Costos", fresh: "carga", desc: "Armá promociones y mirá su impacto." },
  { href: "/rentabilidad", label: "Rentabilidad", icon: "◉", section: "Costos", fresh: "carga", desc: "Margen por producto y simulación de promos." },
  // Clientes — reseñas, CRM y cupones
  { href: "/resenas", label: "Reseñas", icon: "★", section: "Clientes", fresh: "revisar", desc: "Reputación de Google y el sistema de cupones por reseña." }, // reputación Google = snapshot (foto)
  { href: "/clientes", label: "Clientes", icon: "☺", section: "Clientes", fresh: "carga", desc: "El CRM que se arma solo con reseñas y cupones." },
  { href: "/cupones", label: "Validar cupón", icon: "◈", section: "Clientes", fresh: "carga", desc: "Validar y canjear un cupón en el local." },
  // Locales
  { href: "/apertura", label: "Apertura de locales", icon: "◱", section: "Locales", fresh: "carga", desc: "Estado de apertura de cada local (para gerencia y la TV)." },
  { href: "/inventario", label: "Inventario", icon: "▧", section: "Locales", fresh: "carga", desc: "Recursos de IT: qué hay, qué falta comprar y aprobaciones." },
  // Empresa — estructura y personas
  { href: "/organigrama", label: "Organigrama", icon: "⧉", section: "Empresa", fresh: "carga", desc: "Quién reporta a quién; ubicás tu casillero." },
  { href: "/contactos", label: "Contactos", icon: "☏", section: "Empresa", fresh: "carga", desc: "Contactos clave para resolver temas urgentes (Tango, sistemas, proveedores, bancos): teléfono, mail y con qué verlo, con botón directo de WhatsApp y email." },
  { href: "/bienvenida", label: "Bienvenida · Nuevo ingreso", icon: "✋", section: "Empresa", fresh: "carga", desc: "Alta de nuevos ingresos y su tarjeta de bienvenida imprimible con los datos de acceso (email y clave)." },
  // Sistema — configuración y salud
  { href: "/mapeos", label: "Mapeos", icon: "⊞", section: "Sistema", fresh: "carga", desc: "Enseñale al sistema las recetas y los códigos de sucursal." },
  { href: "/usuarios", label: "Usuarios", icon: "◑", section: "Sistema", fresh: "carga", desc: "Alta de usuarios y qué puede ver cada uno." },
  { href: "/estado", label: "Salud y endpoints", icon: "⚙", section: "Sistema", fresh: "vivo", desc: "Salud del sistema y de las conexiones, en vivo." },
  { href: "/qa", label: "QA diario", icon: "✓", section: "Sistema", fresh: "vivo", desc: "El bot que audita los datos todos los días (reconciliación, margen, identidad, mapeo, frescura) y avisa si algo se rompe." },
  // Ayuda y herramientas
  { href: "/firmas", label: "Firmas", icon: "✎", section: "Ayuda", fresh: "carga", desc: "Generador de firmas de email para el equipo." },
  { href: "/guia", label: "¿Qué puedo hacer?", icon: "?", section: "Ayuda", fresh: "carga", desc: "La guía completa: qué podés hacer y cómo, paso a paso." },
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
