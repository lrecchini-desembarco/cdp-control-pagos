"use client";

import { useEffect, useMemo, useState } from "react";

interface Local {
  nombre: string;
  googleUrl?: string;
}
type Paso = "bienvenida" | "calificar" | "gracias";

export default function ReviewPublic() {
  const [locales, setLocales] = useState<Local[]>([]);
  const [local, setLocal] = useState("");
  const [paso, setPaso] = useState<Paso>("bienvenida");
  const [estrellas, setEstrellas] = useState(0);
  const [hover, setHover] = useState(0);
  const [comentario, setComentario] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [googleUrl, setGoogleUrl] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/locales")
      .then((r) => r.json())
      .then((j) => j.ok && setLocales(j.locales))
      .catch(() => {});
  }, []);

  const localObj = useMemo(() => locales.find((l) => l.nombre === local), [locales, local]);

  async function enviar() {
    setEnviando(true);
    try {
      const j = await (
        await fetch("/api/reviews", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ local, estrellas, comentario }),
        })
      ).json();
      setGoogleUrl(j.ok ? j.googleUrl ?? localObj?.googleUrl ?? null : null);
      setPaso("gracias");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-paper px-4 py-8">
      <div className="w-full max-w-md">
        {/* Marca */}
        <div className="mb-5 flex items-center justify-center gap-2.5">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-sidebar font-display text-base font-bold text-white">
            DS
          </div>
          <p className="font-display text-sm font-semibold text-ink">DS Group</p>
        </div>

        <div className="rounded-card border border-line bg-surface p-6 shadow-sm">
          {/* Paso 1 — bienvenida + elegir local */}
          {paso === "bienvenida" && (
            <div className="text-center">
              <h1 className="font-display text-2xl font-semibold text-ink">¡Bienvenido!</h1>
              <p className="mt-1 text-sm text-muted">
                Sistema de reseñas. Tu opinión nos ayuda a mejorar.
              </p>
              <div className="mt-6 text-left">
                <label className="mb-1 block text-2xs font-medium uppercase tracking-wide text-faint">
                  Seleccioná el local
                </label>
                <select
                  className="w-full rounded-lg border border-line bg-surface px-3 py-3 text-base text-ink focus:border-action"
                  value={local}
                  onChange={(e) => setLocal(e.target.value)}
                >
                  <option value="">— Elegí tu local —</option>
                  {locales.map((l) => (
                    <option key={l.nombre} value={l.nombre}>
                      {l.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={() => setPaso("calificar")}
                disabled={!local}
                className="mt-5 w-full rounded-lg bg-action px-4 py-3 text-base font-medium text-white transition-colors hover:bg-action-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Calificar →
              </button>
            </div>
          )}

          {/* Paso 2 — calificar */}
          {paso === "calificar" && (
            <div className="text-center">
              <p className="text-2xs font-medium uppercase tracking-wide text-faint">{local}</p>
              <h2 className="mt-1 font-display text-lg font-semibold text-ink">
                ¿Cómo fue tu experiencia?
              </h2>

              {/* Estrellas */}
              <div className="mt-4 flex justify-center gap-1.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onClick={() => setEstrellas(n)}
                    onMouseEnter={() => setHover(n)}
                    onMouseLeave={() => setHover(0)}
                    aria-label={`${n} estrellas`}
                    className={`text-4xl leading-none transition-transform hover:scale-110 ${
                      (hover || estrellas) >= n ? "text-warn" : "text-line"
                    }`}
                  >
                    ★
                  </button>
                ))}
              </div>

              <textarea
                className="mt-5 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-action"
                rows={3}
                placeholder="Contanos algo más (opcional)…"
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
              />

              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => setPaso("bienvenida")}
                  className="rounded-lg border border-line px-4 py-3 text-sm font-medium text-muted hover:bg-ink/5"
                >
                  Atrás
                </button>
                <button
                  onClick={enviar}
                  disabled={estrellas === 0 || enviando}
                  className="flex-1 rounded-lg bg-action px-4 py-3 text-base font-medium text-white transition-colors hover:bg-action-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {enviando ? "Enviando…" : "Enviar reseña"}
                </button>
              </div>
            </div>
          )}

          {/* Paso 3 — gracias (+ invitación a Google) */}
          {paso === "gracias" && (
            <div className="text-center">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-ok/15 text-2xl text-ok">
                ✓
              </div>
              <h2 className="mt-3 font-display text-xl font-semibold text-ink">¡Gracias por tu opinión!</h2>
              <p className="mt-1 text-sm text-muted">Tu reseña de {local} fue registrada.</p>

              {estrellas >= 4 && googleUrl && (
                <div className="mt-5 rounded-lg bg-warn/10 p-4">
                  <p className="text-sm font-medium text-ink">¿Nos ayudás con una reseña en Google?</p>
                  <p className="mt-0.5 text-xs text-muted">Te lleva 10 segundos y nos da una mano enorme.</p>
                  <a
                    href={googleUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-block rounded-lg bg-action px-4 py-2.5 text-sm font-medium text-white hover:bg-action-700"
                  >
                    ⭐ Dejar reseña en Google
                  </a>
                </div>
              )}

              <button
                onClick={() => {
                  setEstrellas(0);
                  setComentario("");
                  setLocal("");
                  setPaso("bienvenida");
                }}
                className="mt-5 text-sm font-medium text-muted hover:text-ink"
              >
                Cargar otra reseña
              </button>
            </div>
          )}
        </div>

        <p className="mt-4 text-center text-2xs text-faint">DS Group · Gracias por tu visita</p>
      </div>
    </div>
  );
}
