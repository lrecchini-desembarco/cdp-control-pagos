import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/api-guard";
import { readStore, writeStore } from "@/lib/store";
import { correrChecks, armarReporte, type QaReporte } from "@/lib/qa-checks";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const KEY = "qa-reporte";       // último reporte
const HIST = "qa-historial";    // serie resumida

type HistItem = { cuando: string; pasan: number; fallan: number };

async function correrYGuardar() {
  const reporte = armarReporte(await correrChecks());
  await writeStore(KEY, reporte);
  const hist = (await readStore<HistItem[] | null>(HIST, null)) ?? [];
  hist.push({ cuando: reporte.cuando, pasan: reporte.pasan, fallan: reporte.fallan });
  await writeStore(HIST, hist.slice(-60));
  return reporte;
}

// GET: el CRON de Vercel (Bearer CRON_SECRET) o ?run=1 (admin) CORRE el bot y guarda.
// El resto -> devuelve el último reporte + historial (para el panel /qa).
export async function GET(req: NextRequest) {
  const esCron = !!process.env.CRON_SECRET && req.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;
  const runManual = req.nextUrl.searchParams.get("run") === "1";

  if (esCron || runManual) {
    if (!esCron) { const g = await guard("/qa"); if ("res" in g) return g.res; } // manual: exige admin/permiso
    const reporte = await correrYGuardar();
    return NextResponse.json({ ok: true, corrido: true, reporte });
  }

  const g = await guard("/qa");
  if ("res" in g) return g.res;
  const [reporte, historial] = await Promise.all([
    readStore<QaReporte | null>(KEY, null),
    readStore<HistItem[] | null>(HIST, null),
  ]);
  return NextResponse.json({ ok: true, reporte, historial: historial ?? [] });
}
