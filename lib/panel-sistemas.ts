// Panel de Sistemas: acceso por lista blanca de emails, NO por rol — igual que
// Credenciales (lib/credenciales.ts). La diferencia es que esta lista tiene una
// base fija en el código + una parte que se agranda desde la propia pantalla
// (ver lib/panel-sistemas-store.ts), sin tocar el repo ni redeployar.

// Fijos: siempre tienen acceso, no se pueden quitar desde la UI (si hace falta
// sacar a alguno, se edita este archivo).
export const EMAILS_PANEL_SISTEMAS_BASE = [
  "sistemas02@eldesembarco.com",
  "lrecchini@eldesembarco.com",
  "polejavetzky@eldesembarco.com",
];

export const normEmail = (e: string) => e.trim().toLowerCase();
