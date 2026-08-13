import { NextRequest, NextResponse } from "next/server";
import { getSesion } from "@/lib/session";
import { getArchivo } from "@/lib/tutoriales-store";
import { formatoDe } from "@/lib/tutoriales";

export const dynamic = "force-dynamic";

// Sirve el archivo ORIGINAL, con su nombre y extensión.
//   ?id=xxx            -> inline (visor embebido: PDF, tabla CSV)
//   ?id=xxx&descargar=1 -> attachment (botón "Descargar")
export async function GET(req: NextRequest) {
  const s = await getSesion();
  if (!s) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "Falta id." }, { status: 400 });

  const encontrado = await getArchivo(id);
  if (!encontrado) return NextResponse.json({ ok: false, error: "No se encontró el archivo." }, { status: 404 });

  const { tutorial, buffer } = encontrado;
  const mime = formatoDe(tutorial.formato)?.mime ?? "application/octet-stream";
  const modo = req.nextUrl.searchParams.get("descargar") ? "attachment" : "inline";

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": mime,
      "Content-Length": String(buffer.length),
      // filename* va en UTF-8 para que no se rompan los acentos del nombre original.
      "Content-Disposition": `${modo}; filename="${tutorial.archivo.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(tutorial.archivo)}`,
      "Cache-Control": "private, max-age=300",
    },
  });
}
