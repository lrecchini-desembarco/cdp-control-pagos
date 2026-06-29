# Reseñas (QR → Google)

Sistema de reseñas de clientes vía QR, con **dos lados**.

## Consumidor (público, sin login) — `/review`
Flujo **directo a Google** (lo más corto posible):
1. Escanea el QR → cae en la bienvenida.
2. **Busca/elige su local** (typeahead, con 100+ locales).
3. Toca **“Calificar … en Google”** → lo lleva **directo a Google Maps** a dejar la reseña.

No hay calificación interna: la opinión se deja en Google (es lo que mueve la
reputación pública). Cada vez que alguien toca el botón, registramos una
**derivación** (local + momento) para medir el embudo — la reseña en sí queda en Google.

Variantes del QR (mismo `/review` con query):
- `/review` → todos los locales.
- `/review?m=tasty` (o `desembarco`) → solo los de esa marca.
- `/review?l=<Local>` → preseleccionado (QR por local puntual).

Si un local no tiene link de Google cargado, el botón avisa que no está habilitado.

## Admin (logueado) — `/resenas` (consola)
- **Generador de QR**: General / por marca (dinámico) / por local. Descargar PNG e
  **imprimir póster**. URL pública del QR editable (para dominio/túnel antes del deploy).
- **Locales + link de Google**: alta/edición; el link es el de “escribir reseña”
  (Google Maps → Reseñas → Escribir → copiar enlace). Sin ese link, el local no se
  puede calificar.
- **Reputación Google** (snapshot del Excel `Maps`): ★ promedio, total de reseñas y
  ★ por local (`lib/google-ratings.json`). Es una foto; para verlo en vivo habría que
  reimportar o conectar la Google Business Profile API.
- **Derivaciones a Google**: cuántos clientes derivamos a Google, total y por local
  (el embudo que sí podemos medir de nuestro lado).

## Piezas técnicas
| Archivo | Qué hace |
|---|---|
| `components/views/ReviewPublic.tsx` | Pantalla del consumidor (público) |
| `app/review/page.tsx` + `middleware.ts` | Ruta pública (sin login) |
| `lib/locales-store.ts` + `app/api/locales` | Locales (nombre, marca, googleUrl) |
| `lib/derivaciones-store.ts` + `app/api/derivaciones` | Registro de derivaciones (POST público, GET admin) |
| `lib/google-ratings.ts` + `lib/google-ratings.json` | Snapshot de rating de Google por local |
| `components/views/ResenasView.tsx` | Consola admin (QR, locales, reputación, derivaciones) |

## Notas
- `/api/derivaciones` POST es público (lo llama el consumidor). Es solo un contador;
  si hiciera falta, se le puede sumar rate-limit/anti-spam más adelante.
- Como todo lo demás, los datos viven en el store (`.data` local; en prod, migrar a
  KV/DB junto con el resto).
