// Parser de PDFs de remitos del CDP + fusión de cargas múltiples SIN duplicar.
// Mismo formato que scripts/parsear-remitos.py (portado a TS para que /remitos
// acepte los PDF directo). El texto del PDF lo extrae el cliente con pdfjs
// (ver RemitosView) y acá se reconstruyen las líneas y se deduplica:
//  - DENTRO de un archivo: las copias ORIGINAL/DUPLICADO/TRIPLICADO del mismo
//    remito (mismo nº + mismos items) se cuentan UNA vez. Una continuación
//    multipágina (mismo nº, items distintos) NO se descarta.
//  - ENTRE cargas (mergeRemitos): un remito ya cargado (mismo nº) se saltea
//    entero; líneas sin nº deduplican por contenido completo.

export interface PdfItem { s: string; x: number; y: number }

export interface Remito {
  fecha: string;       // dd/mm/aaaa (como viene en el PDF/CSV)
  marca: string;
  sucursal: string;
  codigo: string;
  descripcion: string;
  cantidad: number;
  remito: string;      // número de remito (p.ej. 0001-00012345)
}

export interface ParseoPdf {
  remitos: Remito[];
  copias: number;      // bloques ignorados por ser copia exacta (orig/dup/trip)
  sinNro: number;      // líneas cuyo bloque no tenía nº de remito legible
}

// Línea de detalle: código de 6 dígitos + descripción + cantidad al final.
const CODELINE = /^(\d{6})\s+(.+?)\s+(\d+(?:[.,]\d+)?)$/;

// Reconstruye las líneas visuales del PDF: agrupa items por fila (Y), ordena por X.
export function lineasDePdf(pags: PdfItem[][]): string[] {
  const lineas: string[] = [];
  for (const items of pags) {
    const byY = new Map<number, PdfItem[]>();
    for (const i of items) {
      if (!i.s.trim()) continue;
      const k = Math.round(i.y);
      const a = byY.get(k) ?? [];
      a.push(i);
      byY.set(k, a);
    }
    for (const y of Array.from(byY.keys()).sort((a, b) => b - a)) {
      lineas.push(byY.get(y)!.sort((a, b) => a.x - b.x).map((i) => i.s).join(" "));
    }
  }
  return lineas;
}

// Cantidad en formato es-AR del remito: "1.234,5" -> 1234.5 (igual que el script Python).
const cantidadDe = (s: string) => {
  const n = parseFloat(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};

/** Parsea el texto de un PDF de remitos (una o varias entregas por archivo). */
export function parseRemitosPdf(pags: PdfItem[][]): ParseoPdf {
  const texto = lineasDePdf(pags).join("\n");
  const out: Remito[] = [];
  let copias = 0, sinNro = 0;
  // nº ya visto -> firmas de items de sus bloques (para detectar copias exactas)
  const firmasPorNro = new Map<string, Set<string>>();
  for (const b of texto.split(/REMITO\s+R/).slice(1)) {
    const nro = b.match(/N[°º\W]\s*([\d-]{8,})/)?.[1] ?? "";
    const fecha = b.match(/FECHA:\s*(\d{2}\/\d{2}\/\d{4})/)?.[1] ?? "";
    // El destino puede quedar en la misma línea que "DESTINO" o en la siguiente,
    // según cómo pdfjs arme las filas; \s* cruza el salto de línea si hace falta.
    const dest = (b.match(/DESTINO[^\S\n]*:?\s*(.+)/)?.[1] ?? "").trim();
    const sep = dest.match(/^(.*?)\s[–—‒\-�]\s(.*)$/);
    const marca = (sep ? sep[1] : dest).trim();
    const sucursal = (sep ? sep[2] : "").trim();

    const items: Remito[] = [];
    for (const linea of b.split("\n")) {
      const m = linea.trim().match(CODELINE);
      if (!m) continue;
      const cantidad = cantidadDe(m[3]);
      if (!Number.isFinite(cantidad)) continue;
      items.push({ fecha, marca, sucursal, codigo: m[1], descripcion: m[2].trim(), cantidad, remito: nro });
    }
    if (!items.length) continue;

    if (nro) {
      // Copia exacta del mismo remito (ORIGINAL/DUPLICADO/TRIPLICADO en el
      // mismo PDF): mismos items -> se ignora. Items distintos = continuación.
      const firma = items.map((i) => `${i.codigo}|${i.cantidad}`).join(";");
      const previas = firmasPorNro.get(nro);
      if (previas?.has(firma)) { copias++; continue; }
      (previas ?? firmasPorNro.set(nro, new Set()).get(nro)!).add(firma);
    } else {
      sinNro += items.length;
    }
    out.push(...items);
  }
  return { remitos: out, copias, sinNro };
}

// Clave de línea para dedupe sin nº: contenido completo (evita fusionar por error
// líneas de remitos distintos que solo coinciden en código y cantidad).
const claveLinea = (r: Remito) =>
  [r.remito, r.fecha, r.marca, r.sucursal, r.codigo, r.descripcion, r.cantidad].join("|");

/**
 * Suma una carga nueva a lo ya acumulado SIN duplicar: un remito ya cargado
 * (mismo número) se saltea entero, así subir dos veces el mismo PDF/CSV — o un
 * consolidado que pisa remitos ya subidos — no infla las cantidades. Las líneas
 * sin número de remito deduplican por contenido completo.
 */
export function mergeRemitos(prev: Remito[], nuevos: Remito[]): { total: Remito[]; agregadas: number; duplicadas: number } {
  const nrosPrevios = new Set(prev.map((r) => r.remito).filter(Boolean));
  const clavesPrevias = new Set(prev.map(claveLinea));
  const total = prev.slice();
  let agregadas = 0, duplicadas = 0;
  for (const r of nuevos) {
    const dup = r.remito ? nrosPrevios.has(r.remito) : clavesPrevias.has(claveLinea(r));
    if (dup) { duplicadas++; continue; }
    total.push(r);
    agregadas++;
  }
  return { total, agregadas, duplicadas };
}
