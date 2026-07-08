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

interface EnviarOpts {
  subject?: string; // asunto para email (los canales de chat lo ignoran)
}

interface Notifier {
  enviar(texto: string, opts?: EnviarOpts): Promise<{ ok: boolean; info: string }>;
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const noneNotifier: Notifier = {
  async enviar() {
    return { ok: true, info: "Canal 'none': no se envió (configurá NOTIFY_CHANNEL y sus datos)." };
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

/**
 * Email por SMTP de Google Workspace (Gmail). Config por env (NO se hardcodea nada):
 *   NOTIFY_CHANNEL   = "email"
 *   SMTP_USER        = casilla que envía (ej. notificaciones@eldesembarco.com)
 *   SMTP_PASS        = App Password de esa casilla (16 chars, requiere 2FA)
 *   NOTIFY_EMAIL_TO  = destinatarios, separados por coma (ej. rrhh@…,admin@…)
 *   SMTP_HOST/PORT   = opcionales (default smtp.gmail.com:465)
 *   NOTIFY_EMAIL_FROM= opcional (default = SMTP_USER)
 */
const emailNotifier: Notifier = {
  async enviar(texto: string, opts?: EnviarOpts) {
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const to = process.env.NOTIFY_EMAIL_TO || user;
    const from = process.env.NOTIFY_EMAIL_FROM || user;
    if (!user || !pass) return { ok: false, info: "Faltan SMTP_USER / SMTP_PASS (App Password de Workspace)." };
    if (!to) return { ok: false, info: "Falta NOTIFY_EMAIL_TO." };
    const host = process.env.SMTP_HOST || "smtp.gmail.com";
    const port = Number(process.env.SMTP_PORT || 465);
    try {
      const nodemailer = (await import("nodemailer")).default;
      const transport = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
      const plano = texto.replace(/\*/g, ""); // saca el *bold* estilo Slack
      const subject = opts?.subject || plano.split("\n")[0] || "Notificación · CDP Control";
      await transport.sendMail({
        from,
        to,
        subject,
        text: plano,
        html: `<pre style="font:14px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;white-space:pre-wrap">${escapeHtml(plano)}</pre>`,
      });
      return { ok: true, info: `Email enviado a ${to}.` };
    } catch (e) {
      return { ok: false, info: `Error SMTP: ${e instanceof Error ? e.message : "desconocido"}.` };
    }
  },
};

export function canalActual(): string {
  return process.env.NOTIFY_CHANNEL ?? "none";
}

function getNotifier(): Notifier {
  switch (canalActual()) {
    case "slack": return slackNotifier;
    case "email": return emailNotifier;
    default: return noneNotifier;
  }
}

/**
 * Envía un mensaje suelto por el canal configurado (no el resumen de alertas).
 * Lo usan features puntuales, ej. avisar un nuevo ingreso en el organigrama.
 * En canal "none" no manda nada pero devuelve enviado:false + el preview.
 */
export async function notificar(texto: string, opts?: { subject?: string }): Promise<{ canal: string; enviado: boolean; info: string; preview: string }> {
  const canal = canalActual();
  const res = await getNotifier().enviar(texto, opts);
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
