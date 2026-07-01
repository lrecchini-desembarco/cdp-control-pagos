// Genera y descarga un CSV (UTF-8 con BOM) que se abre bien en Google Sheets y Excel
// (el BOM evita que se rompan los acentos). Uso client-side, sin backend.

function celda(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function descargarCSV(nombreArchivo: string, columnas: string[], filas: (string | number | null)[][]): void {
  const lineas = [columnas, ...filas].map((row) => row.map(celda).join(","));
  const csv = "﻿" + lineas.join("\r\n"); // BOM + CRLF (compat. Excel/Sheets)
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreArchivo.endsWith(".csv") ? nombreArchivo : `${nombreArchivo}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
