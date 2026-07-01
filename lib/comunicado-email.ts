// Lógica pura del email de Comunicados (sin React ni imports de assets), para
// que sea testeable de forma aislada (scripts/qa-comunicados.mjs). El componente
// resuelve el logo base64 de la marca y lo pasa por parámetro.

export interface Estado {
  marca: string;
  logoCustom: string; // base64 (logo subido); pisa el logo de la marca
  logoUrl: string; // URL de logo hospedado (misma lógica que Firmas: pisa a todo). Ideal para emails.
  color: string;
  etiquetaLateral: string;
  asunto: string;
  eyebrow: string;
  titulo: string;
  saludo: string;
  cuerpo: string; // un párrafo por línea
  botonTexto: string;
  botonLink: string;
  grupo: string;
  marcasLinea: string;
  area: string;
  email: string;
  web: string;
  ubicacion: string;
  legal: string;
}

// Valores por defecto del pie (editable).
export const FOOTER_DEFAULT = {
  grupo: "DS Group",
  marcasLinea: "El Desembarco · Mr. Tasty · Mila & Go",
  area: "",
  email: "sistemas@eldesembarco.com",
  web: "www.eldesembarco.com",
  ubicacion: "Buenos Aires, Argentina",
  legal: "Este mensaje es de uso interno de DS Group.",
};

// Sugeridos para el email de contacto del pie (datalist).
export const MAILS_SUGERIDOS = [
  "sistemas@eldesembarco.com",
  "marketing@eldesembarco.com",
  "rrhh@eldesembarco.com",
  "administracion@eldesembarco.com",
];

// Defaults JSON-free (marca + contenido). El componente completa `color` (de la
// marca) y los campos del pie (FOOTER_DEFAULT) al armar el estado inicial.
export const estadoBase: Omit<Estado, "color" | keyof typeof FOOTER_DEFAULT> = {
  marca: "ds",
  logoCustom: "",
  logoUrl: "",
  etiquetaLateral: "SISTEMAS",
  asunto: "Comunicado interno · DS Group",
  eyebrow: "Comunicado",
  titulo: "Título del comunicado",
  saludo: "Hola equipo,",
  cuerpo: "Escribí acá el mensaje.\nCada línea es un párrafo.",
  botonTexto: "",
  botonLink: "",
};

export function esc(s: string): string {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Arma el email HTML (Gmail-safe: tablas role=presentation 600px, estilos inline,
 * text-align:left en las celdas). `marca` trae el logo base64 y el label de la
 * marca elegida; el logo final se resuelve por prioridad: URL > subido > marca > texto.
 */
export function construirEmailHTML(e: Estado, marca: { logo: string; label: string }): string {
  const logo = e.logoUrl.trim() || e.logoCustom || marca.logo || "";
  const color = e.color || "#155E63";
  const parrafos = e.cuerpo.split("\n").map((l) => l.trim()).filter(Boolean);
  const link = e.botonLink.trim();
  const href = link ? (/^https?:\/\//.test(link) ? link : "https://" + link) : "";

  const logoCell = logo
    ? `<img src="${esc(logo)}" alt="${esc(marca.label)}" height="34" style="height:34px;display:block;border:0" />`
    : `<span style="font:700 20px Arial,Helvetica,sans-serif;color:${color}">${esc(marca.label || e.grupo)}</span>`;

  const etiqueta = e.etiquetaLateral.trim()
    ? `<span style="display:inline-block;font:700 10px Arial,Helvetica,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#ffffff;background:${color};border-radius:5px;padding:5px 9px">${esc(
        e.etiquetaLateral
      )}</span>`
    : "";

  const fila = (html: string, extra = "") => `<div style="text-align:left;${extra}">${html}</div>`;
  const footer = [
    e.grupo ? fila(esc(e.grupo), "font-weight:700;color:#6b6860") : "",
    e.marcasLinea ? fila(esc(e.marcasLinea)) : "",
    e.area ? fila(esc(e.area)) : "",
    e.email ? fila(`<a href="mailto:${esc(e.email)}" style="color:${color};text-decoration:none">${esc(e.email)}</a>`) : "",
    e.web ? fila(esc(e.web)) : "",
    e.ubicacion ? fila(esc(e.ubicacion)) : "",
    e.legal ? fila(esc(e.legal), "padding-top:8px;color:#c8c5bd") : "",
  ]
    .filter(Boolean)
    .join("");

  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f7f7f5;padding:24px 0;margin:0">
  <tr><td align="center" style="text-align:center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:#ffffff;border:1px solid #e6e3db;border-radius:14px;overflow:hidden;font-family:Arial,Helvetica,sans-serif">
      <tr><td style="height:6px;background:${color};font-size:0;line-height:0">&nbsp;</td></tr>
      <tr><td style="padding:24px 32px 0 32px;text-align:left">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="text-align:left;vertical-align:middle">${logoCell}</td>
          <td style="text-align:right;vertical-align:middle">${etiqueta}</td>
        </tr></table>
      </td></tr>
      ${e.eyebrow ? `<tr><td style="padding:22px 32px 0 32px;text-align:left"><span style="font:700 12px Arial,Helvetica,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:${color}">${esc(e.eyebrow)}</span></td></tr>` : ""}
      ${e.titulo ? `<tr><td style="padding:6px 32px 0 32px;text-align:left"><h1 style="margin:0;font:700 24px Arial,Helvetica,sans-serif;line-height:1.25;color:#18181b">${esc(e.titulo)}</h1></td></tr>` : ""}
      ${e.saludo ? `<tr><td style="padding:16px 32px 0 32px;text-align:left;font:400 15px/1.6 Arial,Helvetica,sans-serif;color:#3f3f46">${esc(e.saludo)}</td></tr>` : ""}
      ${parrafos
        .map(
          (p) =>
            `<tr><td style="padding:12px 32px 0 32px;text-align:left;font:400 15px/1.6 Arial,Helvetica,sans-serif;color:#3f3f46">${esc(p)}</td></tr>`
        )
        .join("")}
      ${
        e.botonTexto.trim()
          ? `<tr><td style="padding:24px 32px 0 32px;text-align:left"><a href="${esc(href)}" style="display:inline-block;background:${color};color:#ffffff;text-decoration:none;font:600 15px Arial,Helvetica,sans-serif;padding:12px 22px;border-radius:8px">${esc(e.botonTexto)}</a></td></tr>`
          : ""
      }
      <tr><td style="padding:28px 32px 0 32px"><div style="border-top:1px solid #e6e3db;font-size:0;line-height:0">&nbsp;</div></td></tr>
      <tr><td style="padding:16px 32px 28px 32px;text-align:left;font:400 12px/1.7 Arial,Helvetica,sans-serif;color:#9c998f">${footer}</td></tr>
    </table>
  </td></tr>
</table>`.trim();
}
