import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { guard, guardAdmin } from "@/lib/api-guard";
import { readStore, writeStore } from "@/lib/store";
import { limpiarContacto, type Contacto } from "@/lib/contactos";

export const dynamic = "force-dynamic";

const KEY = "contactos";
const leer = async () => (await readStore<Contacto[] | null>(KEY, null)) ?? [];

// GET -> lista de contactos + si el usuario puede editar (solo admin).
export async function GET() {
  const g = await guard("/contactos");
  if ("res" in g) return g.res;
  return NextResponse.json({ ok: true, contactos: await leer(), puedeEditar: g.s.rol === "admin" });
}

// POST { contacto } -> alta o edición (si trae id existente lo reemplaza).
export async function POST(req: NextRequest) {
  const g = await guardAdmin();
  if ("res" in g) return g.res;
  try {
    const body = (await req.json()) as { contacto?: Partial<Contacto> };
    const entrada = body.contacto ?? {};
    const id = typeof entrada.id === "string" && entrada.id ? entrada.id : randomUUID();
    const limpio = limpiarContacto(entrada, id);
    if (!limpio) return NextResponse.json({ ok: false, error: "El contacto necesita al menos un nombre." }, { status: 400 });
    const lista = await leer();
    const i = lista.findIndex((c) => c.id === id);
    if (i >= 0) lista[i] = limpio; else lista.push(limpio);
    await writeStore(KEY, lista);
    return NextResponse.json({ ok: true, contactos: lista });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "No se pudo guardar." }, { status: 500 });
  }
}

// DELETE ?id= -> borra un contacto.
export async function DELETE(req: NextRequest) {
  const g = await guardAdmin();
  if ("res" in g) return g.res;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "Falta el id." }, { status: 400 });
  const lista = (await leer()).filter((c) => c.id !== id);
  await writeStore(KEY, lista);
  return NextResponse.json({ ok: true, contactos: lista });
}
