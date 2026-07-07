import { NextResponse } from "next/server";
import { getSesion } from "@/lib/session";
import { ventasSourceName, preciosSourceName } from "@/lib/sources";
import { getBridgeUrl } from "@/lib/bridge-url";

export const dynamic = "force-dynamic";

// Chequeo de estado del sistema (solo admin): endpoints del bridge + salud en vivo
// de las fuentes (Tango/bridge, KV, Raven). Sirve de "check rápido" de prod.

const resolver = (esp: string): "live" | "mock" => {
  const v = process.env[esp] ?? process.env.DATA_SOURCE ?? "live";
  return v === "mock" ? "mock" : "live";
};

async function pingBridge(base: string | null, path: string, timeoutMs = 6000): Promise<{ ok: boolean; ms: number; detail: string }> {
  if (!base) return { ok: false, ms: 0, detail: "sin bridge configurado (dev usa SQL directo)" };
  const t0 = Date.now();
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`${base}${path}`, {
      headers: process.env.TANGO_BRIDGE_SECRET ? { "x-bridge-secret": process.env.TANGO_BRIDGE_SECRET } : {},
      signal: ctrl.signal,
      cache: "no-store",
    });
    const ms = Date.now() - t0;
    if (!r.ok) return { ok: false, ms, detail: `HTTP ${r.status}` };
    const body = await r.json().catch(() => null);
    const n = Array.isArray(body) ? `${body.length} filas` : "ok";
    return { ok: true, ms, detail: n };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, detail: e instanceof Error ? e.message : "error" };
  } finally {
    clearTimeout(to);
  }
}

export async function GET() {
  const s = await getSesion();
  if (s?.rol !== "admin") return NextResponse.json({ ok: false, error: "Solo admin." }, { status: 403 });

  const bridgeBase = await getBridgeUrl();
  const [health, sucursales] = await Promise.all([pingBridge(bridgeBase, "/health"), pingBridge(bridgeBase, "/sucursales")]);

  const endpoints = [
    { metodo: "GET", ruta: "/health", desc: "Salud del bridge (sin secreto)", estado: health },
    { metodo: "GET", ruta: "/", desc: "Índice de endpoints (sin secreto)", estado: null },
    { metodo: "GET", ruta: "/ventas?desde&hasta", desc: "Ventas por insumo/turno (Tango)", estado: null },
    { metodo: "GET", ruta: "/precios", desc: "Precios de productos (Tango)", estado: null },
    { metodo: "GET", ruta: "/sucursales", desc: "Maestro de sucursales (Tango)", estado: sucursales },
    { metodo: "GET", ruta: "/cobros?desde&hasta", desc: "Cobros por medio de pago (requiere vw_CobrosDiarios)", estado: null },
  ];

  const fuentes = [
    { nombre: "Ventas (Tango)", valor: ventasSourceName() },
    { nombre: "Precios (Tango)", valor: preciosSourceName() },
    { nombre: "Pedidos (Raven)", valor: resolver("PEDIDOS_SOURCE") },
    { nombre: "Catálogo", valor: resolver("CATALOGO_SOURCE") },
  ];

  const config = [
    { nombre: "Bridge Tango", ok: Boolean(bridgeBase), detalle: bridgeBase ? new URL(bridgeBase).host : "no seteado (SQL directo)" },
    { nombre: "Secreto bridge", ok: Boolean(process.env.TANGO_BRIDGE_SECRET), detalle: process.env.TANGO_BRIDGE_SECRET ? "configurado" : "falta" },
    { nombre: "Persistencia KV", ok: Boolean(process.env.KV_REST_API_URL), detalle: process.env.KV_REST_API_URL ? "Upstash/KV conectado" : "archivos (efímero en Vercel)" },
    { nombre: "Token Raven", ok: Boolean(process.env.RAVEN_TOKEN), detalle: process.env.RAVEN_TOKEN ? "configurado" : "falta → pedidos en mock" },
  ];

  return NextResponse.json({
    ok: true,
    bridgeHost: bridgeBase ? new URL(bridgeBase).host : null,
    endpoints,
    fuentes,
    config,
  });
}
