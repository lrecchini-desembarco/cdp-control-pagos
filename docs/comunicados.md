# Comunicados — generador de emails

Solapa `/comunicados`: arma un **email HTML** con la identidad de la marca, editable
por el usuario, y lo **copia con formato para pegar en Gmail**. 100% client-side
(no toca auth, API ni backend). Detrás del mismo login que el resto (nav de admin
y operaciones).

## Cómo se usa
1. **Encabezado** → elegí la marca (El Desembarco / Mr. Tasty / Mila & Go / DS Group):
   precarga logo + color. Podés cambiar el color de acento y poner una etiqueta
   lateral (ej. "SISTEMAS").
2. **Contenido** → asunto (botón *Copiar* aparte, porque en Gmail va en otro campo),
   eyebrow, título, saludo, cuerpo (**un párrafo por línea**) y botón opcional
   (si el texto está vacío, no se dibuja).
3. **Pie** → grupo, línea de marcas, área/firma, email (con sugeridos), web,
   ubicación y línea legal. Cada línea vacía se oculta.
4. **Copiar para Gmail** → pega el email con formato en el cuerpo del mail.
   **Copiar HTML** copia el código. **Restablecer** vuelve al ejemplo.

La configuración se guarda en **localStorage** (sobrevive el refresh).

## Logos (misma lógica que Firmas)
Los presets de marca usan los **mismos logos base64** que Firmas
(`lib/firma-assets.json`). El logo final del email se resuelve por prioridad:

1. **Logo por URL** (campo del encabezado) — si lo cargás, gana.
2. **Logo subido** (archivo → base64).
3. **Logo base64 de la marca** (preset).
4. **Texto de la marca** (si no hay logo).

> **Para emails conviene la URL hospedada.** El base64 suele funcionar al pegar en
> Gmail (Gmail re-hostea la imagen pegada), pero algunos clientes bloquean imágenes
> `data:` en el cuerpo. Si ves que no aparece el logo, cargá una **URL** en
> "Logo por URL". (El repo de firmas no hostea los logos como archivos, por eso los
> presets siguen siendo base64.)

## Gmail-safe
El email se arma con tablas `role="presentation"` a **600px**, **estilos inline** y
`text-align:left` explícito en las celdas (evita el bug de centrado de Gmail al
pegar). Todo el texto del usuario va **escapado** (anti-inyección).

## Estructura
- `lib/comunicado-email.ts` — lógica pura del email (`construirEmailHTML`, `estadoBase`,
  `FOOTER_DEFAULT`, `MAILS_SUGERIDOS`, tipo `Estado`). Sin React ni assets → testeable.
- `components/views/ComunicadosView.tsx` — UI (form + preview + copiar). Define los
  presets de marca `MARCAS` (con los logos de `firma-assets.json`).
- `app/comunicados/page.tsx` — ruta.
- Nav: entrada en `components/layout/Sidebar.tsx` + `/comunicados` en `lib/roles.ts`
  (admin y operaciones).

## QA
`npm run qa:comunicados` — 21 chequeos sobre el módulo real: estructura Gmail-safe,
prioridad de logo (URL > subido > marca > texto), botón condicional + normalización
de link, ocultado de líneas de pie vacías, escaping, cuerpo multilínea y color de acento.
