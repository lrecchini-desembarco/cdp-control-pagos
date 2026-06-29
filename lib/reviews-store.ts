import { randomUUID } from "crypto";
import { readStore, writeStore } from "./store";

/** Reseña dejada por un CONSUMIDOR (vía el QR público). */
export interface ReviewPublica {
  id: string;
  creadoEn: string; // ISO datetime
  local: string;
  estrellas: number; // 1..5
  comentario: string;
}

export type ReviewInput = Pick<ReviewPublica, "local" | "estrellas" | "comentario">;

export function getReviews(local?: string): ReviewPublica[] {
  const todas = readStore<ReviewPublica[]>("reviews", []);
  const orden = [...todas].sort((a, b) => (a.creadoEn < b.creadoEn ? 1 : -1));
  return local ? orden.filter((r) => r.local === local) : orden;
}

export function addReview(input: ReviewInput): ReviewPublica {
  const estrellas = Math.max(1, Math.min(5, Math.round(Number(input.estrellas) || 0)));
  const todas = readStore<ReviewPublica[]>("reviews", []);
  const nueva: ReviewPublica = {
    id: randomUUID(),
    creadoEn: new Date().toISOString(),
    local: String(input.local).trim(),
    estrellas,
    comentario: String(input.comentario ?? "").slice(0, 1000),
  };
  todas.push(nueva);
  writeStore("reviews", todas);
  return nueva;
}

export interface ResumenReviews {
  total: number;
  promedio: number; // 0..5
  porEstrella: Record<number, number>;
}

export function resumenReviews(reviews: ReviewPublica[]): ResumenReviews {
  const porEstrella: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let suma = 0;
  for (const r of reviews) {
    porEstrella[r.estrellas] = (porEstrella[r.estrellas] ?? 0) + 1;
    suma += r.estrellas;
  }
  return { total: reviews.length, promedio: reviews.length ? suma / reviews.length : 0, porEstrella };
}
