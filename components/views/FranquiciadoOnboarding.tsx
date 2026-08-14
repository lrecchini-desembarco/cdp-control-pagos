"use client";

import { useState } from "react";
import { PUESTOS } from "@/lib/roles";

// Onboarding del franquiciado: en su primer ingreso elige marca, local y puesto.
// Al guardar, el server marca el perfil y lo deja entrar a los tutoriales.
export default function FranquiciadoOnboarding({ email }: { email: string }) {
  const [marca, setMarca] = useState("");
  const [local, setLocal] = useState("");
  const [puesto, setPuesto] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!marca || !local.trim() || !puesto) { setError("Completá marca, local y puesto."); return; }
    setGuardando(true);
    try {
      const r = await fetch("/api/franquiciado", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marca, local: local.trim(), puesto }),
      });
      const j = await r.json();
      if (!j.ok) { setError(j.error || "No se pudo guardar."); setGuardando(false); return; }
      // Recargar: el layout ya deja pasar (perfil completo) y cae en los tutoriales.
      window.location.href = "/tutoriales/tango";
    } catch (err) {
      setError(String(err));
      setGuardando(false);
    }
  }

  const input = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-action";

  return (
    <div className="grid min-h-screen place-items-center bg-paper px-4">
      <div className="w-full max-w-sm rounded-card border border-line bg-surface p-6">
        <div className="mb-5 flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-sidebar font-display text-sm font-bold text-white">DS</div>
          <div className="leading-tight">
            <p className="font-display text-sm font-semibold text-ink">Bienvenido</p>
            <p className="text-2xs text-faint">{email}</p>
          </div>
        </div>
        <p className="mb-4 text-sm text-muted">Antes de entrar, contanos dónde trabajás. Con esto vas a ver los tutoriales que te corresponden.</p>

        <form onSubmit={guardar} className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-2xs font-medium uppercase tracking-wide text-faint">Marca</span>
            <select value={marca} onChange={(e) => setMarca(e.target.value)} className={input}>
              <option value="">Elegí…</option>
              <option value="Desembarco">El Desembarco</option>
              <option value="Mr Tasty">Mr Tasty</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-2xs font-medium uppercase tracking-wide text-faint">Local</span>
            <input value={local} onChange={(e) => setLocal(e.target.value)} placeholder="Ej: Villa Crespo" className={input} />
          </label>
          <label className="block">
            <span className="mb-1 block text-2xs font-medium uppercase tracking-wide text-faint">Puesto</span>
            <select value={puesto} onChange={(e) => setPuesto(e.target.value)} className={input}>
              <option value="">Elegí…</option>
              {PUESTOS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </label>

          {error && <p className="text-2xs text-bad">{error}</p>}

          <button type="submit" disabled={guardando}
            className="w-full rounded-lg bg-action px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-action-700 disabled:opacity-40">
            {guardando ? "Guardando…" : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
