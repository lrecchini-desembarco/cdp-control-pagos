# Acceso con Google (Google Workspace)

Login con la cuenta de Google de El Desembarco. **Solo entran `@eldesembarco.com`**;
cualquier otra cuenta se rechaza. Reusa la sesión de siempre (cookie `cdp_sesion`),
así que el sistema de roles/accesos no cambia.

## Cómo entra la gente
- **Ya cargados**: conservan su rol (lo que tenían).
- **Nuevos del dominio**: entran y se crean solos con rol **"Sin acceso"** (solo ven
  la Ayuda). El admin les asigna el rol real desde **Usuarios**.
- **Fuera del dominio**: rechazados (doble barrera: consent *Interno* + chequeo en código).

> No hay contraseñas: la identidad la pone Google. (Queda un "acceso con clave" de
> respaldo, oculto, por si hace falta durante la transición; se puede sacar después.)

## Setup en Google Cloud (lo hace un admin de Workspace)
1. [console.cloud.google.com](https://console.cloud.google.com) con una cuenta `@eldesembarco.com`.
2. Crear/elegir un proyecto.
3. **APIs y servicios → Pantalla de consentimiento de OAuth** → tipo **Interno** →
   nombre "CDP · Control", email de soporte → Guardar.
4. **Credenciales → Crear credenciales → ID de cliente de OAuth** → tipo **Aplicación web**.
   - **URIs de redireccionamiento autorizados** (exactos):
     - `https://cdp-control-pagos.vercel.app/api/auth/google/callback`
     - `http://localhost:3000/api/auth/google/callback`  (para desarrollo)
   - (Si más adelante hay dominio propio, agregar también su `/api/auth/google/callback`.)
5. Copiar **Client ID** y **Client Secret**.

## Variables de entorno (en Vercel → proyecto → Settings → Environment Variables)
```
GOOGLE_CLIENT_ID       = xxxxxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET   = xxxxxxxx
# opcional (default eldesembarco.com):
# GOOGLE_ALLOWED_DOMAIN = eldesembarco.com
```
El secreto va SOLO como variable de entorno; no se hardcodea. Después del cambio de
envs hay que **redeploy**.

## Probar
- `/login` → **Entrar con Google** → elegir la cuenta `@eldesembarco.com` → entra.
- Probar con una cuenta que NO sea del dominio → debe rechazar (`?error=dominio`).
- Un usuario nuevo entra como **"Sin acceso"**; asignarle rol en **Usuarios**.

## Implementación
- `lib/google-auth.ts` — arma la URL de consent, intercambia el `code` por el `id_token`
  (server-to-server, confiable), valida dominio.
- `app/api/auth/google/start` — genera `state` anti-CSRF y manda a Google.
- `app/api/auth/google/callback` — valida `state`, chequea dominio, `ensureUsuario()`
  (auto-provisión "pendiente"), setea la cookie `cdp_sesion` y redirige al home.
- `lib/users-store.ts` `ensureUsuario()` y rol `pendiente` en `lib/roles.ts`.
