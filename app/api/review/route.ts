import { NextRequest, NextResponse } from "next/server";
import { emitirCupon, venceDe } from "@/lib/cupones-store";

export const dynamic = "force-dynamic";

// POST público (sin login): el cliente deja nombre + teléfono al calificar y recibe
// su cupón de descuento. Anti-abuso (1 cupón por teléfono+local) lo maneja el store.
export async function POST(req: NextRequest) {
  try {
    const { local, marca, nombre, telefono, rating, consent } = (await req.json()) as {
      local?: string;
      marca?: string;
      nombre?: string;
      telefono?: string;
      rating?: number;
      consent?: boolean;
    };
    if (!local || !nombre?.trim()) {
      return NextResponse.json({ ok: false, error: "Faltan el local o el nombre." }, { status: 400 });
    }
    const tel = String(telefono ?? "").replace(/\D/g, "");
    if (tel.length < 8) {
      return NextResponse.json({ ok: false, error: "El teléfono no parece válido." }, { status: 400 });
    }
    const r = typeof rating === "number" && rating >= 1 && rating <= 5 ? Math.round(rating) : undefined;
    const cupon = await emitirCupon({ local, marca, nombre, telefono: tel, rating: r, consent: Boolean(consent) });
    return NextResponse.json({ ok: true, codigo: cupon.codigo, usosRestantes: cupon.usosRestantes, vence: venceDe(cupon) });
  } catch {
    return NextResponse.json({ ok: false, error: "No se pudo procesar. Reintentá." }, { status: 400 });
  }
}
