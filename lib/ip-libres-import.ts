// Importación del CSV que genera el script de escaneo de sistemas. Puro (recibe
// filas ya leídas por filasDeArchivo, de lib/bancos.ts) para poder previsualizar
// en el cliente antes de mandar nada al servidor.

const norm = (s: unknown) =>
  String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

const txt = (s: unknown) => String(s ?? "").trim();

// IPv4 básica: 4 octetos 0-255. Alcanza para una LAN; no hace falta más.
export const esIpValida = (s: string): boolean => {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s.trim());
  return Boolean(m) && m!.slice(1).every((o) => Number(o) <= 255);
};

export interface FilaIp {
  ip: string;
  red?: string;
}

export interface FilaImportIp extends FilaIp {
  fila: number;
  valida: boolean;
  motivo?: string; // por qué no es válida
}

// Nombres de columna aceptados. Si el script no manda encabezado, se detecta
// solo (ver parsearIps): cualquier fila cuya primera celda sea una IP se toma
// como dato desde ahí, sin exigir headers.
const ALIAS_IP = ["ip", "direccion", "direccion ip", "ip address", "address", "host"];
const ALIAS_RED = ["red", "vlan", "subred", "network", "rango"];

function mapearColumnas(encabezado: string[]) {
  const celdas = encabezado.map(norm);
  const buscar = (alias: string[]) => celdas.findIndex((c) => alias.includes(c));
  return { ip: buscar(ALIAS_IP), red: buscar(ALIAS_RED) };
}

/** ¿Esta fila parece el encabezado (no una IP)? Se busca en las primeras filas. */
function buscarEncabezado(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    const fila = rows[i] ?? [];
    if (esIpValida(txt(fila[0]))) return -1; // ya es dato, no hay encabezado
    if (mapearColumnas(fila).ip >= 0) return i;
  }
  return -1;
}

export interface ResultadoParseoIp {
  filas: FilaImportIp[];
  fatal?: string;
}

/** Filas crudas del CSV/Excel -> filas listas para importar (o marcadas con error). */
export function parsearIps(rows: string[][]): ResultadoParseoIp {
  if (rows.length === 0) return { filas: [], fatal: "El archivo está vacío." };

  const iCab = buscarEncabezado(rows);
  const col = iCab >= 0 ? mapearColumnas(rows[iCab]) : { ip: 0, red: 1 };
  const desde = iCab >= 0 ? iCab + 1 : 0;

  const vistas = new Set<string>();
  const filas: FilaImportIp[] = [];
  for (let i = desde; i < rows.length; i++) {
    const cruda = rows[i] ?? [];
    const ip = txt(cruda[col.ip]);
    const red = col.red >= 0 ? txt(cruda[col.red]) : "";
    if (!ip && !red) continue; // fila vacía de relleno

    const base = { fila: i - desde + 1, ip, ...(red ? { red } : {}) };
    if (!esIpValida(ip)) {
      filas.push({ ...base, valida: false, motivo: ip ? "No parece una IP válida." : "Fila sin IP." });
      continue;
    }
    if (vistas.has(ip)) {
      filas.push({ ...base, valida: false, motivo: "Repetida en el archivo." });
      continue;
    }
    vistas.add(ip);
    filas.push({ ...base, valida: true });
  }

  if (filas.length === 0) return { filas, fatal: "No encontré ninguna IP en el archivo." };
  return { filas };
}
