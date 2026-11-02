# Monitoreo con Trialogic

El servidor reporta a Trialogic (https://trialogic-ia.vercel.app) cuando una petición responde **5xx** o se acerca al
límite de tiempo de Vercel. Está **apagado por defecto**: sin `TRIALOGIC_INGEST_URL` no hace nada.

## Cómo está conectado
`components/lib.js` → `midd(req, res)` llama a `monitorRequest`. Lo usan 53 de las 58 rutas de `pages/api`
(las demás no quedan vigiladas; para añadirlas, llama a `trialogic.monitorRequest(req, res, { slowMs: 8000, serverless: true })`
al inicio del handler).

## Activarlo
1. En Trialogic → **Monitoreo** → *Conectar un servidor* → proyecto **IBL_Server** → copia el enlace (se muestra una vez).
2. En Vercel → proyecto `ibl-server` → Settings → Environment Variables → `TRIALOGIC_INGEST_URL` (Production) y redespliega.

## Qué envía (y qué no)
Envía: estado HTTP, método, ruta **sin parámetros** (los ids se normalizan) y versión (`VERCEL_GIT_COMMIT_SHA`).
**Nunca** envía cuerpos de petición, cabeceras, cookies ni parámetros de la URL. Trialogic además limpia datos sensibles.

## Garantías
- No lanza errores ni bloquea; todo va en `try/catch` con tiempo límite de 2 s.
- En un 5xx espera como máximo 2 s a que salga el reporte antes de cerrar la respuesta (las funciones serverless
  se congelan al terminar); una respuesta 200 no se retrasa.
- Sin dependencias.

## Apagarlo
Quita `TRIALOGIC_INGEST_URL` en Vercel y redespliega.
