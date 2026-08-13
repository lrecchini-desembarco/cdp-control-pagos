// Parque de computadoras: estados y flags. Config pura (usable en cliente).
// Las flags las calcula scripts/seed-inventario-pcs.mjs desde el CSV del
// relevamiento; acá viven las etiquetas y los colores con los que se muestran.

export type EstadoPC = "en-uso" | "reemplazar" | "sin-equipo";
export type Tone = "ok" | "action" | "warn" | "bad" | "neutral" | "muted";

export interface EstadoPCInfo {
  id: EstadoPC;
  label: string;
  tone: Tone;
  /** En qué pestaña cae. */
  tab: "inventario" | "faltantes";
}

export const ESTADOS_PC: EstadoPCInfo[] = [
  { id: "en-uso", label: "En uso", tone: "ok", tab: "inventario" },
  { id: "reemplazar", label: "A reemplazar", tone: "bad", tab: "faltantes" },
  { id: "sin-equipo", label: "Sin equipo", tone: "warn", tab: "faltantes" },
];

export const estadoPC = (id: string): EstadoPCInfo =>
  ESTADOS_PC.find((e) => e.id === id) ?? ESTADOS_PC[0];

export interface FlagInfo {
  id: string;
  label: string;
  corto: string;
  tone: Tone;
  desc: string;
}

export const FLAGS_PC: FlagInfo[] = [
  { id: "ram-baja", label: "RAM baja", corto: "RAM", tone: "warn", desc: "8 GB o menos: se queda corto con Tango + navegador + Excel." },
  { id: "ssd-chico", label: "SSD chico", corto: "SSD", tone: "warn", desc: "128 GB o menos de disco: no entra Windows + trabajo cómodo." },
  { id: "cuenta-local", label: "Cuenta local", corto: "Local", tone: "action", desc: "Inicia con una cuenta local de Windows, no con la corporativa." },
  { id: "cuenta-personal", label: "Cuenta personal", corto: "Personal", tone: "bad", desc: "Sesión iniciada con una cuenta personal (Gmail/Hotmail) en una máquina de la empresa." },
  { id: "sin-corporativa", label: "Sin cuenta corporativa", corto: "Sin cta.", tone: "bad", desc: "Falta darle de alta la cuenta @eldesembarco.com." },
  { id: "so-eol", label: "SO sin soporte", corto: "SO EOL", tone: "bad", desc: "Windows fuera de soporte: sin parches de seguridad." },
  { id: "reemplazo", label: "Candidato a reemplazo", corto: "Reemplazo", tone: "bad", desc: "Equipo viejo o lento marcado para cambiar." },
  { id: "datos-pendientes", label: "Datos pendientes", corto: "Datos", tone: "muted", desc: "Falta completar el relevamiento (marca, modelo, disco…)." },
];

export const flagPC = (id: string): FlagInfo =>
  FLAGS_PC.find((f) => f.id === id) ?? { id, label: id, corto: id, tone: "neutral", desc: "" };

export const TIPOS_PC = ["PC Escritorio", "Notebook"];

// --- Derivación de specs y alertas -------------------------------------------
// Vale igual para el relevamiento (CSV) y para lo que se carga a mano, así que
// vive acá y no en el script: una sola regla, un solo lugar donde cambiarla.

/** "8 GB (2666 MHz)" -> 8 · "64 GB" -> 64 */
export const gbRam = (s: string): number => {
  const m = /([\d.,]+)\s*GB/i.exec(s || "");
  return m ? Math.round(parseFloat(m[1].replace(",", "."))) : 0;
};

/** "119 GB SSD (Lexar…)" -> 119 · "1.82 TB SSD" -> 1864 */
export const gbDisco = (s: string): number => {
  const tb = /([\d.,]+)\s*TB/i.exec(s || "");
  if (tb) return Math.round(parseFloat(tb[1].replace(",", ".")) * 1024);
  const gb = /([\d.,]+)\s*GB/i.exec(s || "");
  return gb ? Math.round(parseFloat(gb[1].replace(",", "."))) : 0;
};

// Umbrales del relevamiento: 8 GB es el piso que ya molesta; 128 GB de disco queda chico.
export const RAM_BAJA = 8;
export const DISCO_CHICO = 128;

export interface SpecsPC {
  marca?: string;
  modelo?: string;
  cpu?: string;
  ram?: string;
  almacenamiento?: string;
  so?: string;
  hostname?: string;
  observaciones?: string;
}

/** Las alertas que se muestran como chips. Se recalculan en cada lectura. */
export function flagsDe(eq: SpecsPC): string[] {
  const obs = (eq.observaciones || "").toLowerCase();
  const so = (eq.so || "").toLowerCase();
  const ram = gbRam(eq.ram || "");
  const disco = gbDisco(eq.almacenamiento || "");
  const f: string[] = [];
  if (ram && ram <= RAM_BAJA) f.push("ram-baja");
  if (disco && disco <= DISCO_CHICO) f.push("ssd-chico");
  if (/cuenta local/.test(obs)) f.push("cuenta-local");
  if (/cuenta (microsoft )?personal|@gmail|@hotmail|cuenta personal/.test(obs)) f.push("cuenta-personal");
  if (/sin cuenta corporativa|crear cuenta corporativa|validar y crear cuenta/.test(obs)) f.push("sin-corporativa");
  if (/fuera de soporte/.test(obs) || /fuera de soporte/.test(so)) f.push("so-eol");
  if (/candidato prioritario a reemplazo|prioritario a reemplazo/.test(obs)) f.push("reemplazo");
  if (!eq.marca || !eq.modelo || !eq.cpu) f.push("datos-pendientes");
  return f;
}

/** Estado con el que entra un equipo nuevo (después el admin lo cambia a mano). */
export function estadoInicial(eq: SpecsPC, flags: string[]): EstadoPC {
  const obs = (eq.observaciones || "").toLowerCase();
  if (!eq.hostname && !eq.cpu && !eq.marca) return "sin-equipo";
  if (flags.includes("reemplazo") || /pendiente relevamiento/.test(obs)) return "reemplazar";
  return "en-uso";
}

// Mismos tonos que el resto del módulo (ver InventarioView).
export const toneCls = (t: string) =>
  ({
    ok: "bg-ok/10 text-ok border-ok/30",
    action: "bg-action/10 text-action border-action/30",
    warn: "bg-warn/10 text-warn border-warn/30",
    bad: "bg-bad/10 text-bad border-bad/30",
    neutral: "bg-ink/5 text-muted border-line",
    muted: "bg-ink/5 text-faint border-line",
  }[t] || "bg-ink/5 text-muted border-line");
