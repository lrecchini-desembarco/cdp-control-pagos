"use client";

// Panel de Sistemas. Arranca con lo concreto que se pidió: quién tiene acceso
// a esta pantalla y un lugar para sumar gente sin tocar código. El resto del
// panel (salud en vivo, pendientes, accesos directos) se agrega en una próxima
// vuelta, sobre el wireframe ya acordado.

import { useEffect, useState } from "react";
import { Card, Button, inputClass } from "@/components/ui/primitives";

interface Acceso {
  base: string[];
  extra: string[];
}

export default function PanelSistemasView() {
  const [acceso, setAcceso] = useState<Acceso>({ base: [], extra: [] });
  const [estado, setEstado] = useState<"loading" | "ok" | "error">("loading");
  const [nuevo, setNuevo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState("");

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

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-xl font-semibold text-ink">Panel de Sistemas</h1>
        <p className="mt-0.5 max-w-2xl text-sm text-muted">
          Todo lo que sistemas necesita resolver, en un solo lugar. Acceso restringido: no depende del rol
          sino de una lista de emails puntual.
        </p>
      </div>

      <Card className="p-4">
        <p className="text-2xs font-medium uppercase tracking-wide text-faint">Quién tiene acceso</p>
        <p className="mt-1 text-2xs text-muted">
          {acceso.base.length > 0 && (
            <>Fijos (vienen del código, no se sacan desde acá): {acceso.base.join(", ")}.</>
          )}
        </p>

        {estado === "loading" ? (
          <p className="mt-3 text-2xs text-faint">Cargando…</p>
        ) : estado === "error" ? (
          <p className="mt-3 text-2xs text-bad">No se pudo cargar la lista.</p>
        ) : (
          <div className="mt-3 space-y-1.5">
            {acceso.extra.length === 0 ? (
              <p className="text-2xs text-faint">Nadie agregado todavía además de los fijos.</p>
            ) : (
              acceso.extra.map((correo) => (
                <div key={correo} className="flex items-center justify-between gap-3 rounded-lg border border-line bg-ink/[0.015] px-3 py-1.5">
                  <span className="text-2xs text-ink">{correo}</span>
                  <button onClick={() => quitar(correo)} className="text-2xs font-medium text-bad hover:underline">
                    Quitar
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        <form onSubmit={agregar} className="mt-3 flex flex-wrap items-end gap-2">
          <div className="min-w-[220px] flex-1">
            <input
              type="email"
              className={inputClass}
              placeholder="nombre@eldesembarco.com"
              value={nuevo}
              onChange={(e) => setNuevo(e.target.value)}
              autoComplete="off"
            />
          </div>
          <Button type="submit" disabled={!nuevo.trim() || guardando}>
            {guardando ? "Agregando…" : "+ Dar acceso"}
          </Button>
        </form>
        {msg && <p className="mt-2 text-2xs text-bad">{msg}</p>}
        <p className="mt-2 text-2xs text-faint">
          Le da acceso a esta pantalla y al botón "Panel de sistemas" del topbar. No cambia el rol de la
          cuenta ni le da acceso a nada más de la app.
        </p>
      </Card>

      <Card className="border-line/70 bg-ink/[0.015] p-4 text-2xs text-faint">
        Próximamente en esta pantalla: salud del sistema en vivo, pendientes accionables (usuarios sin rol,
        compras por aprobar, alertas activas, rollout de IPs) y accesos directos.
      </Card>
    </div>
  );
}
