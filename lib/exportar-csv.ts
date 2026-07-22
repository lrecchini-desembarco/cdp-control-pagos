// Genera y descarga un CSV que se abre BIEN al doble-clic en Excel y Google Sheets
// en configuración regional español (Argentina):
//  - separador ";" (Excel es-AR usa punto y coma como separador de lista)
//  - números con coma decimal (2892,5) y sin separador de miles
//  - BOM UTF-8 para que no se rompan los acentos
// Uso client-side, sin backend.

const SEP = ";";

function celda(v: string | number | null | undefined): string {
  if (typeof v === "number") {
    return Number.isFinite(v) ? v.toLocaleString("es-AR", { useGrouping: false, maximumFractionDigits: 2 }) : "";
  }
  const s = v == null ? "" : String(v);
  // Entrecomilla si tiene el separador, comillas o saltos de línea.
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function descargarCSV(nombreArchivo: string, columnas: string[], filas: (string | number | null)[][]): void {
  const lineas = [columnas, ...filas].map((row) => row.map(celda).join(SEP));
  const csv = "﻿" + lineas.join("\r\n"); // BOM + CRLF (compat. Excel/Sheets)
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreArchivo.endsWith(".csv") ? nombreArchivo : `${nombreArchivo}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// Genera y descarga un .xlsx real (Excel) con SheetJS. Se carga on-demand para no
// pesar el bundle. Mismo formato de entrada que descargarCSV (columnas + filas).
export async function descargarExcel(
  nombreArchivo: string,
  columnas: string[],
  filas: (string | number | null)[][],
  hoja = "Datos",
): Promise<void> {
  const XLSX = await import("xlsx");
  const aoa: (string | number)[][] = [columnas, ...filas.map((r) => r.map((c) => (c == null ? "" : c)))];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  // Ancho de columnas según el contenido más largo (tope 40).
  ws["!cols"] = columnas.map((_, i) => ({
    wch: Math.min(40, Math.max(10, ...aoa.map((r) => String(r[i] ?? "").length + 2))),
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, hoja.slice(0, 31));
  // Escribimos a bytes y descargamos con Blob. NO usamos XLSX.writeFile: en el bundle
  // del navegador toma el path de Node (fs) y baja un archivo corrupto ("Excel encontró
  // un problema"). Con XLSX.write(type:"array") + Blob el .xlsx queda válido.
  const bytes = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreArchivo.endsWith(".xlsx") ? nombreArchivo : `${nombreArchivo}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
