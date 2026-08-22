import { NextResponse } from "next/server";
import { getSesion } from "@/lib/session";
import { puedeVerPanelSistemas } from "@/lib/panel-sistemas-store";
import { getTickets } from "@/lib/tickets-store";
import { getUsuarios } from "@/lib/users-store";
import { getInventario } from "@/lib/inventario-store";
import { necesitaAprobacion } from "@/lib/inventario";
import { getIps } from "@/lib/ip-libres-store";
import { getCredenciales } from "@/lib/credenciales-store";
import { dataSourceName, preciosSourceName, ventasSourceName, pedidosSourceName } from "@/lib/sources";

export const dynamic = "force-dynamic";

// Contadores para los badges del riel de la consola y la tira de "Guardia".
// Agrega varias fuentes que ya existen — no crea ningún concepto de datos
// nuevo, salvo la aproximación anotada abajo. Cache in-memory de 30s: es un
// contador de UI, no dato crítico, y evita 6 fetchs cada vez que se pinta el
// riel. Se resetea en cada cold start, lo cual está bien acá.
interface Resumen {
  ticketsAbiertos: number;
  esperandoUsuario: number;
  resueltosSemana: number;
  sinRol: number;
  altasPendientes: number;
  fuentesMock: number;
  ipsSinDocumentar: number;
  credencialesTotal: number;
}
let cache: { valor: Resumen; hasta: number } | null = null;
const TTL_MS = 30_000;

async function calcular(): Promise<Resumen> {
  const [tickets, usuarios, inventario, ips, credenciales] = await Promise.all([
    getTickets(),
    getUsuarios(),
    getInventario(),
    getIps(),
    getCredenciales(),
  ]);
  const hace7d = Date.now() - 7 * 86_400_000;
  const fuentes = [dataSourceName(), preciosSourceName(), ventasSourceName(), pedidosSourceName()];
  return {
    ticketsAbiertos: tickets.filter((t) => t.estado === "abierto").length,
    esperandoUsuario: tickets.filter((t) => t.estado === "espera").length,
    resueltosSemana: tickets.filter((t) => (t.estado === "resuelto" || t.estado === "cerrado") && Date.parse(t.actualizado) >= hace7d).length,
    sinRol: usuarios.filter((u) => u.rol === "pendiente").length,
    altasPendientes: inventario.filter((it) => necesitaAprobacion(it.estado) && it.aprobacion === "pendiente").length,
    fuentesMock: fuentes.filter((f) => f === "mock").length,
    // Aproximación: no existe un flag "documentada" en IpEntry — se usa la
    // ausencia de "red" (VLAN/subred) como proxy, es el campo de identidad
    // de red, no uno de texto libre como "nota".
    ipsSinDocumentar: ips.filter((e) => !e.red).length,
    credencialesTotal: credenciales.length,
  };
}

export async function GET() {
  const s = await getSesion();
  if (!s || !(await puedeVerPanelSistemas(s.email))) {
    return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 403 });
  }
  if (!cache || cache.hasta < Date.now()) {
    cache = { valor: await calcular(), hasta: Date.now() + TTL_MS };
  }
  return NextResponse.json({ ok: true, ...cache.valor });
}
