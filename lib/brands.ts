import type { Brand, BrandId } from "./types";

export const BRANDS: Brand[] = [
  { id: "desembarco", name: "El Desembarco", color: "#B5472E" },
  { id: "tasty", name: "Mr. Tasty", color: "#E0A024" },
  { id: "mila", name: "Mila & Go", color: "#3E7C6A" },
];

export const brandById = (id: BrandId) => BRANDS.find((b) => b.id === id)!;

export const fmtInt = (n: number) =>
  new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(n);

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
