import { NextRequest, NextResponse } from "next/server";
import { gzipSync, gunzipSync } from "zlib";
import { guard } from "@/lib/api-guard";
import { readStore, writeStore } from "@/lib/store";
import { PARAMS_DEFAULT, aplicarGestion, aplicarCobros, gestionKey, type FacturaCC, type ParamsCC, type Gestion, type ClienteCC, type CobroCC } from "@/lib/franquicias";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Cuentas Corrientes de Franquicias. Snapshot de facturas (cada subida reemplaza — es
// una foto al día) + parámetros de cálculo + capa de GESTIÓN de cobranza (contacto /
// promesa / nota, editable en la app, keyed por comprobante). La gestión se guarda
// APARTE, así re-subir el estado de cuenta NO borra el trabajo de cobranza.
const KEY = "franquicias-facturas";
const PKEY = "franquicias-params";
const GKEY = "franquicias-gestion";
const MANK = "franquicias-manuales";   // facturas cargadas a mano (se guardan aparte)
const CLIK = "franquicias-clientes";   // estado/nota a nivel franquiciado (keyed por clienteId)
const COBK = "franquicias-cobros";     // registro de cobros (bajan el saldo)
const META = "franquicias-meta";
const pack = (o: unknown) => gzipSync(Buffer.from(JSON.stringify(o), "utf8")).toString("base64");
const unpack = <T,>(s: string): T => JSON.parse(gunzipSync(Buffer.from(s, "base64")).toString("utf8")) as T;

async function leer(): Promise<FacturaCC[]> {
  const packed = await readStore<string | null>(KEY, null);
  return packed ? unpack<FacturaCC[]>(packed) : [];
}
async function leerGestion(): Promise<Record<string, Gestion>> {
  return (await readStore<Record<string, Gestion> | null>(GKEY, null)) ?? {};
}
async function leerManuales(): Promise<FacturaCC[]> {
  return (await readStore<FacturaCC[] | null>(MANK, null)) ?? [];
}
async function leerClientes(): Promise<Record<string, ClienteCC>> {
  return (await readStore<Record<string, ClienteCC> | null>(CLIK, null)) ?? {};
}
async function leerCobros(): Promise<CobroCC[]> {
  return (await readStore<CobroCC[] | null>(COBK, null)) ?? [];
}
async function leerParams(): Promise<ParamsCC> {
  const p = await readStore<ParamsCC | null>(PKEY, null);
  return { ...PARAMS_DEFAULT, ...(p ?? {}) };
}

export async function GET() {
  const g = await guard("/franquicias");
  if ("res" in g) return g.res;
  const [facturas, manuales, gestion, clientes, cobros, params, meta] = await Promise.all([
    leer(), leerManuales(), leerGestion(), leerClientes(), leerCobros(), leerParams(), readStore<{ actualizado?: string; corte?: string } | null>(META, null),
  ]);
  // Snapshot + facturas manuales; se aplican los cobros registrados (bajan el saldo) y
  // se superpone la gestión. Se devuelve todo crudo para editar.
  const todas = [...facturas, ...manuales.map((m) => ({ ...m, manual: true }))];
  return NextResponse.json({ ok: true, facturas: aplicarGestion(aplicarCobros(todas, cobros), gestion), gestion, clientes, cobros, params, meta });
}

// POST:
//  { facturas } -> reemplaza el snapshot (conserva la gestión), reporta nuevas/cobradas.
//  { params }   -> guarda parámetros.
//  { gestionKey, gestion } -> edita la gestión de una factura (merge).
export async function POST(req: NextRequest) {
  const g = await guard("/franquicias");
  if ("res" in g) return g.res;
  try {
    const body = await req.json();

    if (Array.isArray(body.facturas)) {
      const previas = await leer();
      const nuevas = body.facturas as FacturaCC[];
      const setPrev = new Set(previas.map(gestionKey));
      const setNew = new Set(nuevas.map(gestionKey));
      const agregadas = nuevas.filter((f) => !setPrev.has(gestionKey(f))).length;
      const cobradas = previas.filter((f) => !setNew.has(gestionKey(f))).length; // ya no están = cobradas/dadas de baja
      await writeStore(KEY, pack(nuevas));
      await writeStore(META, { actualizado: new Date().toISOString(), corte: body.corte ?? "", total: nuevas.length });
      return NextResponse.json({ ok: true, total: nuevas.length, agregadas, cobradas });
    }

    if (typeof body.gestionKey === "string" && body.gestion && typeof body.gestion === "object") {
      const cur = await leerGestion();
      const prev = cur[body.gestionKey] ?? {};
      const patch = body.gestion as Gestion;
      const next: Gestion = { ...prev, ...patch };
      // limpiar campos vacíos para no acumular basura
      (Object.keys(next) as (keyof Gestion)[]).forEach((k) => { if (!next[k]) delete next[k]; });
      if (Object.keys(next).length) cur[body.gestionKey] = next; else delete cur[body.gestionKey];
      await writeStore(GKEY, cur);
      return NextResponse.json({ ok: true });
    }

    if (body.manualNueva && typeof body.manualNueva === "object") {
      const f = body.manualNueva as FacturaCC;
      if (!f.cliente || !(f.importe || f.cobrado)) return NextResponse.json({ ok: false, error: "faltan cliente e importe" }, { status: 400 });
      const cur = await leerManuales();
      // Upsert: si ya hay una manual con el mismo comprobante, la reemplaza (no duplica).
      const k = gestionKey(f);
      const sinDup = k ? cur.filter((m) => gestionKey(m) !== k) : cur;
      sinDup.push({ ...f, manual: true });
      await writeStore(MANK, sinDup);
      return NextResponse.json({ ok: true, total: sinDup.length });
    }
    if (body.cobroNuevo && typeof body.cobroNuevo === "object") {
      const c = body.cobroNuevo as CobroCC;
      if (!c.nroFactura || !(Number(c.importe) > 0)) return NextResponse.json({ ok: false, error: "falta comprobante o importe" }, { status: 400 });
      const cur = await leerCobros();
      const id = "c" + Date.now().toString(36) + Math.round(Math.random() * 1e6).toString(36);
      cur.push({ ...c, id, importe: Number(c.importe) });
      await writeStore(COBK, cur);
      return NextResponse.json({ ok: true, id, total: cur.length });
    }
    if (typeof body.borrarCobro === "string") {
      const cur = await leerCobros();
      const next = cur.filter((c) => c.id !== body.borrarCobro);
      await writeStore(COBK, next);
      return NextResponse.json({ ok: true, total: next.length });
    }
    if (body.clienteEstado && typeof body.clienteEstado === "object" && typeof body.clienteEstado.clienteId === "string") {
      const { clienteId, estado, nota, telefono, email } = body.clienteEstado as { clienteId: string } & ClienteCC;
      const cur = await leerClientes();
      const next: ClienteCC = {
        ...(cur[clienteId] ?? {}),
        ...(estado !== undefined ? { estado } : {}), ...(nota !== undefined ? { nota } : {}),
        ...(telefono !== undefined ? { telefono } : {}), ...(email !== undefined ? { email } : {}),
      };
      (Object.keys(next) as (keyof ClienteCC)[]).forEach((k) => { if (!next[k]) delete next[k]; });
      if (Object.keys(next).length) cur[clienteId] = next; else delete cur[clienteId];
      await writeStore(CLIK, cur);
      return NextResponse.json({ ok: true });
    }
    if (typeof body.borrarManual === "string") {
      const cur = await leerManuales();
      const next = cur.filter((f) => gestionKey(f) !== body.borrarManual);
      await writeStore(MANK, next);
      return NextResponse.json({ ok: true, total: next.length });
    }

    if (body.params && typeof body.params === "object") {
      const p: ParamsCC = { ...PARAMS_DEFAULT, ...body.params };
      await writeStore(PKEY, p);
      return NextResponse.json({ ok: true, params: p });
    }
    return NextResponse.json({ ok: false, error: "payload inválido" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}

export async function DELETE() {
  const g = await guard("/franquicias");
  if ("res" in g) return g.res;
  await writeStore(KEY, pack([]));
  await writeStore(META, { actualizado: new Date().toISOString(), total: 0 });
  return NextResponse.json({ ok: true });
}
