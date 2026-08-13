// Carga el parque de computadoras desde el CSV del relevamiento.
//
//   node scripts/seed-inventario-pcs.mjs "C:\ruta\inventario_pcs.csv"
//
// Genera lib/parque-seed.json: una fila por equipo, con las flags ya calculadas
// (RAM baja, SSD chico, cuenta local, cuenta personal, SO fuera de soporte…) y el
// estado que decide en qué pestaña cae: Inventario o Faltantes.
//
// Columnas esperadas:
//   Nro,Usuario,Area,Tipo,Hostname,Marca,Modelo,CPU,RAM,Almacenamiento,GPU,SO,Correo,Observaciones

import { readFile, writeFile } from "fs/promises";
import { join } from "path";

const SALIDA = join(process.cwd(), "lib", "parque-seed.json");

/**
 * CSV a filas. Soporta , o ; y campos entrecomillados. Las comillas solo abren
 * campo si est\u00E1n al principio: as\u00ED un `Monitor 24"` en el medio del texto no
 * desalinea todo el archivo (el relevamiento viene con pulgadas sin escapar).
 */
function parsearCSV(texto) {
  const limpio = texto.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const primera = limpio.split("\n")[0] ?? "";
  const delim = primera.split(";").length > primera.split(",").length ? ";" : ",";
  const filas = [];
  let fila = [];
  let campo = "";
  let comillas = false;
  for (let i = 0; i < limpio.length; i++) {
    const c = limpio[i];
    if (comillas) {
      if (c === '"' && limpio[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') comillas = false;
      else campo += c;
    } else if (c === '"' && campo === "") comillas = true;
    else if (c === delim) { fila.push(campo); campo = ""; }
    else if (c === "\n") { fila.push(campo); filas.push(fila); fila = []; campo = ""; }
    else campo += c;
  }
  if (campo || fila.length) { fila.push(campo); filas.push(fila); }
  return filas.filter((f) => f.some((v) => v.trim() !== ""));
}

async function main() {
  const origen = process.argv[2];
  if (!origen) {
    console.error('Falta la ruta del CSV. Ej: node scripts/seed-inventario-pcs.mjs "C:\\ruta\\inventario_pcs.csv"');
    process.exit(1);
  }

  const [cabecera, ...cuerpo] = parsearCSV(await readFile(origen, "utf8"));
  const col = Object.fromEntries(cabecera.map((c, i) => [c.trim().toLowerCase(), i]));
  const ultima = cabecera.length - 1; // Observaciones: texto libre con comas sin escapar
  const v = (fila, nombre) => {
    const i = col[nombre];
    if (i === ultima && fila.length > cabecera.length) return fila.slice(ultima).join(",").trim();
    return (fila[i] ?? "").trim();
  };

  const equipos = cuerpo.map((fila, i) => ({
      id: `pc-${String(v(fila, "nro") || i + 1).padStart(3, "0")}`,
      nro: Number(v(fila, "nro")) || i + 1,
      usuario: v(fila, "usuario"),
      area: v(fila, "area"),
      tipo: v(fila, "tipo"),
      hostname: v(fila, "hostname"),
      marca: v(fila, "marca"),
      modelo: v(fila, "modelo"),
      cpu: v(fila, "cpu"),
      ram: v(fila, "ram"),
      almacenamiento: v(fila, "almacenamiento"),
      gpu: v(fila, "gpu"),
      so: v(fila, "so"),
      correo: v(fila, "correo"),
      observaciones: v(fila, "observaciones"),
  }));

  await writeFile(SALIDA, JSON.stringify(equipos, null, 2) + "\n", "utf8");

  console.log(`✔ ${equipos.length} equipos → lib/parque-seed.json`);
  console.log("   Las alertas (RAM baja, SSD chico, cuenta local…) y el estado inicial los");
  console.log("   deriva la app al leer, con las reglas de lib/parque.ts.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
