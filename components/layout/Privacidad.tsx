"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

// Modo privacidad "tipo banco": un ojo en el Topbar oculta (blur) todos los montos
// marcados con la clase `.monto`. El estado se recuerda por dispositivo (localStorage)
// y se aplica poniendo data-privacy="on" en <html> (el CSS hace el blur).
const KEY = "cdp_privacy";
type Ctx = { oculto: boolean; toggle: () => void };
const PrivCtx = createContext<Ctx>({ oculto: false, toggle: () => {} });

export function PrivacidadProvider({ children }: { children: React.ReactNode }) {
  const [oculto, setOculto] = useState(false);
  // Estado inicial: el atributo ya lo dejó el script anti-flash del layout; si no, localStorage.
  useEffect(() => {
    setOculto(document.documentElement.dataset.privacy === "on" || (() => {
      try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
    })());
  }, []);
  useEffect(() => {
    document.documentElement.dataset.privacy = oculto ? "on" : "off";
  }, [oculto]);
  const toggle = useCallback(() => {
    setOculto((o) => {
      const n = !o;
      try { localStorage.setItem(KEY, n ? "1" : "0"); } catch { /* modo incógnito */ }
      return n;
    });
  }, []);
  return <PrivCtx.Provider value={{ oculto, toggle }}>{children}</PrivCtx.Provider>;
}

export const usePrivacidad = () => useContext(PrivCtx);

// Botón ojo para el Topbar.
export function OjoPrivacidad() {
  const { oculto, toggle } = usePrivacidad();
  return (
    <button
      data-tour="privacy"
      onClick={toggle}
      title={oculto ? "Mostrar montos" : "Ocultar montos (modo privacidad)"}
      aria-label={oculto ? "Mostrar montos" : "Ocultar montos"}
      aria-pressed={oculto}
      className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted transition-colors hover:bg-ink/5 hover:text-ink"
    >
      {oculto ? (
        // ojo tachado
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 10 8 10 8a18.5 18.5 0 0 1-2.16 3.19M6.61 6.61A18.5 18.5 0 0 0 2 12s3 8 10 8a9.12 9.12 0 0 0 5.39-1.61" />
          <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
          <line x1="2" y1="2" x2="22" y2="22" />
        </svg>
      ) : (
        // ojo abierto
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M2 12s3-8 10-8 10 8 10 8-3 8-10 8-10-8-10-8Z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      )}
    </button>
  );
}
