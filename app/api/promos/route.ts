import { NextRequest, NextResponse } from "next/server";
import { getSesion } from "@/lib/session";
import { getPromos, savePromo, setAprobada, removePromo } from "@/lib/promos-store";
import { costearPromoProducto, type Promo, type PromoProductoCosteado } from "@/lib/promos";
import { getListas } from "@/lib/listas-store";
import { getCanales } from "@/lib/canales-store";
import { getRecetas } from "@/lib/recetas-store";
import { getInsumos } from "@/lib/insumos-store";
import { costearReceta, indiceInsumos } from "@/lib/recetas";

export const dynamic = "force-dynamic";

const ROLES_OK = new Set(["admin", "operaciones"]);
async function autorizado() {
  const s = await getSesion();
  return s && ROLES_OK.has(s.rol) ? s : null;
}

export interface PromoCosteada extends Promo {
  productosCosteados: PromoProductoCosteado[];
  margenPromoTotal: number;
  margenRegularTotal: number;
}

export async function GET() {
  if (!(await autorizado())) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 403 });
  const [promos, listas, canales, recetas, insumos] = await Promise.all([
    getPromos(), getListas(), getCanales(), getRecetas(), getInsumos(),
  ]);
  const idx = indiceInsumos(insumos);
  const costoPorSku = new Map(recetas.map((r) => [r.skuTango, costearReceta(r, idx).costoConImp]));
  const descPorSku = new Map(recetas.map((r) => [r.skuTango, r.descripcion]));

  const costeadas: PromoCosteada[] = promos.map((promo) => {
    const lista = listas.find((l) => l.id === promo.listaId);
    const canal = promo.tipo === "apps" ? canales.find((c) => c.id === promo.canal) : undefined;
    const productosCosteados = lista
      ? promo.productos.map((p) =>
          costearPromoProducto(p, descPorSku.get(p.skuTango) ?? p.skuTango, lista.precios[p.skuTango] ?? 0, costoPorSku.get(p.skuTango) ?? 0, lista, canal)
        )
      : [];
    return {
      ...promo,
      productosCosteados,
      margenPromoTotal: productosCosteados.reduce((s, p) => s + p.margenPromo, 0),
      margenRegularTotal: productosCosteados.reduce((s, p) => s + p.margenRegular, 0),
    };
  });
  return NextResponse.json({ ok: true, promos: costeadas });
}

// POST: { id, aprobada } -> aprobar; resto -> alta/edición.
export async function POST(req: NextRequest) {
  if (!(await autorizado())) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 403 });
  try {
    const body = await req.json();
    if (body?.id && body?.aprobada !== undefined && Object.keys(body).length <= 2) {
      return NextResponse.json({ ok: true, promos: await setAprobada(body.id, !!body.aprobada) });
    }
    return NextResponse.json({ ok: true, promos: await savePromo(body) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "No se pudo guardar." }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!(await autorizado())) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 403 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "Falta id." }, { status: 400 });
  return NextResponse.json({ ok: true, promos: await removePromo(id) });
}
