"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import "driver.js/dist/driver.css";
import { TOUR_GENERAL, TOURS_PANTALLA, type PasoTour } from "@/lib/tours";

// Tour guiado ("coach marks"). Arranca solo la primera vez y se relanza con el botón.
// Si estás en una pantalla compleja con tour propio (ej. Bancos), el botón ofrece
// elegir: recorrido general o el de esa pantalla.
const KEY = "cdp_tour_v1";

export default function TourGuiado() {
  const path = usePathname();
  const ruta = "/" + (path.split("/").filter(Boolean)[0] ?? "");
  const pantalla = TOURS_PANTALLA[ruta];
  const [menu, setMenu] = useState(false);

  const correr = useCallback(async (pasos: PasoTour[]) => {
    setMenu(false);
    const { driver } = await import("driver.js");
    driver({
      showProgress: true,
      nextBtnText: "Siguiente",
      prevBtnText: "Atrás",
      doneBtnText: "Listo",
      progressText: "{{current}} de {{total}}",
      steps: pasos,
    }).drive();
  }, []);

  // Primera visita -> recorrido general automático.
  useEffect(() => {
    try {
      if (!localStorage.getItem(KEY)) { localStorage.setItem(KEY, "1"); const t = setTimeout(() => correr(TOUR_GENERAL), 900); return () => clearTimeout(t); }
    } catch { /* incógnito */ }
  }, [correr]);

  function onClick() {
    if (pantalla) setMenu((m) => !m); // hay tour de pantalla -> ofrecer opción
    else correr(TOUR_GENERAL);
  }

  return (
    <div className="relative">
      <button
        data-tour="ayuda"
        onClick={onClick}
        title="Ver cómo usar el tablero"
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-2xs font-medium text-muted hover:bg-ink/5 hover:text-ink"
      >
        <span className="grid h-4 w-4 place-items-center rounded-full border border-current text-[10px] font-bold leading-none">?</span>
        <span className="hidden sm:inline">¿Cómo funciona?</span>
      </button>

      {menu && pantalla && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenu(false)} aria-hidden />
          <div className="absolute right-0 top-full z-50 mt-1 w-60 overflow-hidden rounded-lg border border-line bg-surface py-1 text-sm shadow-lg">
            <p className="px-3 py-1 text-2xs uppercase tracking-wide text-faint">¿Qué querés ver?</p>
            <button onClick={() => correr(pantalla.pasos)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-ink hover:bg-ink/[0.04]">
              <span>📍</span> Cómo usar <b>{pantalla.nombre}</b>
            </button>
            <button onClick={() => correr(TOUR_GENERAL)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-muted hover:bg-ink/[0.04]">
              <span>🧭</span> Recorrido general del tablero
            </button>
          </div>
        </>
      )}
    </div>
  );
}
