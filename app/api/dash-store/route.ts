import { NextResponse } from "next/server";
import { readStore, writeStore } from "@/lib/store";
import { iguales } from "@/lib/auth-cookie";

export const dynamic = "force-dynamic";

// Puente de storage para el dashboard de precios de desembarco-web:
// ese proyecto no tiene KV propio todavía, así que persiste acá
// (permisos de acceso y borradores), autenticado con secreto compartido
// y namespaceado bajo "dashweb:".

const CLAVES_PERMITIDAS = /^[\w-]{1,40}$/;

export async function POST(req: Request) {
  const secreto = process.env.DASH_STORE_SECRETO;
  if (!secreto || !iguales(req.headers.get("x-dash-secreto") ?? "", secreto)) {
    return NextResponse.json({ ok: false, error: "no autorizado" }, { status: 401 });
  }
  const { accion, clave, valor } = await req.json().catch(() => ({}));
  if (typeof clave !== "string" || !CLAVES_PERMITIDAS.test(clave)) {
    return NextResponse.json({ ok: false, error: "clave inválida" }, { status: 400 });
  }
  if (accion === "leer") {
    const guardado = await readStore<unknown>(`dashweb-${clave}`, null);
    return NextResponse.json({ ok: true, valor: guardado });
  }
  if (accion === "escribir") {
    await writeStore(`dashweb-${clave}`, valor ?? null);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ ok: false, error: "acción inválida" }, { status: 400 });
}
