"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card, Field, inputClass, Button, Badge, Skeleton, EmptyState, ErrorState } from "@/components/ui/primitives";
import { emailValido, type BienvenidaConfig, type NuevoIngreso } from "@/lib/nuevos-ingresos";

// Clave inicial legible: 8 caracteres sin ambiguos (0/O, 1/l/I), con mayúscula, minúscula y dígito.
const ALFA = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const alfa = "abcdefghijkmnpqrstuvwxyz";
const NUM = "23456789";
function generarClave(): string {
  const todo = ALFA + alfa + NUM;
  const pick = (s: string) => s[Math.floor(Math.random() * s.length)];
  let c = pick(ALFA) + pick(alfa) + pick(NUM);
  for (let i = 0; i < 5; i++) c += pick(todo);
  return c.split("").sort(() => Math.random() - 0.5).join("");
}

const fechaTxt = (iso?: string) => {
  if (!iso) return "—";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
};

type Form = { id?: string; nombre: string; email: string; clave: string; puesto: string; fechaIngreso: string };
const FORM_VACIO: Form = { nombre: "", email: "", clave: "", puesto: "", fechaIngreso: "" };

export default function BienvenidaView() {
  const [ingresos, setIngresos] = useState<NuevoIngreso[]>([]);
  const [config, setConfig] = useState<BienvenidaConfig>({ empresa: "El Desembarco", texto: "" });
  const [puedeEditar, setPuedeEditar] = useState(false);
  const [estado, setEstado] = useState<"loading" | "ok" | "error">("loading");
  const [err, setErr] = useState("");
  const [form, setForm] = useState<Form>(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [formError, setFormError] = useState("");
  const [preview, setPreview] = useState<NuevoIngreso | null>(null);
  const [verConfig, setVerConfig] = useState(false);
  const [toast, setToast] = useState("");
  const formRef = useRef<HTMLDivElement>(null);

  const avisar = (t: string) => { setToast(t); setTimeout(() => setToast(""), 2500); };

  async function cargar() {
    setEstado("loading"); setErr("");
    try {
      const j = await (await fetch("/api/nuevos-ingresos")).json();
      if (!j.ok) throw new Error(j.error || "No se pudo cargar.");
      setIngresos(j.ingresos); setConfig(j.config); setPuedeEditar(!!j.puedeEditar); setEstado("ok");
    } catch (e) { setErr(e instanceof Error ? e.message : "Error."); setEstado("error"); }
  }
  useEffect(() => { cargar(); }, []);

  const editando = !!form.id;
  const setF = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));

  function editar(i: NuevoIngreso) {
    setForm({ id: i.id, nombre: i.nombre, email: i.email, clave: i.clave, puesto: i.puesto ?? "", fechaIngreso: i.fechaIngreso ?? "" });
    setFormError("");
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function guardar() {
    setFormError("");
    if (!form.email.trim() || !form.clave.trim()) return setFormError("El email y la clave son obligatorios.");
    if (!emailValido(form.email)) return setFormError("El email no tiene un formato válido.");
    setGuardando(true);
    try {
      const j = await (await fetch("/api/nuevos-ingresos", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ingreso: { ...form } }),
      })).json();
      if (!j.ok) throw new Error(j.error || "No se pudo guardar.");
      setIngresos(j.ingresos);
      const guardado = j.ingresos.find((x: NuevoIngreso) => (form.id ? x.id === form.id : x.email === form.email.trim()));
      setForm(FORM_VACIO);
      avisar(editando ? "Ingreso actualizado ✓" : "Ingreso guardado ✓");
      if (guardado) setPreview(guardado); // abre la vista previa para imprimir
    } catch (e) { setFormError(e instanceof Error ? e.message : "Error."); }
    finally { setGuardando(false); }
  }

  async function eliminar(i: NuevoIngreso) {
    if (!confirm(`¿Eliminar el ingreso de ${i.nombre || i.email}? No se puede deshacer.`)) return;
    try {
      const j = await (await fetch(`/api/nuevos-ingresos?id=${encodeURIComponent(i.id)}`, { method: "DELETE" })).json();
      if (!j.ok) throw new Error(j.error || "No se pudo eliminar.");
      setIngresos(j.ingresos);
      if (form.id === i.id) setForm(FORM_VACIO);
      avisar("Ingreso eliminado");
    } catch (e) { avisar(e instanceof Error ? e.message : "Error"); }
  }

  const copiar = (txt: string, msg = "Copiado ✓") => { navigator.clipboard?.writeText(txt).then(() => avisar(msg)).catch(() => avisar("No pude copiar")); };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold text-ink">Bienvenida · Nuevo ingreso</h1>
          <p className="mt-0.5 max-w-2xl text-sm text-muted">
            Cargá a un nuevo integrante, guardá sus datos de acceso y generá una <b>tarjeta de bienvenida imprimible</b> con su email y clave para entregarle.
          </p>
        </div>
        {puedeEditar && <Button variant="outline" onClick={() => setVerConfig((v) => !v)}>{verConfig ? "Cerrar personalización" : "Personalizar tarjeta"}</Button>}
      </div>

      {verConfig && puedeEditar && <ConfigEditor config={config} onGuardado={(c) => { setConfig(c); avisar("Tarjeta actualizada ✓"); }} />}

      {/* Formulario de alta / edición */}
      <Card className="p-4" >
        <div ref={formRef} className="scroll-mt-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-2xs font-medium uppercase tracking-wide text-faint">{editando ? "Editar ingreso" : "Nuevo ingreso"}</p>
            {editando && <button onClick={() => { setForm(FORM_VACIO); setFormError(""); }} className="text-2xs text-muted hover:text-ink">Cancelar edición</button>}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Nombre y apellido"><input className={inputClass} value={form.nombre} onChange={(e) => setF({ nombre: e.target.value })} placeholder="Ej. Ana Pérez" /></Field>
            <Field label="Puesto o área (opcional)"><input className={inputClass} value={form.puesto} onChange={(e) => setF({ puesto: e.target.value })} placeholder="Ej. Cajera · Local Flores" /></Field>
            <Field label="Email *"><input className={inputClass} type="email" value={form.email} onChange={(e) => setF({ email: e.target.value })} placeholder="nombre@eldesembarco.com" /></Field>
            <Field label="Fecha de ingreso (opcional)"><input className={inputClass} type="date" value={form.fechaIngreso} onChange={(e) => setF({ fechaIngreso: e.target.value })} /></Field>
            <div className="sm:col-span-2">
              <Field label="Clave *">
                <div className="flex gap-2">
                  <input className={`${inputClass} font-mono`} value={form.clave} onChange={(e) => setF({ clave: e.target.value })} placeholder="clave inicial" />
                  <Button type="button" variant="outline" onClick={() => setF({ clave: generarClave() })} title="Generar una clave">Generar</Button>
                  <Button type="button" variant="outline" onClick={() => form.clave && copiar(form.clave, "Clave copiada ✓")} disabled={!form.clave} title="Copiar la clave">Copiar</Button>
                </div>
              </Field>
              <p className="mt-1 text-2xs text-faint">La clave es la inicial: el empleado la cambia en su primer ingreso.</p>
            </div>
          </div>
          {formError && <p className="mt-3 text-sm text-bad">{formError}</p>}
          <div className="mt-4 flex items-center justify-end gap-2">
            {form.email && form.clave && <Button variant="outline" onClick={() => { const prev: NuevoIngreso = { id: form.id ?? "preview", nombre: form.nombre, email: form.email, clave: form.clave, puesto: form.puesto || undefined, fechaIngreso: form.fechaIngreso || undefined, creado: new Date().toISOString() }; setPreview(prev); }}>Vista previa</Button>}
            <Button onClick={guardar} disabled={guardando}>{guardando ? "Guardando…" : editando ? "Guardar cambios" : "Guardar ingreso"}</Button>
          </div>
        </div>
      </Card>

      {/* Listado */}
      <Card className="overflow-hidden">
        {estado === "loading" ? (
          <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
        ) : estado === "error" ? (
          <div className="p-4"><ErrorState msg={err} onRetry={cargar} /></div>
        ) : ingresos.length === 0 ? (
          <div className="p-6"><EmptyState title="Sin ingresos cargados" desc="Cargá el primero con el formulario de arriba." /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-2xs uppercase tracking-wide text-faint">
                  <th className="px-4 py-2 font-medium">Nombre</th>
                  <th className="px-3 py-2 font-medium">Email</th>
                  <th className="px-3 py-2 font-medium">Puesto / área</th>
                  <th className="px-3 py-2 font-medium">Ingreso</th>
                  <th className="px-3 py-2 text-right font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {ingresos.map((i) => (
                  <tr key={i.id} className="border-b border-line last:border-0 hover:bg-ink/5">
                    <td className="px-4 py-2">
                      <div className="font-medium text-ink">{i.nombre || <span className="text-faint">(sin nombre)</span>}</div>
                    </td>
                    <td className="px-3 py-2 text-muted">{i.email}</td>
                    <td className="px-3 py-2 text-muted">{i.puesto || <span className="text-faint">—</span>}</td>
                    <td className="px-3 py-2 text-muted tnum">{fechaTxt(i.fechaIngreso)}</td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1.5 text-2xs">
                        <button onClick={() => setPreview(i)} className="rounded-md px-2 py-1 font-medium text-action hover:bg-action/10">Ver</button>
                        <button onClick={() => editar(i)} className="rounded-md px-2 py-1 font-medium text-ink hover:bg-ink/5">Editar</button>
                        <button onClick={() => setPreview(i)} className="rounded-md px-2 py-1 font-medium text-ink hover:bg-ink/5">Reimprimir</button>
                        <button onClick={() => eliminar(i)} className="rounded-md px-2 py-1 font-medium text-bad hover:bg-bad/5">Eliminar</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {preview && <PreviewModal ingreso={preview} config={config} onClose={() => setPreview(null)} onCopiar={copiar} />}
      {toast && <div className="no-print fixed bottom-5 right-5 z-[60] rounded-lg border border-ok/20 bg-ok/10 px-4 py-2 text-sm text-ok shadow-lg">{toast}</div>}
    </div>
  );
}

function ConfigEditor({ config, onGuardado }: { config: BienvenidaConfig; onGuardado: (c: BienvenidaConfig) => void }) {
  const [empresa, setEmpresa] = useState(config.empresa);
  const [texto, setTexto] = useState(config.texto);
  const [guardando, setGuardando] = useState(false);
  async function guardar() {
    setGuardando(true);
    try {
      const j = await (await fetch("/api/nuevos-ingresos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ config: { empresa, texto } }) })).json();
      if (j.ok) onGuardado(j.config);
    } finally { setGuardando(false); }
  }
  return (
    <Card className="border-action/40 bg-action/[0.03] p-4">
      <p className="mb-3 text-2xs font-medium uppercase tracking-wide text-faint">Personalizar la tarjeta</p>
      <div className="grid grid-cols-1 gap-3">
        <Field label="Nombre de la empresa"><input className={inputClass} value={empresa} onChange={(e) => setEmpresa(e.target.value)} /></Field>
        <Field label="Texto de bienvenida">
          <textarea className={`${inputClass} h-24 resize-none`} value={texto} onChange={(e) => setTexto(e.target.value)} />
        </Field>
      </div>
      <div className="mt-3 flex justify-end"><Button onClick={guardar} disabled={guardando}>{guardando ? "Guardando…" : "Guardar texto"}</Button></div>
    </Card>
  );
}

// Logo institucional: si existe /logos/el-desembarco.svg (o .png) lo usa; si no, un
// monograma con las iniciales (placeholder fácil de reemplazar: subís el archivo y listo).
// Se chequea por content-type porque un asset faltante redirige a HTML (no da 404 limpio),
// y ahí el onError de <img> no dispara confiable.
function LogoEmpresa({ empresa }: { empresa: string }) {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancel = false;
    (async () => {
      for (const url of ["/logos/el-desembarco.svg", "/logos/el-desembarco.png"]) {
        try {
          const res = await fetch(url);
          if (res.ok && (res.headers.get("content-type") || "").startsWith("image")) { if (!cancel) setLogoUrl(url); return; }
        } catch { /* seguimos con el siguiente */ }
      }
    })();
    return () => { cancel = true; };
  }, []);
  if (logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logoUrl} alt={empresa} className="mx-auto h-14 w-auto object-contain" />;
  }
  const iniciales = empresa.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "DS";
  return <div className="mx-auto grid h-14 w-14 place-items-center rounded-xl bg-action font-display text-xl font-semibold text-white">{iniciales}</div>;
}

function PreviewModal({ ingreso, config, onClose, onCopiar }: { ingreso: NuevoIngreso; config: BienvenidaConfig; onClose: () => void; onCopiar: (t: string, m?: string) => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-md overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {/* Tarjeta A5 imprimible */}
        <div id="print-area" className="rounded-card border border-line bg-surface p-8 text-center shadow-lg">
          <LogoEmpresa empresa={config.empresa} />
          <h2 className="mt-4 font-display text-2xl font-semibold text-ink">Bienvenida a {config.empresa}</h2>
          {ingreso.nombre && <p className="mt-1 text-sm text-muted">{ingreso.nombre}{ingreso.puesto ? ` · ${ingreso.puesto}` : ""}</p>}
          <p className="mx-auto mt-4 max-w-sm text-sm leading-relaxed text-muted">{config.texto}</p>

          <div className="mt-6 rounded-card border border-action/30 bg-action/[0.05] p-4 text-left">
            <p className="text-2xs font-medium uppercase tracking-wide text-action">Tus datos de acceso</p>
            <div className="mt-2 space-y-2">
              <div>
                <p className="text-2xs uppercase tracking-wide text-faint">Email</p>
                <p className="font-mono text-base text-ink">{ingreso.email}</p>
              </div>
              <div>
                <p className="text-2xs uppercase tracking-wide text-faint">Clave</p>
                <p className="font-mono text-lg font-semibold text-ink">{ingreso.clave}</p>
              </div>
            </div>
          </div>

          {ingreso.fechaIngreso && <p className="mt-4 text-2xs text-faint">Fecha de ingreso: {fechaTxt(ingreso.fechaIngreso)}</p>}
        </div>

        {/* Controles (no se imprimen) */}
        <div className="no-print mt-3 flex flex-wrap items-center justify-end gap-2">
          <Button variant="outline" onClick={() => onCopiar(ingreso.clave, "Clave copiada ✓")}>Copiar clave</Button>
          <Button variant="outline" onClick={() => onCopiar(`Email: ${ingreso.email}\nClave: ${ingreso.clave}`, "Datos copiados ✓")}>Copiar email + clave</Button>
          <Button onClick={() => window.print()}>Imprimir</Button>
          <Button variant="ghost" onClick={onClose}>Cerrar</Button>
        </div>
      </div>
    </div>
  );
}
