// Credenciales: quién entra y cómo se clasifican. Config pura (usable en cliente).
//
// A diferencia del resto de la app, acá el permiso NO es por rol: es una lista
// blanca de emails. Aunque alguien sea admin, si no está en la lista no ve la
// pantalla ni la API. Para sumar o sacar a alguien se toca ESTA lista y se
// vuelve a deployar (a propósito: que quede en el repo, revisable en el diff).

export const EMAILS_CREDENCIALES = [
  "sistemas02@eldesembarco.com",
  "lrecchini@eldesembarco.com",
  "polejavetzky@eldesembarco.com",
];

export const puedeVerCredenciales = (email?: string | null): boolean =>
  Boolean(email) && EMAILS_CREDENCIALES.includes(String(email).trim().toLowerCase());

export const CATEGORIAS_CRED = [
  "Sistemas",
  "Tango",
  "Bancos y pagos",
  "Proveedores",
  "Google / Workspace",
  "Redes y servidores",
  "Apps internas",
  "Otros",
];

/** Lo que ve el cliente: la contraseña no viaja hasta que se pide "Ver". */
export interface CredencialPublica {
  id: string;
  sistema: string;
  categoria: string;
  usuario: string;
  url?: string;
  nota?: string;
  actualizado: string;
  actualizadoPor?: string;
}
