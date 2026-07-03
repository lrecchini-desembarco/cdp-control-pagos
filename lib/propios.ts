// Clasificación LOCAL PROPIO vs FRANQUICIA para el análisis de pedidos.
// Tango/Raven no traen este dato -> se define acá (config). Se matchea por NOMBRE
// normalizado (saca acentos, prefijo "mrt " y símbolos), así entra igual "Morón",
// "Moron" o "Mrt Pilar".
//
// Lista OFICIAL de locales PROPIOS (16), del maestro de locales de operaciones
// (planilla "Locales", jul-2026). El resto son franquicias.

export const PROPIOS: string[] = [
  "Villa Crespo",
  "Boedo",
  "Villa Urquiza",
  "Hurlingham",
  "San Telmo",
  "Morón",
  "Pacífico",
  "Núñez",
  "Ramos Mejía",
  "Nordelta",
  "Olivos",
  "Devoto",
  "Pacheco",
  "Quilmes",
  "Recoleta",
  "Microcentro",
];

const norm = (s: string) =>
  (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/^mrt\s+/, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

const SET_PROPIOS = new Set(PROPIOS.map(norm));

export const esPropio = (nombreSucursal: string): boolean => SET_PROPIOS.has(norm(nombreSucursal));
