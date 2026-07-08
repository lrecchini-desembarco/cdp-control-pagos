import { getAlertas } from "./alertas";
import { getControlCatalogo } from "./catalogo-control";
import { fmtInt } from "./brands";

/**
 * Notificaciones: arma un resumen de lo urgente (alertas operativas + problemas
 * críticos de catálogo) y lo envía por el canal configurado.
 *
 *   NOTIFY_CHANNEL = "slack" | "none"   (default none)
 *   SLACK_WEBHOOK_URL = https://hooks.slack.com/services/...
 *
 * En "none" no envía nada pero devuelve el texto (preview), así se puede probar
 * el formato sin webhook. Pensado para dispararse manualmente (botón en Alertas)
 * o por cron (ver docs/notificaciones.md).
 */

export interface ResumenNotif {
  texto: string;
  totales: { alertasCriticas: number; alertasAltas: number; catalogoCriticos: number };
  hayAlgo: boolean;
}

export async function construirResumen(): Promise<ResumenNotif> {
  const [{ alertas, resumen }, catalogo] = await Promise.all([getAlertas(), getControlCatalogo()]);

  const urgentes = alertas.filter((a) => a.severidad === "critica" || a.severidad === "alta");
  const catCriticos = catalogo.problemas.filter((p) => p.severidad === "critica");

  const totales = {
    alertasCriticas: resumen.critica,
    alertasAltas: resumen.alta,
    catalogoCriticos: catalogo.resumen.porTipo["precio-cero"],
  };
  const hayAlgo = urgentes.length > 0 || catCriticos.length > 0;

  const lineas: string[] = [];
  lineas.push("*CDP · Control — resumen*");
  if (!hayAlgo) {
    lineas.push("✅ Todo en orden: sin alertas urgentes ni problemas críticos de catálogo.");
  } else {
    lineas.push(
      `🔴 ${resumen.critica} críticas · 🟠 ${resumen.alta} altas · catálogo: ${totales.catalogoCriticos} con precio $0`
    );
    if (urgentes.length) {
      lineas.push("", "*Alertas operativas:*");
      for (const a of urgentes.slice(0, 10)) {
        lineas.push(`• ${a.severidad === "critica" ? "🔴" : "🟠"} ${a.titulo}${a.metrica ? ` (${a.metrica})` : ""}`);
      }
      if (urgentes.length > 10) lineas.push(`… y ${urgentes.length - 10} más.`);
    }
    if (catCriticos.length) {
      lineas.push("", "*Catálogo (crítico):*");
      for (const p of catCriticos.slice(0, 10)) {
        lineas.push(`• 🔴 ${p.nombre} (${p.sku}) — ${p.problemas.map((x) => x.tipo).join(", ")}`);
      }
      if (catCriticos.length > 10) lineas.push(`… y ${catCriticos.length - 10} más.`);
    }
  }

  return { texto: lineas.join("\n"), totales, hayAlgo };
}

interface Notifier {
  enviar(texto: string): Promise<{ ok: boolean; info: string }>;
}

const noneNotifier: Notifier = {
  async enviar() {
    return { ok: true, info: "Canal 'none': no se envió (configurá NOTIFY_CHANNEL=slack y SLACK_WEBHOOK_URL)." };
  },
};

const slackNotifier: Notifier = {
  async enviar(texto: string) {
    const url = process.env.SLACK_WEBHOOK_URL;
    if (!url) return { ok: false, info: "Falta SLACK_WEBHOOK_URL." };
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: texto }),
    });
    return r.ok
      ? { ok: true, info: "Enviado a Slack." }
      : { ok: false, info: `Slack respondió ${r.status}.` };
  },
};

export function canalActual(): string {
  return process.env.NOTIFY_CHANNEL ?? "none";
}

function getNotifier(): Notifier {
  return canalActual() === "slack" ? slackNotifier : noneNotifier;
}

/**
 * Envía un mensaje suelto por el canal configurado (no el resumen de alertas).
 * Lo usan features puntuales, ej. avisar un nuevo ingreso en el organigrama.
 * En canal "none" no manda nada pero devuelve enviado:false + el preview.
 */
export async function notificar(texto: string): Promise<{ canal: string; enviado: boolean; info: string; preview: string }> {
  const canal = canalActual();
  const res = await getNotifier().enviar(texto);
  return { canal, enviado: res.ok && canal !== "none", info: res.info, preview: texto };
}

export async function enviarResumen(): Promise<{
  canal: string;
  enviado: boolean;
  info: string;
  preview: string;
  totales: ResumenNotif["totales"];
  hayAlgo: boolean;
}> {
  const resumen = await construirResumen();
  const canal = canalActual();
  const res = await getNotifier().enviar(resumen.texto);
  return {
    canal,
    enviado: res.ok && canal !== "none",
    info: res.info,
    preview: resumen.texto,
    totales: resumen.totales,
    hayAlgo: resumen.hayAlgo,
  };
}
