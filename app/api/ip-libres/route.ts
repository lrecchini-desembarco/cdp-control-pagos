import { NextResponse } from "next/server";
import { getSesion } from "@/lib/session";
import { getIpLibresUrl } from "@/lib/ip-libres-url";
import type { IpLibre } from "@/lib/ip-libres";

export const dynamic = "force-dynamic";

// IPs libres de la red: la app NO escanea nada — solo consulta al servidor propio
// de la empresa que lo hace todo el tiempo (ver lib/ip-libres-url.ts para cómo se
// resuelve su URL, igual que el bridge de Tango). Sistemas define el formato de
// ese servidor; acá se toleran las formas más comunes: un array de strings
// (["192.168.1.50", ...]) o de objetos ({ip, red?, vistoLibreEn?}), y también
// {ips: [...]} envolviendo cualquiera de las dos.
async function soloAdmin() {
  const s = await getSesion();
  return s?.rol === "admin" ? s : null;
}

function normalizar(body: unknown): IpLibre[] {
  const lista = Array.isArray(body) ? body : Array.isArray((body as any)?.ips) ? (body as any).ips : [];
  return lista
    .map((x: unknown): IpLibre | null => {
      if (typeof x === "string") return x.trim() ? { ip: x.trim() } : null;
      if (x && typeof x === "object" && typeof (x as any).ip === "string") {
        const o = x as Record<string, unknown>;
        return {
          ip: String(o.ip).trim(),
          ...(o.red ? { red: String(o.red) } : {}),
          ...(o.vistoLibreEn ? { vistoLibreEn: String(o.vistoLibreEn) } : {}),
        };
      }
      return null;
    })
    .filter((x: IpLibre | null): x is IpLibre => Boolean(x?.ip));
}

export async function GET() {
  if (!(await soloAdmin())) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 403 });

  const base = await getIpLibresUrl();
  if (!base) {
    return NextResponse.json({
      ok: false,
      configurado: false,
      error: "No hay un servidor de IPs libres configurado. Ver docs/ip-libres.md.",
    });
  }

  const t0 = Date.now();
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(`${base}/ips-libres`, {
      headers: {
        ...(process.env.IP_LIBRES_SECRET ? { "x-ip-libres-secret": process.env.IP_LIBRES_SECRET } : {}),
        "ngrok-skip-browser-warning": "true",
      },
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!r.ok) throw new Error(`El servidor respondió ${r.status} ${r.statusText}`);
    const ips = normalizar(await r.json());
    return NextResponse.json({ ok: true, configurado: true, ips, ms: Date.now() - t0 });
  } catch (e) {
    const detalle = e instanceof Error ? e.message : "error desconocido";
    return NextResponse.json({
      ok: false,
      configurado: true,
      error: `No se pudo consultar el servidor de IPs libres: ${detalle}`,
    });
  } finally {
    clearTimeout(to);
  }
}
