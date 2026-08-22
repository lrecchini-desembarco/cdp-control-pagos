import type { CSSProperties } from "react";

// La consola del Panel de Sistemas es siempre oscura, sin importar el modo
// claro/oscuro elegido en el resto del CDP. Las reglas de globals.css
// (`:root[data-theme="dark"] { --ink: ...; }`) solo se activan si el atributo
// está en <html> — ponerlo en un <div> interno no las dispara, porque
// `:root` no matchea otros elementos. Solución: fijar acá mismo, como estilo
// inline en el <div> raíz de la consola, los mismos valores numéricos que ya
// están en globals.css bajo el bloque dark. Todo lo demás sigue usando las
// clases de Tailwind de siempre (bg-paper, text-ink, border-line...) — esto
// solo pisa localmente qué valor toman esas variables.
//
// Duplica a propósito los valores de app/globals.css `:root[data-theme="dark"]`.
// Si esa paleta cambia, actualizar los dos lugares.
export const CONSOLA_DARK_VARS = {
  "--ink": "236 233 226",
  "--paper": "23 22 19",
  "--surface": "31 30 27",
  "--line": "52 50 44",
  "--muted": "166 162 150",
  "--faint": "125 122 110",
  "--action": "46 154 160",
  "--action-700": "111 201 206",
  "--ok": "63 160 107",
  "--warn": "217 150 58",
  "--bad": "221 97 83",
  "--ring": "46 154 160",
} as CSSProperties;
