import { NextRequest, NextResponse } from "next/server";
import { gzipSync, gunzipSync } from "zlib";
import { guard } from "@/lib/api-guard";
import { readStore, writeStore } from "@/lib/store";
import { migrarAlias, purgarOtroDuplicado, resumirBancos, type MovBanco } from "@/lib/bancos";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const KEY = "bancos-movs";
const META = "bancos-meta";
const BACKUP = "bancos-movs-prealias-backup";
const pack = (o: unknown) => gzipSync(Buffer.from(JSON.stringify(o), "utf8")).toString("base64");
const unpack = <T,>(s: string): T => JSON.parse(gunzipSync(Buffer.from(s, "base64")).toString("utf8")) as T;

async function leer(key: string): Promise<MovBanco[]> {
  const packed = await readStore<string | null>(key, null);
  return packed ? unpack<MovBanco[]>(packed) : [];
}

// Migración de alias de local (arreglo del doble conteo por "DDR" vs "El Desembarco
// del Rey", etc.). POST { aplicar?: boolean }:
//  - sin aplicar (dry-run): devuelve el diagnóstico SIN tocar nada.
//  - aplicar:true: hace backup del blob actual y guarda la versión migrada.
export async function POST(req: NextRequest) {
  const g = await guard("/bancos");
  if ("res" in g) return g.res;
  try {
    const body = (await req.json().catch(() => ({}))) as { aplicar?: boolean; restaurar?: boolean; accion?: string };

    // Restaurar desde el backup (por si algo salió mal).
    if (body.restaurar) {
      const bak = await readStore<string | null>(BACKUP, null);
      if (!bak) return NextResponse.json({ ok: false, error: "no hay backup para restaurar" }, { status: 400 });
      await writeStore(KEY, bak);
      const movs = unpack<MovBanco[]>(bak);
      await writeStore(META, { actualizado: new Date().toISOString(), total: movs.length });
      return NextResponse.json({ ok: true, restaurado: true, total: movs.length });
    }

    // Purga de duplicados del banco "Otro" (gemelos exactos bajo un banco reconocido).
    if (body.accion === "purgar-otro") {
      const movsAll = await leer(KEY);
      const { movs: limpios, diag } = purgarOtroDuplicado(movsAll);
      if (body.aplicar) {
        const yaHayBackup = await readStore<string | null>(BACKUP, null);
        if (!yaHayBackup) await writeStore(BACKUP, pack(movsAll));
        await writeStore(KEY, pack(limpios));
        await writeStore(META, { actualizado: new Date().toISOString(), total: limpios.length });
        return NextResponse.json({ ok: true, aplicado: true, accion: "purgar-otro", diag, resumen: resumirBancos(limpios) });
      }
      return NextResponse.json({ ok: true, aplicado: false, dryRun: true, accion: "purgar-otro", diag });
    }

    const movs = await leer(KEY);
    const { movs: migrados, diag } = migrarAlias(movs);

    if (body.aplicar) {
      // Backup del blob actual antes de sobrescribir (idempotente: no pisar un backup previo).
      const yaHayBackup = await readStore<string | null>(BACKUP, null);
      if (!yaHayBackup) await writeStore(BACKUP, pack(movs));
      await writeStore(KEY, pack(migrados));
      await writeStore(META, { actualizado: new Date().toISOString(), total: migrados.length });
      return NextResponse.json({ ok: true, aplicado: true, diag, resumen: resumirBancos(migrados) });
    }
    return NextResponse.json({ ok: true, aplicado: false, dryRun: true, diag });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
