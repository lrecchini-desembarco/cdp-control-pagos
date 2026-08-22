"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button, Card, Field, Skeleton, inputClass } from "@/components/ui/primitives";
import { ESTADOS_PC, FLAGS_PC, TIPOS_PC, estadoPC, flagPC, toneCls } from "@/lib/parque";
import ParquePCs, { type EquipoPC } from "@/components/views/ParquePCs";
import RecursosIT from "@/components/views/RecursosIT";

// Inventario de IT en tres pestañas:
//   Inventario -> parque de computadoras en uso (relevamiento por usuario/área)
//   Compras    -> equipos comprados o en proceso de alta (con aprobación del Dueño)
//   Faltantes  -> equipos a reemplazar o puestos sin máquina
type Tab = "inventario" | "compras" | "faltantes" | "disponibles";

const EQUIPO_VACIO = {
  usuario: "", area: "", tipo: "Notebook", hostname: "", marca: "", modelo: "",
  cpu: "", ram: "", almacenamiento: "", gpu: "", so: "", correo: "", observaciones: "",
  estado: "en-uso", ip: "",
};

export default function InventarioView() {
  const params = useSearchParams();
  const [equipos, setEquipos] = useState<EquipoPC[]>([]);
  const [estado, setEstado] = useState<"loading" | "ok" | "error">("loading");
  const [rol, setRol] = useState("");
  // Soporta ?tab=compras (deep-link desde Guardia → "Altas de inventario por aprobar").
  const [tab, setTab] = useState<Tab>((params.get("tab") as Tab) || "inventario");
  const [msg, setMsg] = useState("");
  const [alta, setAlta] = useState(false);
  const [nuevo, setNuevo] = useState(EQUIPO_VACIO);
  const [guardando, setGuardando] = useState(false);

  const esAdmin = rol === "admin";

  async function cargar() {
    setEstado("loading");
    try {
      const j = await (await fetch("/api/inventario/parque")).json();
      if (!j.ok) throw new Error();
      setEquipos(j.equipos);
      setEstado("ok");
    } catch {
      setEstado("error");
    }
  }
  useEffect(() => {
    cargar();
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((j) => { if (j.ok) setRol(j.rol); })
      .catch(() => {});
  }, []);

  async function editar(id: string, patch: Record<string, string>) {
    setMsg("");
    setEquipos((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
    try {
      const j = await (
        await fetch("/api/inventario/parque", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, ...patch }),
        })
      ).json();
      if (j.ok) setEquipos(j.equipos);
      else setMsg(j.error || "No se pudo guardar.");
    } catch {
      setMsg("Error de red.");
    }
  }

  // Alta manual: se pide solo el usuario/puesto; el resto se puede completar después
  // desde el detalle de la fila. Las alertas las calcula el server con los mismos
  // umbrales que el relevamiento.
  async function agregar(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    if (!nuevo.usuario.trim()) return;
    setGuardando(true);
    try {
      const j = await (
        await fetch("/api/inventario/parque", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(nuevo),
        })
      ).json();
      if (!j.ok) throw new Error(j.error);
      setEquipos(j.equipos);
      setNuevo(EQUIPO_VACIO);
      setAlta(false);
    } catch (err) {
      setMsg(err instanceof Error && err.message ? err.message : "No se pudo agregar el equipo.");
    } finally {
      setGuardando(false);
    }
  }

  async function quitar(eq: { id: string; usuario: string }) {
    if (!confirm(`¿Quitar el equipo de "${eq.usuario}" del inventario?`)) return;
    const j = await (await fetch(`/api/inventario/parque?id=${encodeURIComponent(eq.id)}`, { method: "DELETE" })).json();
    if (j.ok) setEquipos(j.equipos);
    else setMsg(j.error || "No se pudo quitar.");
  }

  const campo = (k: keyof typeof EQUIPO_VACIO) => ({
    value: nuevo[k],
    onChange: (ev: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setNuevo((n) => ({ ...n, [k]: ev.target.value })),
  });

  const enUso = useMemo(() => equipos.filter((e) => estadoPC(e.estado).tab === "inventario"), [equipos]);
  const faltantes = useMemo(() => equipos.filter((e) => estadoPC(e.estado).tab === "faltantes"), [equipos]);
  const disponibles = useMemo(() => equipos.filter((e) => estadoPC(e.estado).tab === "disponibles"), [equipos]);

  // Cuántos equipos tiene cada alerta (sobre el parque en uso): es el resumen que
  // mira sistemas para priorizar upgrades.
  const porFlag = useMemo(
    () => FLAGS_PC.map((f) => ({ ...f, total: enUso.filter((e) => e.flags.includes(f.id)).length })).filter((f) => f.total > 0),
    [enUso]
  );

  const tabs: { id: Tab; label: string; total?: number }[] = [
    { id: "inventario", label: "Inventario", total: enUso.length },
    { id: "disponibles", label: "Disponibles", total: disponibles.length },
    { id: "compras", label: "Compras" },
    { id: "faltantes", label: "Faltantes", total: faltantes.length },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[23px] font-semibold tracking-[-.02em] text-[#ece9e2]">Inventario</h1>
          <p className="mt-1 max-w-[640px] text-[12.5px] leading-[1.5] text-ink/55">
            El parque de computadoras por usuario y área, lo que está en proceso de compra y lo que falta reemplazar.
          </p>
        </div>
        {esAdmin && tab === "inventario" && (
          <button
            onClick={() => setAlta((v) => !v)}
            className="shrink-0 rounded border border-action px-3.5 py-[7px] font-display text-[13px] font-semibold text-action transition-colors hover:bg-action/[.12]"
          >
            {alta ? "Cancelar" : "+ Alta de equipo"}
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5 border-b border-ink/10 pb-3">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded border px-3.5 py-1.5 text-[12px] font-medium transition-colors ${
              tab === t.id ? "border-action bg-action/10 text-action" : "border-ink/18 bg-transparent text-ink/60 hover:text-action"
            }`}
          >
            {t.label}
            {t.total !== undefined && <span className="ml-1.5 font-mono tnum opacity-70">{t.total}</span>}
          </button>
        ))}
      </div>

      {msg && <p className="text-2xs text-bad">{msg}</p>}

      {tab === "compras" ? (
        <RecursosIT rol={rol} />
      ) : estado === "loading" ? (
        <Card className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</Card>
      ) : estado === "error" ? (
        <Card className="p-4 text-sm text-bad">No se pudo cargar el parque de computadoras.</Card>
      ) : tab === "inventario" ? (
        <>
          {esAdmin && alta && (
            <Card className="p-4">
              <p className="text-2xs font-medium uppercase tracking-wide text-faint">Agregar equipo a mano</p>
              {alta && (
                <form onSubmit={agregar} className="mt-3 space-y-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Field label="Usuario o puesto *">
                      <input className={inputClass} placeholder="Ej: Sabrina · Caja Berisso" {...campo("usuario")} />
                    </Field>
                    <Field label="Área / local">
                      <input className={inputClass} placeholder="Administración, Sistemas…" {...campo("area")} />
                    </Field>
                    <Field label="Tipo">
                      <select className={inputClass} {...campo("tipo")}>
                        {TIPOS_PC.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </Field>
                    <Field label="Estado">
                      <select className={inputClass} {...campo("estado")}>
                        {ESTADOS_PC.map((e2) => <option key={e2.id} value={e2.id}>{e2.label}</option>)}
                      </select>
                    </Field>
                    <Field label="Hostname"><input className={inputClass} {...campo("hostname")} /></Field>
                    <Field label="IP asignada" hint="Si ya se le asignó una IP fija"><input className={inputClass} placeholder="192.168.1.—" {...campo("ip")} /></Field>
                    <Field label="Marca"><input className={inputClass} placeholder="DELL, Lenovo, HP…" {...campo("marca")} /></Field>
                    <Field label="Modelo"><input className={inputClass} placeholder="Inspiron 15 3535" {...campo("modelo")} /></Field>
                    <Field label="CPU"><input className={inputClass} placeholder="Intel Core i5-1335U" {...campo("cpu")} /></Field>
                    <Field label="RAM"><input className={inputClass} placeholder="16 GB" {...campo("ram")} /></Field>
                    <Field label="Almacenamiento"><input className={inputClass} placeholder="512 GB SSD" {...campo("almacenamiento")} /></Field>
                    <Field label="SO"><input className={inputClass} placeholder="Windows 11 Pro" {...campo("so")} /></Field>
                    <Field label="Correo"><input className={inputClass} placeholder="usuario@eldesembarco.com" {...campo("correo")} /></Field>
                  </div>
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="min-w-[260px] flex-1">
                      <Field label="Observaciones">
                        <input className={inputClass} placeholder="Cuenta local, monitor, acta firmada…" {...campo("observaciones")} />
                      </Field>
                    </div>
                    <Button type="submit" disabled={!nuevo.usuario.trim() || guardando}>
                      {guardando ? "Guardando…" : "Agregar"}
                    </Button>
                  </div>
                  <p className="text-2xs text-faint">
                    Con la RAM, el disco y las observaciones el sistema calcula solo las alertas (RAM baja, SSD chico,
                    cuenta local…). Podés dejar campos vacíos y completarlos después desde el detalle de la fila.
                  </p>
                </form>
              )}
            </Card>
          )}

          {porFlag.length > 0 && (
            <Card className="flex flex-wrap items-center gap-2 p-3">
              <span className="text-2xs uppercase tracking-wide text-faint">A revisar</span>
              {porFlag.map((f) => (
                <span key={f.id} title={f.desc} className={`rounded-full border px-2.5 py-1 text-2xs font-medium ${toneCls(f.tone)}`}>
                  {f.label} · {f.total}
                </span>
              ))}
            </Card>
          )}
          <ParquePCs
            equipos={enUso}
            esAdmin={esAdmin}
            onEditar={editar}
            onQuitar={quitar}
            vacio={{ title: "Sin equipos cargados", desc: "Corré el seed del relevamiento (ver docs/inventario.md)." }}
          />
        </>
      ) : tab === "disponibles" ? (
        <>
          <Card className="p-3 text-2xs text-muted">
            Equipos y dispositivos <b className="font-medium text-ink">sin asignar</b>: PCs y notebooks
            <b className="font-medium text-ink"> disponibles</b> para entregar, y lo que está <b className="font-medium text-ink">en reparación</b>.
          </Card>
          <ParquePCs
            equipos={disponibles}
            esAdmin={esAdmin}
            onEditar={editar}
            onQuitar={quitar}
            vacio={{ title: "Sin equipos disponibles", desc: "No hay equipos marcados como disponibles ni en reparación." }}
          />
        </>
      ) : (
        <>
          <Card className="p-3 text-2xs text-muted">
            Equipos marcados <b className="font-medium text-ink">A reemplazar</b> o puestos <b className="font-medium text-ink">Sin equipo</b>.
            Cuando se pide el reemplazo, cargalo en <b className="font-medium text-ink">Compras</b> para que quede la aprobación.
          </Card>
          <ParquePCs
            equipos={faltantes}
            esAdmin={esAdmin}
            onEditar={editar}
            onQuitar={quitar}
            vacio={{ title: "No falta nada", desc: "Ningún equipo está marcado para reemplazo ni hay puestos sin máquina." }}
          />
        </>
      )}

      {tab === "inventario" && esAdmin && (
        <p className="text-2xs text-faint">
          Las alertas ({FLAGS_PC.map((f) => flagPC(f.id).label).join(" · ")}) salen del relevamiento; se recalculan al correr el seed.
        </p>
      )}
    </div>
  );
}
