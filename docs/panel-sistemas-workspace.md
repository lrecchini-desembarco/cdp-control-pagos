# Panel de Sistemas → Google Workspace

Pestaña admin-only (`/panel-sistemas/workspace`): lista todos los usuarios del
Workspace con su OU, una card flotante con permisos por usuario (admin, 2FA,
grupos, shared drives), y carga masiva de la foto de perfil corporativa sobre
varios usuarios a la vez.

Usa la **Admin SDK Directory API** + **Drive API** con un **service account +
domain-wide delegation** — es lo único que permite leer/escribir datos de
*todos* los usuarios del dominio sin que cada uno dé su propio consentimiento.
No usa la librería `googleapis`: firma el JWT a mano (mismo criterio que
`lib/google-auth.ts` para el login) para no sumar una dependencia pesada.

## Setup en Google Cloud + Admin Console (lo hace un super admin del Workspace)

1. **Google Cloud Console** → mismo proyecto que el login con Google (o uno
   nuevo) → **IAM y administración → Cuentas de servicio → Crear cuenta de
   servicio**. Nombre sugerido: `panel-sistemas-workspace`.
2. Generar una **clave** de esa cuenta (tipo JSON) y descargarla — de ahí salen
   `client_email` y `private_key`.
3. **Habilitar las APIs** en el proyecto: *Admin SDK API* y *Google Drive API*.
4. **Admin Console de Workspace** (admin.google.com) →
   **Seguridad → Control de acceso a datos → Delegación en todo el dominio** →
   **Agregar nueva**:
   - **ID de cliente**: el `client_id` numérico de la cuenta de servicio (está
     en el JSON descargado, o en el detalle de la cuenta de servicio en Cloud
     Console).
   - **Ámbitos OAuth** (los 4 exactos, separados por coma):
     ```
     https://www.googleapis.com/auth/admin.directory.user,
     https://www.googleapis.com/auth/admin.directory.group.readonly,
     https://www.googleapis.com/auth/drive.readonly
     ```
5. Elegir un **admin del dominio a impersonar** (una cuenta real, con permisos
   de administrador de Workspace) — el service account actúa "como" esa cuenta
   en cada llamada. No hace falta que sea super admin si esa cuenta ya tiene
   los roles de administrador delegado necesarios para leer usuarios, grupos y
   administrar shared drives.

## Variables de entorno (Vercel → proyecto → Settings → Environment Variables)
```
GOOGLE_WORKSPACE_SA_EMAIL         = panel-sistemas-workspace@<proyecto>.iam.gserviceaccount.com
GOOGLE_WORKSPACE_SA_PRIVATE_KEY   = "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_WORKSPACE_ADMIN_EMAIL      = admin@eldesembarco.com
```
El `private_key` del JSON tiene saltos de línea reales; al pegarlo como
variable de entorno hay que escaparlos como `\n` (una sola línea). El código
los vuelve a convertir en saltos reales antes de firmar.

Sin estas tres variables la pestaña muestra "Todavía no está configurado" en
vez de romper.

## Qué se ve en la card de un usuario
- Estado de la cuenta (activo/suspendido), rol admin (super admin / admin
  delegado), si tiene 2FA activo, último login.
- Grupos de Google a los que pertenece.
- Shared Drives a los que tiene acceso y su rol en cada uno — se calcula
  on-demand al abrir la card (lista todos los shared drives del dominio y
  revisa permisos en cada uno), no al cargar la lista completa.

## Foto de perfil masiva
Es **una sola foto corporativa genérica** que se aplica a los usuarios que se
tilden en la tabla (`PUT .../users/{email}/photos/thumbnail`, Admin SDK). No
se guarda la foto en ningún lado del sistema: se sube el archivo en el momento
y se aplica a cada email seleccionado, uno por uno, mostrando el resultado por
usuario (puede fallar para algunos y funcionar para otros).

## Implementación
- `lib/google-workspace.ts` — auth (JWT RS256 + domain-wide delegation),
  `listarUsuariosWorkspace()`, `detalleUsuarioWorkspace(email)`,
  `subirFotoMasiva(emails, bytes)`.
- `app/api/panel-sistemas/workspace/usuarios/route.ts` — GET lista / GET
  detalle (`?email=`).
- `app/api/panel-sistemas/workspace/foto/route.ts` — POST multipart (foto +
  emails) para la carga masiva.
- `app/panel-sistemas/workspace/page.tsx` — gate admin-only (mismo patrón que
  `/panel-sistemas/usuarios`).
- `components/views/WorkspaceView.tsx` — la UI.
