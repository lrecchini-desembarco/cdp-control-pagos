"use client";

// Modo oscuro. Mismo patrón que Privacidad.tsx: contexto + botón, con el estado
// espejado en localStorage y en document.documentElement.dataset.theme (así
// globals.css lo puede leer con el selector :root[data-theme="dark"]).
//
// La restricción a un solo email NO se resuelve acá: se resuelve en app/layout.tsx,
// que solo manda el script de anti-flash y el botón cuando corresponde. Este
// componente solo hace caso a la prop `permitido` como cinturón de seguridad
// extra (si no está permitido, toggle() no hace nada).

import { createContext, useContext, useEffect, useState } from "react";

const KEY = "cdp_theme"; // valor: "dark" | "light"

interface Ctx {
  oscuro: boolean;
  toggle: () => void;
}
const TemaCtx = createContext<Ctx>({ oscuro: false, toggle: () => {} });

export function TemaProvider({ permitido, children }: { permitido: boolean; children: React.ReactNode }) {
  const [oscuro, setOscuro] = useState(false);

  // El valor real ya lo puso el script anti-flash antes de pintar; acá solo se
  // sincroniza el estado de React con lo que quedó en el <html>.
  useEffect(() => {
    if (!permitido) return;
    setOscuro(document.documentElement.dataset.theme === "dark");
  }, [permitido]);

  const toggle = () => {
    if (!permitido) return;
    setOscuro((prev) => {
      const next = !prev;
      document.documentElement.dataset.theme = next ? "dark" : "light";
      try {
        localStorage.setItem(KEY, next ? "dark" : "light");
      } catch {}
      return next;
    });
  };

  return <TemaCtx.Provider value={{ oscuro, toggle }}>{children}</TemaCtx.Provider>;
}

export const useTema = () => useContext(TemaCtx);

/** Botón luna/sol para el Topbar. Quien lo monta ya filtró por email. */
export function BotonTema() {
  const { oscuro, toggle } = useTema();
  return (
    <button
      onClick={toggle}
      title={oscuro ? "Modo claro" : "Modo oscuro"}
      aria-label={oscuro ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      aria-pressed={oscuro}
      className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted transition-colors hover:bg-ink/5 hover:text-ink"
    >
      {oscuro ? (
        // sol (modo oscuro activo -> ofrece volver al claro)
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="12" cy="12" r="4.5" />
          <path d="M12 2.5v2.5M12 19v2.5M4.5 12H2M22 12h-2.5M5.1 5.1l1.8 1.8M17.1 17.1l1.8 1.8M18.9 5.1l-1.8 1.8M6.9 17.1l-1.8 1.8" />
        </svg>
      ) : (
        // luna (modo claro activo -> ofrece pasar al oscuro)
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5a7 7 0 0 0 11 11Z" />
        </svg>
      )}
    </button>
  );
}
