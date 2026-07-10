import { NextRequest, NextResponse } from "next/server";
import { listarSilencios, silenciar, quitarSilencio } from "@/lib/silencios";
import { guard } from "@/lib/api-guard";

export const dynamic = "force-dynamic";

// GET /api/silencios -> lista de silencios vigentes
export async function GET() {
  const g = await guard("/alertas");
  if ("res" in g) return g.res;
  return NextResponse.json({ ok: true, silencios: await listarSilencios() });
}

// POST /api/silencios { id, dias?, motivo? } -> silencia (dias null = indefinido)
export async function POST(req: NextRequest) {
  const g = await guard("/alertas");
  if ("res" in g) return g.res;
  try {
    const { id, dias = 7, motivo } = (await req.json()) as {
      id?: string;
      dias?: number | null;
      motivo?: string;
    };
    if (!id) return NextResponse.json({ ok: false, error: "Falta id." }, { status: 400 });
    return NextResponse.json({ ok: true, silencio: await silenciar(id, dias ?? null, motivo) });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "No se pudo silenciar." },
      { status: 500 }
    );
  }
}

// DELETE /api/silencios?id=... -> reactiva (quita el silencio)
export async function DELETE(req: NextRequest) {
  const g = await guard("/alertas");
  if ("res" in g) return g.res;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "Falta id." }, { status: 400 });
  await quitarSilencio(id);
  return NextResponse.json({ ok: true });
}
