// Config del cuadro "Apertura de locales" (la cartelera de la TV). Colores fieles
// al JPG original: Mr. Tasty amarillo, Desembarco naranja, Mr Tasty+Mila&Go rojo.

export interface MarcaAp {
  id: string;
  label: string;   // nombre completo
  corto: string;   // para la columna MARCA / totales
  color: string;   // color de acento
  filaBg: string;  // fondo de la celda SUCURSAL
}

export const MARCAS_AP: MarcaAp[] = [
  { id: "tasty", label: "Mr. Tasty", corto: "Mr. Tasty", color: "#E0A024", filaBg: "#F7DFA0" },
  { id: "tasty-mila", label: "Mr. Tasty + Mila & Go", corto: "Tasty + Mila", color: "#D64541", filaBg: "#EFA6A2" },
  { id: "desembarco", label: "El Desembarco", corto: "Desembarco", color: "#E8631F", filaBg: "#F6C39B" },
  { id: "mila", label: "Mila & Go", corto: "Mila & Go", color: "#C81D25", filaBg: "#EFA6A2" },
];

export const marcaAp = (id: string): MarcaAp => MARCAS_AP.find((m) => m.id === id) ?? MARCAS_AP[0];

// Estados de las columnas L (Local) y F (Firmado).
export interface EstadoLF {
  id: string;
  label: string;
  icon: string;
  color: string;
}

export const ESTADOS_LF: EstadoLF[] = [
  { id: "si", label: "Sí", icon: "✓", color: "#2FA84F" },
  { id: "no", label: "No", icon: "✗", color: "#D64541" },
  { id: "reservado", label: "Reservado", icon: "!", color: "#E0A024" },
];

export const lf = (id: string): EstadoLF => ESTADOS_LF.find((e) => e.id === id) ?? ESTADOS_LF[1];
