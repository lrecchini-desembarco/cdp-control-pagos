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
  "/facturacion": {
    nombre: "Facturación",
    pasos: [
      { popover: { title: "🧾 Cómo leer Facturación", description: "Lo que <b>facturaste de verdad</b> (IMPORTE_NETO de Tango, renglón por renglón). Te muestro las 4 zonas." } },
      { element: '[data-tour="fact-periodo"]', popover: { title: "1 · Elegí el período", description: "Cambiá el rango (hoy, semana, mes…). Todo lo de abajo se recalcula para ese período.", side: "bottom" } },
      { element: '[data-tour="fact-kpis"]', popover: { title: "2 · Los números grandes", description: "Facturación total, ticket promedio y comparación. Los montos en <b>«mil M»</b> — pasá el mouse por la card para ver la cifra completa.", side: "bottom" } },
      { element: '[data-tour="fact-tabs"]', popover: { title: "3 · Abrí el detalle", description: "Desglosá por <b>marca</b>, por <b>local</b>, por <b>tendencia</b> en el tiempo y por <b>receta</b> (qué se facturó sin costo/receta cargada).", side: "bottom" } },
    ],
  },
  "/cobros": {
    nombre: "Cobros",
    pasos: [
      { popover: { title: "💳 Cómo leer Cobros", description: "Cuánta plata entró y por qué medio de pago, de los cierres de caja de Tango. En vivo." } },
      { element: '[data-tour="cobros-periodo"]', popover: { title: "1 · Elegí el período", description: "Últimos 7, 15, 30 o 60 días. Todo se recalcula.", side: "bottom" } },
      { element: '[data-tour="cobros-kpis"]', popover: { title: "2 · Los números grandes", description: "Total cobrado, cuántos medios distintos, cuántos locales y qué % fue en efectivo.", side: "bottom" } },
      { element: '[data-tour="cobros-familias"]', popover: { title: "3 · Cómo te pagan", description: "El reparto por tipo: efectivo, tarjetas, Mercado Pago/QR, PedidosYa, Rappi. De un vistazo ves de dónde viene la plata.", side: "top" } },
      { element: '[data-tour="cobros-medios"]', popover: { title: "4 · Detalle por medio", description: "Cada medio de pago con su importe y su % — para el detalle fino.", side: "top" } },
      { element: '[data-tour="cobros-local"]', popover: { title: "5 · Por local", description: "Cuánto cobró cada restaurante, ordenado de mayor a menor. Buscá tu local en la lista.", side: "top" } },
    ],
  },
  "/horas": {
    nombre: "Ticket y horarios",
    pasos: [
      { popover: { title: "🕒 Cómo leer Ticket y horarios", description: "Cuánto vale cada ticket y a qué hora se mueve la venta. Sale de los comprobantes de Tango." } },
      { element: '[data-tour="horas-periodo"]', popover: { title: "1 · Elegí el período", description: "Últimos 7, 15, 30 o 60 días.", side: "bottom" } },
      { element: '[data-tour="horas-kpis"]', popover: { title: "2 · Los números grandes", description: "Ticket promedio, cantidad de tickets, facturación y la hora pico (la de más facturación).", side: "bottom" } },
      { element: '[data-tour="horas-ritmo"]', popover: { title: "3 · Ritmo por hora", description: "Cuánto se factura en cada hora del día. La barra más alta y marcada es la hora pico.", side: "top" } },
      { element: '[data-tour="horas-ticket"]', popover: { title: "4 · Ticket promedio por hora", description: "En qué horas la gente gasta más por ticket (ej. la noche suele tener el ticket más alto).", side: "top" } },
      { element: '[data-tour="horas-local"]', popover: { title: "5 · Por local", description: "Ticket promedio, tickets y facturación de cada restaurante. Comparás locales de un vistazo.", side: "top" } },
    ],
  },
  "/mozos": {
    nombre: "Mozos",
    pasos: [
      { popover: { title: "🧑‍🍳 Cómo leer Mozos", description: "Ventas y ticket promedio por mozo, de las comandas de Tango. Ojo: algunos locales cargan el mozo genérico ('CAJA'), así que conviene mirarlo por local." } },
      { element: '[data-tour="mozos-periodo"]', popover: { title: "1 · Elegí el período", description: "Últimos 7, 15, 30 o 60 días.", side: "bottom" } },
      { element: '[data-tour="mozos-kpis"]', popover: { title: "2 · Los números grandes", description: "Ticket promedio, cuántos mozos distintos, en cuántos locales y la facturación del período.", side: "bottom" } },
      { element: '[data-tour="mozos-ranking"]', popover: { title: "3 · Ranking de mozos", description: "Los mozos ordenados por ventas, con su ticket promedio y en cuántos locales aparecen.", side: "top" } },
      { element: '[data-tour="mozos-detalle"]', popover: { title: "4 · Detalle por local", description: "Cada combinación local + mozo. Usá el buscador para encontrar un mozo o un restaurante puntual.", side: "top" } },
    ],
  },
  "/estimacion": {
    nombre: "Estimación de insumos",
    pasos: [
      { popover: { title: "≈ Cómo funciona la estimación", description: "Pronostica cuánto vas a vender por día de semana (los mismos días recientes pesan más) y lo traduce a insumos con las recetas. Para planificar compras." } },
      { element: '[data-tour="est-horizonte"]', popover: { title: "1 · Horizonte", description: "Para cuántos días adelante querés estimar (7, 14 o 30).", side: "bottom" } },
      { element: '[data-tour="est-local"]', popover: { title: "2 · Local", description: "Todos los locales juntos, o uno puntual.", side: "bottom" } },
      { element: '[data-tour="est-kpis"]', popover: { title: "3 · El resumen", description: "Costo estimado de insumos, unidades pronosticadas y la cobertura de receta (qué % de las ventas se pudo traducir).", side: "bottom" } },
      { element: '[data-tour="est-insumos"]', popover: { title: "4 · Qué comprar", description: "Cada insumo con la cantidad estimada, los bultos aproximados y el costo. Ordenado por plata.", side: "top" } },
    ],
  },
  "/anulados": {
    nombre: "Anulados",
    pasos: [
      { popover: { title: "⊘ Cómo leer Anulados", description: "Control anti-fuga: la plata que se anula, devuelve o invita (comp). El monto/producto/hora/local son exactos; el 'quién' Tango lo carga parcial." } },
      { element: '[data-tour="anul-periodo"]', popover: { title: "1 · Elegí el período", description: "Últimos 7, 15, 30 o 60 días.", side: "bottom" } },
      { element: '[data-tour="anul-kpis"]', popover: { title: "2 · Cuánto se fue", description: "Total anulado/devuelto y el desglose: anulaciones, devoluciones e invitaciones (comps).", side: "bottom" } },
      { element: '[data-tour="anul-producto"]', popover: { title: "3 · Sobre qué productos", description: "Qué productos se anulan/devuelven más — dónde se concentra la fuga.", side: "top" } },
      { element: '[data-tour="anul-local"]', popover: { title: "4 · En qué local", description: "El ranking por restaurante.", side: "top" } },
      { element: '[data-tour="anul-quien"]', popover: { title: "5 · Quién", description: "Responsable (parcial) y —más útil— quién autoriza las anulaciones. Ahí saltan los patrones sospechosos.", side: "top" } },
    ],
  },
  "/franquicias": {
    nombre: "Cuentas Corrientes",
    pasos: [
      { popover: { title: "◨ Cómo usar Cuentas Corrientes", description: "Lo que cada franquiciado le debe al grupo. Subís el estado de cuenta y la app <b>recalcula todo</b> (mora, punitorios, neto) como vos quieras. Te muestro las zonas." } },
      { element: '[data-tour="fr-kpis"]', popover: { title: "1 · Los números grandes", description: "<b>Neto a cobrar</b> total, el <b>cobrable real</b> (sin incobrables), lo <b>vencido</b> y lo que está <b>por vencer</b>.", side: "bottom" } },
      { element: '[data-tour="fr-control"]', popover: { title: "2 · Controlá cómo se suma", description: "Acá está lo clave: cambiás la <b>fecha de corte</b>, la <b>tasa</b>, sobre qué se calcula el punitorio y si contás los incobrables — y <b>todo recalcula al instante</b>. Tocá «¿cómo se calcula?» para ver la fórmula.", side: "bottom" } },
      { element: '[data-tour="fr-aging"]', popover: { title: "3 · Antigüedad de la deuda", description: "El aging: cuánto está por vencer, y cuánto lleva 30, 60, 90+ días de mora. De un vistazo ves dónde está el riesgo.", side: "top" } },
      { element: '[data-tour="fr-tabs"]', popover: { title: "4 · Quién debe", description: "Por <b>franquiciado</b>, empresa, local, concepto o estado de gestión. Tocá una fila para ver sus facturas y exportar.", side: "top" } },
    ],
  },
  "/cruce": {
    nombre: "el Cruce",
    pasos: [
      { popover: { title: "🔀 Cómo usar el Cruce", description: "Compara lo que cada local <b>pidió al CDP</b> contra lo que <b>vendió</b> (traducido a insumo). Sirve para cazar sobre-pedidos y faltantes." } },
      { element: '[data-tour="cruce-filtros"]', popover: { title: "1 · Acotá qué mirás", description: "Elegí el rango de fechas, el local y el insumo. El cruce se arma sobre eso.", side: "bottom" } },
      { element: '[data-tour="cruce-kpis"]', popover: { title: "2 · El resumen", description: "Pedido vs venta equivalente, el <b>desvío neto</b> y cuántas líneas quedan <b>fuera de tolerancia</b> (las que hay que revisar).", side: "bottom" } },
      { element: '[data-tour="cruce-tabla"]', popover: { title: "3 · Línea por línea", description: "El detalle de cada combinación local × insumo, ordenable, para ver dónde se pidió de más o de menos.", side: "bottom" } },
    ],
  },
};
