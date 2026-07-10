"use client";

import { useState } from "react";
import { Button, Card, Field, inputClass } from "@/components/ui/primitives";

const ERRORES: Record<string, string> = {
  google_no_config: "El acceso con Google todavía no está configurado. Avisá al administrador.",
  dominio: "Esa cuenta no es de El Desembarco. Entrá con tu cuenta @eldesembarco.com.",
  state: "Se venció el intento de ingreso. Probá de nuevo.",
  google: "No se pudo completar el acceso con Google. Probá de nuevo.",
};

function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.83.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.47.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  );
}

export default function LoginForm({ error }: { error?: string }) {
  const [mostrarClave, setMostrarClave] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(error ? ERRORES[error] ?? "No se pudo ingresar." : "");

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error ?? "No se pudo ingresar.");
      window.location.href = j.redirect ?? "/";
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Error al ingresar.");
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-paper px-4">
      <Card className="w-full max-w-sm p-6">
        <div className="mb-5 flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-sidebar font-display text-sm font-bold text-white">
            DS
          </div>
          <div className="leading-tight">
            <p className="font-display text-sm font-semibold text-ink">CDP · Control</p>
            <p className="text-2xs text-faint">DS Group</p>
          </div>
        </div>

        <p className="mb-4 text-sm text-muted">Ingresá con tu cuenta de El Desembarco.</p>

        {/* Acceso con Google */}
        <a
          href="/api/auth/google/start"
          className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-ink/5"
        >
          <GoogleG />
          Entrar con Google
        </a>

        {err && <p className="mt-3 text-xs text-bad">{err}</p>}

        <p className="mt-3 text-2xs text-faint">
          Solo cuentas <b>@eldesembarco.com</b>. Otras cuentas se rechazan.
        </p>

        {/* Respaldo por clave (temporal, hasta confirmar que Google anda) */}
        <div className="mt-5 border-t border-line pt-4">
          {!mostrarClave ? (
            <button
              type="button"
              onClick={() => setMostrarClave(true)}
              className="text-2xs text-faint hover:text-muted hover:underline"
            >
              Acceso con clave (respaldo)
            </button>
          ) : (
            <form onSubmit={entrar} className="space-y-3">
              <Field label="Email">
                <input
                  type="email"
                  className={inputClass}
                  placeholder="tu.email@eldesembarco.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>
              <Field label="Clave" hint="Clave genérica provista por el administrador.">
                <input
                  type="password"
                  className={inputClass}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>
              <Button type="submit" disabled={busy || !email || !password} className="w-full">
                {busy ? "Ingresando…" : "Ingresar con clave"}
              </Button>
            </form>
          )}
        </div>
      </Card>
    </div>
  );
}
