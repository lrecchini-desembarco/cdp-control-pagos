// Definición de los tours guiados (data pura, sin driver.js). El componente
// TourGuiado los ejecuta. Hay un tour GENERAL (orientación del tablero) y tours
// por PANTALLA (los complejos, ej. Bancos), que se ofrecen cuando estás en esa ruta.

export interface PasoTour {
  element?: string; // selector CSS del ancla (data-tour=...); sin element = modal centrado
  popover: { title: string; description: string; side?: "top" | "right" | "bottom" | "left" };
}

export const TOUR_GENERAL: PasoTour[] = [
  { popover: { title: "👋 Bienvenido a CDP · Control", description: "Te muestro en 30 segundos dónde está cada cosa. Podés cerrarlo cuando quieras y volver a verlo con el botón «¿Cómo funciona?»." } },
  { element: '[data-tour="nav"]', popover: { title: "🧭 Todas las herramientas", description: "Acá están, agrupadas por tema: Alertas, Ventas, Facturación, Bancos, Costos, Clientes y más. <b>Pasá el mouse por cada una</b> y te dice qué hace.", side: "right" } },
  { element: '[data-tour="fresh"]', popover: { title: "🟢 De dónde sale el dato", description: "El punto <b>verde</b> = dato en vivo (tiempo real). El <b>gris</b> = se carga a mano.", side: "right" } },
  { element: '[data-tour="privacy"]', popover: { title: "🔒 Ocultar los montos", description: "Este ojo tapa toda la plata de la pantalla — ideal si estás mostrando el tablero.", side: "bottom" } },
  { element: '[data-tour="ayuda"]', popover: { title: "❓ ¿Dudas más adelante?", description: "Volvé a este botón cuando quieras. En pantallas complejas (como Bancos) también te ofrece un recorrido específico de esa pantalla.", side: "bottom" } },
];

// Tours por pantalla. Clave = primera parte de la ruta (ej. "/bancos").
export const TOURS_PANTALLA: Record<string, { nombre: string; pasos: PasoTour[] }> = {
  "/bancos": {
    nombre: "Bancos",
    pasos: [
      { popover: { title: "🏦 Cómo usar Bancos", description: "Todos tus extractos en un lugar. Te muestro el circuito completo en 6 pasos." } },
      { element: '[data-tour="bancos-subir"]', popover: { title: "1 · Subí los extractos", description: "Tocá <b>«Subir carpeta»</b> y elegí la carpeta con los extractos (CSV, Excel o PDF de cada banco). Detecta el banco solo y consolida todo. Después tocás <b>Guardar</b>.", side: "bottom" } },
      { element: '[data-tour="bancos-filtros"]', popover: { title: "2 · Filtrá", description: "Acotá por <b>mes</b> y por <b>banco</b>. Todo el resumen de abajo se recalcula.", side: "bottom" } },
      { element: '[data-tour="bancos-tabs"]', popover: { title: "3 · Mirá el detalle", description: "Ingresos, egresos y neto por <b>banco</b>, <b>local</b>, <b>mes</b> y <b>categoría</b> (impuestos, gastos bancarios, acreditaciones de tarjeta…).", side: "bottom" } },
      { element: '[data-tour="bancos-tab-cuit"]', popover: { title: "4 · Quién te pagó / a quién pagaste", description: "En <b>«Ingresos × CUIT»</b> y <b>«Egresos × CUIT»</b> ves las contrapartes por CUIT. Adentro tenés <b>«Cargar clientes»</b> y <b>«Cargar proveedores»</b> (exportás de Tango y subís) para que muestre el nombre.", side: "bottom" } },
      { element: '[data-tour="bancos-como-cargar"]', popover: { title: "5 · ¿Dudas al cargar?", description: "Este botón abre la guía de carga paso a paso, cuando la necesites.", side: "bottom" } },
    ],
  },
};
