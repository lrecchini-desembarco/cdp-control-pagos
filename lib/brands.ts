import type { Brand, BrandId } from "./types";

export const BRANDS: Brand[] = [
  { id: "desembarco", name: "El Desembarco", color: "#B5472E" },
  { id: "tasty", name: "Mr. Tasty", color: "#E0A024" },
  { id: "mila", name: "Mila & Go", color: "#3E7C6A" },
];

export const brandById = (id: BrandId) => BRANDS.find((b) => b.id === id)!;

export const fmtInt = (n: number) =>
  new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(n);

// Formato compacto y claro (es-AR): 2.088 -> "2,1 mil", 1.234.567 -> "1,2 M".
// Para que se lea la magnitud de un vistazo (miles / millones).
export const fmtCompacto = (n: number): string => {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${(n / 1_000_000).toLocaleString("es-AR", { maximumFractionDigits: 1 })} M`;
  if (a >= 1_000) return `${(n / 1_000).toLocaleString("es-AR", { maximumFractionDigits: 1 })} mil`;
  return Math.round(n).toLocaleString("es-AR");
};

export const fmtNum = (n: number, d = 1) =>
  new Intl.NumberFormat("es-AR", { maximumFractionDigits: d }).format(n);

export const fmtPct = (n: number) =>
  new Intl.NumberFormat("es-AR", {
    style: "percent",
    maximumFractionDigits: 1,
    signDisplay: "exceptZero",
  }).format(n);

export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
};

/** Severidad del desvío para semáforo (Nielsen: reconocer > recordar) */
export function severidad(pct: number): "ok" | "warn" | "bad" {
  const a = Math.abs(pct);
  if (a <= 0.05) return "ok";
  if (a <= 0.15) return "warn";
  return "bad";
}
