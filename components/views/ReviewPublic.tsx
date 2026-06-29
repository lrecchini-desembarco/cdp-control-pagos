"use client";

import { useEffect, useMemo, useState } from "react";

interface Local {
  nombre: string;
  googleUrl?: string;
  marca?: string;
}

const MARCA_LABEL: Record<string, string> = {
  desembarco: "El Desembarco",
  tasty: "Mr Tasty",
  mila: "Mila & Go",
};

export default function ReviewPublic() {
  const [locales, setLocales] = useState<Local[]>([]);
  const [local, setLocal] = useState("");
  const [q, setQ] = useState("");
  const [marca, setMarca] = useState<string | null>(null);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const m = sp.get("m");
    const preLocal = sp.get("l"); // QR por local: queda preseleccionado
    setMarca(m);
    fetch("/api/locales")
      .then((r) => r.json())
      .then((j) => {
        if (!j.ok) return;
        const all = j.locales as Local[];
        const list = m ? all.filter((l) => (l.marca ?? "") === m) : all;
        setLocales(list);
        if (preLocal && all.some((l) => l.nombre === preLocal)) {
          setLocal(preLocal);
          setQ(preLocal);
        }
      })
      .catch(() => {});
  }, []);

  const localObj = useMemo(() => locales.find((l) => l.nombre === local), [locales, local]);
  const filtrados = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (t ? locales.filter((l) => l.nombre.toLowerCase().includes(t)) : locales).slice(0, 8);
  }, [locales, q]);
  const mostrarLista = q.trim().length > 0 && q !== local;

  function calificar() {
    if (!localObj?.googleUrl) return;
    // Registramos la derivación (no bloquea la navegación) y vamos a Google.
    try {
      fetch("/api/derivaciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ local }),
        keepalive: true,
      });
    } catch {}
    window.location.href = localObj.googleUrl;
  }

  return (
    <div className="grid min-h-screen place-items-center bg-paper px-4 py-8">
      <div className="w-full max-w-md">
        <div className="mb-5 flex items-center justify-center gap-2.5">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-sidebar font-display text-base font-bold text-white">
            DS
          </div>
          <p className="font-display text-sm font-semibold text-ink">DS Group</p>
        </div>

        <div className="rounded-card border border-line bg-surface p-6 text-center shadow-sm">
          <h1 className="font-display text-2xl font-semibold text-ink">¡Bienvenido!</h1>
          <p className="mt-1 text-sm text-muted">
            {marca && MARCA_LABEL[marca]
              ? `Dejá tu reseña de ${MARCA_LABEL[marca]} en Google.`
              : "Elegí tu local y dejá tu reseña en Google."}
          </p>

          {/* Buscar / elegir local */}
          <div className="mt-6 text-left">
            <label className="mb-1 block text-2xs font-medium uppercase tracking-wide text-faint">
              Tu local
            </label>
            <input
              className="w-full rounded-lg border border-line bg-surface px-3 py-3 text-base text-ink placeholder:text-faint focus:border-action"
              placeholder="Buscá el barrio o el nombre…"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setLocal("");
              }}
            />
            {mostrarLista && (
              <div className="mt-1 max-h-56 overflow-y-auto rounded-lg border border-line">
                {filtrados.length === 0 ? (
                  <p className="px-3 py-2 text-sm text-faint">Sin resultados…</p>
                ) : (
                  filtrados.map((l) => (
                    <button
                      key={l.nombre}
                      onClick={() => {
                        setLocal(l.nombre);
                        setQ(l.nombre);
                      }}
                      className="block w-full border-b border-line px-3 py-2.5 text-left text-sm text-ink last:border-0 hover:bg-ink/5"
                    >
                      {l.nombre}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Acción directa a Google */}
          {local && (
            <div className="mt-5">
              {localObj?.googleUrl ? (
                <button
                  onClick={calificar}
                  className="w-full rounded-lg bg-action px-4 py-4 text-base font-semibold text-white transition-colors hover:bg-action-700"
                >
                  ⭐ Calificar {local} en Google
                </button>
              ) : (
                <p className="rounded-lg bg-warn/10 px-3 py-3 text-sm text-warn">
                  Este local todavía no está habilitado para reseñas. Probá más tarde.
                </p>
              )}
              <p className="mt-2 text-2xs text-faint">Te lleva a Google Maps para dejar tu opinión.</p>
            </div>
          )}
        </div>

        <p className="mt-4 text-center text-2xs text-faint">DS Group · Gracias por tu visita</p>
      </div>
    </div>
  );
}
