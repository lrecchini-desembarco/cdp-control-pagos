// Modo oscuro: por ahora, solo para sistemas02@eldesembarco.com (a pedido de
// sistemas). El resto de las cuentas ni recibe el script que lo activa (ver
// app/layout.tsx), así que no hay forma de que les aparezca por accidente.

export const EMAIL_MODO_OSCURO = "sistemas02@eldesembarco.com";

export const puedeElegirTema = (email?: string | null): boolean =>
  Boolean(email) && String(email).trim().toLowerCase() === EMAIL_MODO_OSCURO;
