import { NextRequest, NextResponse } from "next/server";

const BASE = "https://api.ravenfood.app/data/items";

// GET /api/raven?code=050027&date=2026-06-25
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code")?.trim() ?? "";
  const date = req.nextUrl.searchParams.get("date")?.trim() ?? "";

  // Prevención de errores (Nielsen #5): validar antes de pegar
  if (!/^\d{3,8}$/.test(code)) {
    return NextResponse.json(
      { error: "El código debe ser numérico (3 a 8 dígitos)." },
      { status: 400 }
    );
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { error: "La fecha debe tener formato AAAA-MM-DD." },
      { status: 400 }
    );
  }

  try {
    const url = `${BASE}/${encodeURIComponent(code)}?date=${encodeURIComponent(date)}`;
    const r = await fetch(url, { cache: "no-store" });
    const text = await r.text();
    if (!r.ok) {
      return NextResponse.json(
        { error: `Raven respondió ${r.status}. Revisá el código y la fecha.` },
        { status: r.status }
      );
    }
    const json = JSON.parse(text);
    return NextResponse.json(json.data ?? json, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { error: "No se pudo conectar con Raven. Reintentá en unos segundos." },
      { status: 502 }
    );
  }
}
