// Clasificación LOCAL PROPIO vs FRANQUICIA para el análisis de pedidos.
// Tango/Raven no traen este dato -> se define acá (config). Se matchea por NOMBRE
// normalizado (saca acentos, prefijo "mrt " y símbolos), así entra igual "Morón",
// "Moron" o "Mrt Pilar".
//
// Lista OFICIAL de locales PROPIOS (18), del maestro "Terminales locales propios +
// franquicias (Interno)" — hojas Desembarco (16) + Tasty (2). El resto = franquicia.
// Los de Tasty conservan el prefijo "Mrt" (así no se confunden con los de Desembarco).

export const PROPIOS: string[] = [
  // El Desembarco (16)
  "Boedo",
  "Caseros",
  "Devoto",
  "Hurlingham",
  "Microcentro",
  "Morón",
  "Nordelta",
  "Núñez",
  "Olivos",
  "Pacheco",
  "Pacífico",
  "Quilmes",
  "Ramos Mejía",
  "Recoleta",
  "San Telmo",
  "Villa Urquiza",
  // Mr Tasty (2)
  "Mrt Caballito",
  "Mrt Florida",
];

// OJO: acá NO sacamos el prefijo "mrt " (a diferencia del cruce). Así "Boedo"
// (Desembarco, propio) NO se confunde con "Mrt Boedo" (Mr Tasty, otra marca).
const norm = (s: string) =>
  (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

const SET_PROPIOS = new Set(PROPIOS.map(norm));

export const esPropio = (nombreSucursal: string): boolean => SET_PROPIOS.has(norm(nombreSucursal));
