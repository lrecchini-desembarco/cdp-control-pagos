# Tutoriales — repositorio de instructivos

Sección del menú con cuatro pantallas independientes: **Tango**, **Ayres**, **Raven** y **Qlik**
(`/tutoriales/<sistema>`). Cada una lista los documentos de ese sistema con título, formato,
fecha de carga y tamaño, y para cada uno: **Ver online**, **Descargar** y (admin) **Subir nuevo**.

| Formato | Cómo se ve online | Descarga |
|---|---|---|
| `.pdf` | visor embebido del navegador (`<iframe>`) | original |
| `.docx` | convertido a HTML con **mammoth** en el server | original |
| `.doc` | HTML que dejó LibreOffice al precargarlo; si no está, solo descarga | original |
| `.csv` | tabla HTML | original |

El archivo original **siempre** queda disponible con su nombre y extensión
(`Content-Disposition: attachment`).

## Permisos

- **Ver y descargar:** todos los usuarios con sesión. Las cuatro rutas son universales
  (`UNIVERSALES` en `lib/roles.ts`), así que aparecen en el menú de cualquier rol.
- **Subir y borrar:** solo `admin`. Lo corta la API (`app/api/tutoriales/route.ts`), no la UI.

## De dónde salen los archivos

Tres orígenes, una sola lista (`lib/tutoriales-store.ts`):

1. **`seed`** — versionados en `public/tutoriales/`, anotados en `lib/tutoriales-seed.json`.
   Andan siempre, con o sin KV, y viajan con el deploy.
2. **`red`** — la carpeta compartida de la oficina (el SMB del Proxmox), si está seteada
   `TUTORIALES_DIR`. Ver abajo.
3. **`kv`** — lo que se sube desde la UI cuando no hay carpeta de red. Metadata en la key
   `tutoriales` y el archivo en `tutorial-<id>` (base64). Tope **3 MB** por archivo
   (el body de una función serverless no pasa de ~4,5 MB y base64 infla 33%).

## Precargar un tutorial (seed)

```bash
node scripts/seed-tutorial.mjs --seccion=ayres --titulo="Ayres POS — Instructivo" "C:\ruta\archivo.pdf"
```

Copia el original a `public/tutoriales/`, lo anota en `lib/tutoriales-seed.json` y —si es
`.doc`/`.docx` y hay LibreOffice instalado— deja también el HTML para verlo online.
Después: commit de los dos archivos (el original y el JSON).

> `.gitignore` ignora `*.pdf` en todo el repo, con una excepción explícita para
> `public/tutoriales/*.pdf`. Si precargás otro formato binario, revisá que no esté ignorado.

## Conectar la carpeta de red (SMB del Proxmox)

Seteando `TUTORIALES_DIR` la app deja de guardar en KV y usa la carpeta compartida como
fuente de verdad: lista lo que hay, sirve los archivos y **escribe ahí** lo que se sube
desde la UI. Un subdirectorio por sección:

```
<TUTORIALES_DIR>/tango/…
<TUTORIALES_DIR>/ayres/…
<TUTORIALES_DIR>/raven/…
<TUTORIALES_DIR>/qlik/…
```

```
TUTORIALES_DIR=\\proxmox\documentacion\tutoriales     # Windows (UNC)
TUTORIALES_DIR=/mnt/documentacion/tutoriales          # Linux (SMB montado)
```

**Importante:** esto solo funciona si el server llega al SMB. La app desplegada en Vercel
**no llega a la red de la oficina** — es la misma limitación que tiene Tango, resuelta ahí
con un bridge (`docs/tango-bridge.md`). Para usar el SMB hay dos caminos:

- **Correr la app dentro de la red** (una VM en el mismo Proxmox), con el share montado y
  `TUTORIALES_DIR` apuntando ahí. Es lo más directo.
- **Seguir en Vercel** y dejar los tutoriales en el seed + KV. La carpeta de red queda como
  archivo de la oficina, y lo que se publica en la app se precarga con el script.

Si `TUTORIALES_DIR` está seteada pero la carpeta no se puede leer, la vista no se rompe:
esa sección simplemente aparece sin los archivos de red (siguen el seed y lo de KV).
