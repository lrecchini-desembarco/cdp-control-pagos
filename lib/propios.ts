// Clasificación LOCAL PROPIO vs FRANQUICIA para el análisis de pedidos.
// Tango/Raven no traen este dato -> se define acá (config). Se matchea por NOMBRE
// normalizado (saca acentos, prefijo "mrt " y símbolos), así entra igual "Morón",
// "Moron" o "Mrt Pilar".
//
// ⚠️ Lista SEMILLA (a confirmar/completar con operaciones): son los locales que
// veníamos trackeando. Faltan sumar el resto de los ~18-19 propios.

export const PROPIOS: string[] = [
  "Flores",
  "Colegiales",
  "Morón",
  "P. Patricios",
  "Villa Urquiza",
  "Ramos Mejía",
  "Castelar",
  "Pilar",
  "Caballito",
  "Nordelta",
  "Núñez",
];

const norm = (s: string) =>
  (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/^mrt\s+/, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

const SET_PROPIOS = new Set(PROPIOS.map(norm));

export const esPropio = (nombreSucursal: string): boolean => SET_PROPIOS.has(norm(nombreSucursal));
