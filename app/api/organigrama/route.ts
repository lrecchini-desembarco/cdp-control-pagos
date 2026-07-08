import { NextRequest, NextResponse } from "next/server";
import { getSesion } from "@/lib/session";
import { getOrganigrama, upsertNodo, removeNodo, moverNodo, setOrganigrama } from "@/lib/organigrama-store";
import { notificar } from "@/lib/notify";
import type { NodoOrg } from "@/lib/organigrama";

export const dynamic = "force-dynamic";

// Aviso de nuevo ingreso por el canal configurado (email/none). Nunca frena el alta.
async function avisarIngreso(nuevo: NodoOrg, nodos: NodoOrg[], por: string) {
  try {
    const jefe = nuevo.parentId ? nodos.find((n) => n.id === nuevo.parentId) : undefined;
    const fecha = new Date().toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
    const texto = [
      "👋 *Nuevo ingreso — Organigrama*",
      `• *${nuevo.nombre || "(sin nombre)"}* — ${nuevo.cargo || "(sin cargo)"}`,
      `• Reporta a: ${jefe ? `${jefe.nombre || jefe.cargo}` : "— (máxima autoridad)"}`,
      `• Cargado por ${por} · ${fecha}`,
    ].join("\n");
    const subject = `Nuevo ingreso: ${nuevo.nombre || "(sin nombre)"}${nuevo.cargo ? ` — ${nuevo.cargo}` : ""}`;
    return await notificar(texto, { subject });
  } catch {
    return { enviado: false, canal: "error", info: "No se pudo notificar.", preview: "" };
  }
}

// Editar el organigrama: admin y operaciones. Verlo: cualquiera logueado.
async function puedeEditar() {
  const s = await getSesion();
  return s && (s.rol === "admin" || s.rol === "operaciones") ? s : null;
}

export async function GET() {
  const s = await getSesion();
  if (!s) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
  const editable = s.rol === "admin" || s.rol === "operaciones";
  return NextResponse.json({ ok: true, nodos: await getOrganigrama(), editable, email: s.email });
}

// POST: alta/edición (body de nodo), o acciones {accion:"mover", id, dir} / {accion:"import", nodos}.
export async function POST(req: NextRequest) {
  const s = await puedeEditar();
  if (!s) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 403 });
  try {
    const body = await req.json();
    if (body?.accion === "mover" && body?.id) {
      return NextResponse.json({ ok: true, nodos: await moverNodo(String(body.id), body.dir === -1 ? -1 : 1) });
    }
    if (body?.accion === "import" && Array.isArray(body?.nodos)) {
      return NextResponse.json({ ok: true, nodos: await setOrganigrama(body.nodos) });
    }
    // Alta = sin id. Detectamos el nodo nuevo para avisar el ingreso.
    const esAlta = !body?.id;
    const idsAntes = esAlta ? new Set((await getOrganigrama()).map((n) => n.id)) : null;
    const nodos = await upsertNodo(body);
    let notificado: { enviado: boolean; canal: string } | undefined;
    if (esAlta && idsAntes) {
      const nuevo = nodos.find((n) => !idsAntes.has(n.id));
      if (nuevo && body?.notificar !== false) {
        const r = await avisarIngreso(nuevo, nodos, s.email);
        notificado = { enviado: r.enviado, canal: r.canal };
      }
    }
    return NextResponse.json({ ok: true, nodos, ...(notificado ? { notificado } : {}) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "No se pudo guardar." }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!(await puedeEditar())) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 403 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "Falta id." }, { status: 400 });
  return NextResponse.json({ ok: true, nodos: await removeNodo(id) });
}
