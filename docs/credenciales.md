# Credenciales — bóveda de usuarios y contraseñas

`/credenciales`. Guarda usuario, contraseña, URL y notas de cada sistema, con búsqueda y
categorías. La contraseña se muestra tapada (`••••••••`) y solo se pide al server cuando
apretás **Ver** o **Copiar**: la lista general nunca la incluye.

## Quién entra

No se rige por el rol sino por una **lista blanca de emails**, en `lib/credenciales.ts`:

```ts
export const EMAILS_CREDENCIALES = [
  "sistemas02@eldesembarco.com",
  "lrecchini@eldesembarco.com",
];
```

Un usuario que no esté ahí —**incluso si es admin**— no ve el ítem en el menú, no aparece en
su cartel de bienvenida, la página lo manda a su home y la API le contesta 403. Tampoco figura
como pantalla asignable en `/usuarios`: su permiso no se administra por rol.

Para sumar o sacar a alguien se edita esa lista y se vuelve a deployar. Es a propósito: que el
cambio quede en el repo y se vea en el diff, no escondido en una config.

Los tres controles son independientes y se chequean por separado (menú, página, API), así que
un descuido en uno no abre la puerta.

## Cifrado — `CREDENCIALES_KEY` (obligatoria)

Las contraseñas se guardan cifradas con **AES-256-GCM**; la clave sale de la variable de
entorno `CREDENCIALES_KEY` y no vive ni en el repo ni en el store. En el KV queda algo así:

```
"secreto": "DDpzmaGmxHdQpcwY:F9NjRkJJeOWLiVnCLc+5PQ==:Mf23E0awOJ9isMEBJsvF51IQ1Q=="
             iv                 tag                     contenido cifrado
```

Sin la variable no se puede guardar ni leer nada: la pantalla muestra un aviso rojo y la API
devuelve el error. **No hay fallback a texto plano**, a propósito.

Generar una clave:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Y cargarla en Vercel (Settings → Environment Variables) y en el `.env.local` de desarrollo:

```
CREDENCIALES_KEY=<lo que salió del comando>
```

> ⚠️ Si perdés o cambiás la clave, las contraseñas ya guardadas **no se pueden recuperar**:
> hay que volver a cargarlas. Guardala donde guardan el resto de los secretos.

## Límites que conviene tener claros

- Esto ordena y comparte credenciales entre ustedes dos; no reemplaza a un gestor dedicado
  (Bitwarden, 1Password) para lo más crítico: no tiene 2FA propio, ni rotación, ni historial.
- Quien tenga acceso al entorno de Vercel puede leer `CREDENCIALES_KEY` y, con el dump del KV,
  descifrar todo. El cifrado protege el dato en reposo, no contra alguien con acceso al deploy.
- No hay registro de quién vio qué. Sí queda **quién la cargó o modificó por última vez**, que
  se muestra en la tabla.
