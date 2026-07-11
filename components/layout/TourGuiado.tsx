"use client";

import { useCallback, useEffect } from "react";
import "driver.js/dist/driver.css";

// Tour guiado ("coach marks") que explica las herramientas del tablero. Arranca solo
// la primera vez y se puede relanzar con el botón "¿Cómo funciona?". Usa driver.js
// (import dinámico, para no pesar el bundle) y los anclas data-tour del layout.
const KEY = "cdp_tour_v1";

const PASOS = [
  { popover: { title: "👋 Bienvenido a CDP · Control", description: "Te muestro en 30 segundos dónde está cada cosa. Podés cerrarlo cuando quieras y volver a verlo con el botón «¿Cómo funciona?»." } },
  { element: '[data-tour="nav"]', popover: { title: "🧭 Todas las herramientas", description: "Acá están, agrupadas por tema: Alertas, Ventas, Facturación, Bancos, Costos, Clientes y más. <b>Pasá el mouse por cada una</b> y te dice qué hace.", side: "right" as const } },
  { element: '[data-tour="fresh"]', popover: { title: "🟢 De dónde sale el dato", description: "El punto <b>verde</b> = dato en vivo (tiempo real). El <b>gris</b> = se carga a mano. Así sabés qué tan fresco es cada número.", side: "right" as const } },
  { element: '[data-tour="privacy"]', popover: { title: "🔒 Ocultar los montos", description: "Este ojo tapa toda la plata de la pantalla — ideal si estás mostrando el tablero o compartiendo pantalla.", side: "bottom" as const } },
  { element: '[data-tour="ayuda"]', popover: { title: "❓ ¿Dudas más adelante?", description: "Cuando quieras repetir este paseo, tocá este botón. Y en <b>«¿Qué puedo hacer?»</b> (abajo del menú) tenés la guía completa, paso a paso.", side: "bottom" as const } },
];

export default function TourGuiado() {
  const iniciar = useCallback(async () => {
    const { driver } = await import("driver.js");
    const d = driver({
      showProgress: true,
      nextBtnText: "Siguiente",
      prevBtnText: "Atrás",
      doneBtnText: "Listo",
      progressText: "{{current}} de {{total}}",
      steps: PASOS,
    });
    d.drive();
  }, []);

  useEffect(() => {
    try {
      if (!localStorage.getItem(KEY)) { localStorage.setItem(KEY, "1"); const t = setTimeout(iniciar, 900); return () => clearTimeout(t); }
    } catch { /* incógnito */ }
  }, [iniciar]);

  return (
    <button
      data-tour="ayuda"
      onClick={iniciar}
      title="Ver cómo usar el tablero"
      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-2xs font-medium text-muted hover:bg-ink/5 hover:text-ink"
    >
      <span className="grid h-4 w-4 place-items-center rounded-full border border-current text-[10px] font-bold leading-none">?</span>
      <span className="hidden sm:inline">¿Cómo funciona?</span>
    </button>
  );
}
