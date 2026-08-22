"use client";

// "Guardia" — pantalla de Inicio del Panel de Sistemas: qué hay que atender
// hoy, antes de entrar a cualquier sección, más quién puede entrar al panel
// entero (funcionalidad original de esta vista, sin cambios de lógica).

import Link from "next/link";
import { useEffect, useState } from "react";
import { inputClass } from "@/components/ui/primitives";

interface Acceso {
  base: string[];
  extra: string[];
}
interface Resumen {
  ticketsAbiertos: number;
  esperandoUsuario: number;
  resueltosSemana: number;
  sinRol: number;
  altasPendientes: number;
  fuentesMock: number;
  ipsSinDocumentar: number;
}
interface Pendiente {
  n: number;
  titulo: string;
  detalle: string;
  accion: string;
  href: string;
}

export default function PanelSistemasView() {
  const [acceso, setAcceso] = useState<Acceso>({ base: [], extra: [] });
  const [estado, setEstado] = useState<"loading" | "ok" | "error">("loading");
  const [nuevo, setNuevo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState("");

  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [medianaHoras, setMedianaHoras] = useState<number | null>(null);
  const [bridge, setBridge] = useState<"checking" | "online" | "offline">("checking");

  async function cargar() {
    setEstado("loading");
    try {
      const j = await (await fetch("/api/panel-sistemas/usuarios")).json();
      if (!j.ok) throw new Error();
      setAcceso({ base: j.base, extra: j.extra });
      setEstado("ok");
    } catch {
      setEstado("error");
    }
  }
  useEffect(() => {
    cargar();
  }, []);

  useEffect(() => {
    let vivo = true;
    fetch("/api/panel-sistemas/resumen")
      .then((r) => r.json())
      .then((j) => vivo && j.ok && setResumen(j))
      .catch(() => {});
    fetch("/api/raven?code=050027&date=2026-06-25")
      .then((r) => vivo && setBridge(r.ok ? "online" : "offline"))
      .catch(() => vivo && setBridge("offline"));
    // Mediana real de tiempo de resolución de la semana (no hay este dato
    // precalculado en /resumen; se saca acá de los tickets ya resueltos).
    fetch("/api/tickets")
      .then((r) => r.json())
      .then((j) => {
        if (!vivo || !j.ok) return;
        const hace7d = Date.now() - 7 * 86_400_000;
        const horas = j.items
          .filter((t: any) => (t.estado === "resuelto" || t.estado === "cerrado") && Date.parse(t.actualizado) >= hace7d)
          .map((t: any) => (Date.parse(t.actualizado) - Date.parse(t.creado)) / 3_600_000)
          .sort((a: number, b: number) => a - b);
        if (horas.length) setMedianaHoras(horas[Math.floor(horas.length / 2)]);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, []);

  async function agregar(e: React.FormEvent) {
    e.preventDefault();
    if (!nuevo.trim()) return;
    setGuardando(true);
    setMsg("");
    try {
      const j = await (
        await fetch("/api/panel-sistemas/usuarios", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: nuevo }),
        })
      ).json();
      if (!j.ok) throw new Error(j.error);
      setAcceso((a) => ({ ...a, extra: j.extra }));
      setNuevo("");
    } catch (err) {
      setMsg(err instanceof Error && err.message ? err.message : "No se pudo agregar.");
    } finally {
      setGuardando(false);
    }
  }

  async function quitar(correo: string) {
    if (!confirm(`¿Quitarle el acceso al Panel de Sistemas a ${correo}?`)) return;
    setMsg("");
    try {
      const j = await (await fetch(`/api/panel-sistemas/usuarios?email=${encodeURIComponent(correo)}`, { method: "DELETE" })).json();
      if (!j.ok) throw new Error(j.error);
      setAcceso((a) => ({ ...a, extra: j.extra }));
    } catch (err) {
      setMsg(err instanceof Error && err.message ? err.message : "No se pudo quitar.");
    }
  }

  const pendientes: Pendiente[] = resumen
    ? [
        { n: resumen.sinRol, titulo: "Cuentas sin rol asignado", detalle: "No ven nada del CDP hasta que alguien las clasifique", accion: "Asignar", href: "/panel-sistemas/usuarios" },
        { n: resumen.altasPendientes, titulo: "Altas de inventario por aprobar", detalle: "Notebooks y monitores cargados esta semana", accion: "Revisar", href: "/panel-sistemas/inventario?tab=compras" },
        { n: resumen.fuentesMock, titulo: "Fuentes de datos en mock", detalle: "Pedidos y precios sin token: el Cruce muestra desvíos irreales", accion: "Ver salud", href: "/panel-sistemas/estado" },
        { n: resumen.esperandoUsuario, titulo: "Tickets esperando al usuario", detalle: "Sin respuesta del solicitante", accion: "Recordar", href: "/panel-sistemas/tickets?estado=espera" },
        { n: resumen.ipsSinDocumentar, titulo: "Rangos de IP sin documentar", detalle: "Sin VLAN/subred cargada", accion: "Completar", href: "/panel-sistemas/ip-libres" },
      ]
    : [];

  return (
    <div className="space-y-0">
      <div>
        <h1 className="font-display text-[23px] font-semibold tracking-[-.02em] text-[#ece9e2]">Guardia</h1>
        <p className="mt-1 max-w-[640px] text-[12.5px] leading-[1.5] text-ink/55">
          Lo que hay que atender hoy, antes de entrar a cualquier pestaña. Nada de esto está en el CDP: acá
          empieza y termina el trabajo de sistemas.
        </p>
      </div>

      <div className="mt-[18px] grid grid-cols-3 border-t border-action/30 border-b border-ink/10">
        <div className="border-r border-ink/8 px-4 py-3.5">
          <p className="font-mono text-[9.5px] uppercase tracking-[.16em] text-action">Cola</p>
          <p className="tnum font-mono text-[28px] text-[#ece9e2]">{resumen ? resumen.ticketsAbiertos : "—"}</p>
          <p className="mt-0.5 text-[11.5px] text-ink/50">
            tickets abiertos{resumen ? ` · ${resumen.esperandoUsuario} esperan al usuario` : ""}
          </p>
        </div>
        <div className="border-r border-ink/8 px-4 py-3.5">
          <p className="font-mono text-[9.5px] uppercase tracking-[.16em] text-action">Semana</p>
          <p className="tnum font-mono text-[28px] text-ok">{resumen ? resumen.resueltosSemana : "—"}</p>
          <p className="mt-0.5 text-[11.5px] text-ink/50">
            resueltos{medianaHoras !== null ? ` · mediana ${medianaHoras.toFixed(0)} h` : ""}
          </p>
        </div>
        <div className="px-4 py-3.5">
          <p className="font-mono text-[9.5px] uppercase tracking-[.16em] text-action">Infra</p>
          <p className="tnum font-mono text-[28px] text-warn">{resumen ? resumen.fuentesMock : "—"}</p>
          <p className="mt-0.5 text-[11.5px] text-ink/50">
            fuentes en mock · bridge {bridge === "online" ? "OK" : bridge === "offline" ? "caído" : "…"}
          </p>
        </div>
      </div>

      <div className="mt-[26px] grid grid-cols-1 gap-[26px] min-[1100px]:grid-cols-[1.35fr_1fr]">
        <div>
          <p className="mb-1 font-mono text-[9.5px] uppercase tracking-[.16em] text-ink/40">Pendientes accionables</p>
          <div className="border-t border-ink/10">
            {!resumen ? (
              <p className="py-4 text-[12px] text-ink/40">Cargando…</p>
            ) : (
              pendientes.map((p) => (
                <div key={p.titulo} className="flex items-center gap-3 border-b border-ink/7 py-[11px] hover:bg-ink/[.035]">
                  <span className="tnum w-8 shrink-0 text-right font-mono text-[15px] text-action">{p.n}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-[13.5px] font-semibold text-[#ece9e2]">{p.titulo}</p>
                    <p className="truncate text-[11px] text-ink/45">{p.detalle}</p>
                  </div>
                  <Link
                    href={p.href}
                    className="shrink-0 rounded border border-ink/20 px-2.5 py-1 text-[11px] text-ink/70 transition-colors hover:border-action/60 hover:text-action"
                  >
                    {p.accion}
                  </Link>
                </div>
              ))
            )}
          </div>
        </div>

        <div>
          <p className="mb-1 font-mono text-[9.5px] uppercase tracking-[.16em] text-ink/40">Quién entra a la consola</p>
          <div className="rounded border border-ink/12 p-3.5">
            <p className="text-[11.5px] text-ink/50">Lista puntual, no depende del rol de la cuenta en el CDP.</p>
            {acceso.base.length > 0 && (
              <p className="mt-1.5 text-[11px] text-ink/40">Fijos (código): {acceso.base.join(", ")}</p>
            )}

            {estado === "loading" ? (
              <p className="mt-3 text-[11.5px] text-ink/40">Cargando…</p>
            ) : estado === "error" ? (
              <p className="mt-3 text-[11.5px] text-bad">No se pudo cargar la lista.</p>
            ) : (
              <div className="mt-3 space-y-1.5">
                {acceso.extra.length === 0 ? (
                  <p className="text-[11.5px] text-ink/40">Nadie agregado todavía además de los fijos.</p>
                ) : (
                  acceso.extra.map((correo) => (
                    <div key={correo} className="flex items-center justify-between gap-3 rounded border border-ink/12 px-2.5 py-1.5">
                      <span className="text-[11.5px] text-ink/85">{correo}</span>
                      <button onClick={() => quitar(correo)} className="text-[11px] font-medium text-bad hover:underline">
                        Quitar
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}

            <form onSubmit={agregar} className="mt-3 flex flex-wrap items-end gap-2">
              <input
                type="email"
                className={`${inputClass} min-w-[180px] flex-1`}
                placeholder="nombre@eldesembarco.com"
                value={nuevo}
                onChange={(e) => setNuevo(e.target.value)}
                autoComplete="off"
              />
              <button
                type="submit"
                disabled={!nuevo.trim() || guardando}
                className="shrink-0 rounded border border-action px-3 py-2 text-[12px] font-semibold text-action transition-colors hover:bg-action/[.12] disabled:opacity-40"
              >
                {guardando ? "Agregando…" : "Dar acceso"}
              </button>
            </form>
            {msg && <p className="mt-2 text-[11px] text-bad">{msg}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
