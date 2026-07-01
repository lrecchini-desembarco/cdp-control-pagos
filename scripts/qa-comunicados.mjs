// QA del generador de Comunicados: testea el módulo REAL (lib/comunicado-email.ts).
// Correr: node --experimental-strip-types scripts/qa-comunicados.mjs
import { construirEmailHTML, estadoBase, FOOTER_DEFAULT } from "../lib/comunicado-email.ts";

let ok = 0, fail = 0;
const check = (nombre, cond) => {
  if (cond) { ok++; console.log("  ✓", nombre); }
  else { fail++; console.log("  ✗", nombre); }
};

const base = (over = {}) => ({ ...estadoBase, color: "#155E63", ...FOOTER_DEFAULT, ...over });
const LOGO_B64 = "data:image/png;base64,AAA";
const MARCA = { logo: "data:image/png;base64,MARCA", label: "El Desembarco" };
const SIN_LOGO = { logo: "", label: "DS Group" };

console.log("== Gmail-safe (estructura) ==");
{
  const h = construirEmailHTML(base(), SIN_LOGO);
  check("3 tablas role=presentation", (h.match(/role="presentation"/g) || []).length === 3);
  check("tabla fija 600px", h.includes('width="600"') && h.includes("width:600px"));
  check("estilos inline (style=)", (h.match(/style="/g) || []).length > 10);
  check("text-align:left en celdas", (h.match(/text-align:left/g) || []).length >= 5);
  check("sin <script>", !/<script/i.test(h));
}

console.log("== Prioridad de logo (misma lógica que Firmas) ==");
{
  const url = construirEmailHTML(base({ logoUrl: "https://cdn.x/logo.png", logoCustom: LOGO_B64 }), MARCA);
  check("URL pisa a todo", url.includes('src="https://cdn.x/logo.png"'));
  const subido = construirEmailHTML(base({ logoUrl: "", logoCustom: LOGO_B64 }), MARCA);
  check("logo subido cuando no hay URL", subido.includes('src="data:image/png;base64,AAA"'));
  const marca = construirEmailHTML(base({ logoUrl: "", logoCustom: "" }), MARCA);
  check("base64 de la marca por defecto", marca.includes('src="data:image/png;base64,MARCA"'));
  const texto = construirEmailHTML(base({ logoUrl: "", logoCustom: "" }), SIN_LOGO);
  check("sin logo -> texto de marca (no <img>)", !texto.includes("<img") && texto.includes("DS Group"));
}

console.log("== Botón condicional + normalización de link ==");
{
  const sinBoton = construirEmailHTML(base({ botonTexto: "", botonLink: "https://x" }), SIN_LOGO);
  check("botón NO se renderiza si el texto está vacío", !/border-radius:8px">.*<\/a>/.test(sinBoton) && !sinBoton.includes(">Ver<"));
  const conBoton = construirEmailHTML(base({ botonTexto: "Ver más", botonLink: "www.ds.com" }), SIN_LOGO);
  check("botón se renderiza con texto", conBoton.includes(">Ver más</a>"));
  check("link sin protocolo -> https://", conBoton.includes('href="https://www.ds.com"'));
  const conHttp = construirEmailHTML(base({ botonTexto: "Ir", botonLink: "http://ya.com" }), SIN_LOGO);
  check("link con http:// se respeta", conHttp.includes('href="http://ya.com"'));
}

console.log("== Footer: líneas vacías se ocultan ==");
{
  const h = construirEmailHTML(base({ area: "", web: "", email: "hola@ds.com" }), SIN_LOGO);
  check("email presente", h.includes("mailto:hola@ds.com"));
  check("web vacía -> oculta", !h.includes("www.eldesembarco.com"));
  check("legal presente", h.includes("uso interno"));
}

console.log("== Escaping (anti-inyección) ==");
{
  const h = construirEmailHTML(base({ titulo: '<b>x</b> & "y"' }), SIN_LOGO);
  check("< y & y comillas escapados", h.includes("&lt;b&gt;x&lt;/b&gt; &amp; &quot;y&quot;"));
  check("no hay <b> crudo del usuario", !h.includes("<b>x</b>"));
}

console.log("== Cuerpo multilínea ==");
{
  const h = construirEmailHTML(base({ cuerpo: "Uno\n\n  Dos  \nTres" }), SIN_LOGO);
  const parrafos = (h.match(/font:400 15px\/1\.6 Arial[^>]*>(Uno|Dos|Tres)</g) || []).length;
  check("3 párrafos (líneas vacías filtradas + trim)", parrafos === 3);
}

console.log("== Color de acento ==");
{
  const h = construirEmailHTML(base({ color: "#ABCDEF", eyebrow: "Aviso" }), SIN_LOGO);
  check("acento en barra superior", h.includes("background:#ABCDEF"));
  check("acento en eyebrow", h.includes("color:#ABCDEF"));
}

console.log(`\nRESULTADO: ${ok} OK · ${fail} FAIL`);
process.exit(fail ? 1 : 0);
