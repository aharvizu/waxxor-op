# Background Jobs / Scheduled Execution

> Status: adopted 2026-07-18, para la feature Recurrentes. Primer y único mecanismo de ejecución programada en Watson.

## Auditoría de infraestructura existente (antes de implementar)

Watson no tenía ninguna infraestructura de cron/colas/jobs previa. El repositorio es Next.js 16 sobre Neon Postgres (serverless), sin `vercel.json`, sin worker process, sin cola (Redis/BullMQ/etc.), sin `node-cron` ni dependencia de scheduling. La convención de despliegue (`.env` no `.env.local`, Neon como base de datos serverless) apunta fuertemente a **Vercel** como plataforma objetivo — es la combinación estándar Next.js + Neon.

**Opción elegida: Vercel Cron** invocando un endpoint de API protegido. Razones:
- Cero dependencias nuevas (`vercel.json` es configuración, no código).
- Vercel Cron es HTTP: simplemente llama a una URL con un método y un header — el endpoint es una API route normal de Next.js, testeable localmente sin el cron real.
- No requiere infraestructura adicional (no hay Redis, no hay worker process separado que mantener vivo).
- Encaja con "endpoint protegido invocado por cron" que el spec ofrece como opción explícita.

**Opciones descartadas**: colas (Redis/BullMQ) — over-engineering para un lote de ≤50 recurrencias cada 10 minutos; `node-cron` en proceso — no sobrevive a despliegues serverless (cada invocación de función es efímera, no hay proceso persistente); proveedor externo de cron — spec prohíbe integrar un proveedor externo nuevo sin aprobación.

## El endpoint (`src/app/api/cron/recurrences/route.ts`)

```
GET /api/cron/recurrences
Authorization: Bearer <CRON_SECRET>
```

- **Método**: solo `GET` (Next.js App Router rutea por método; no hay handler para otros verbos → 405 automático).
- **Autenticación**: header `Authorization: Bearer <CRON_SECRET>`, comparado contra la variable de entorno `CRON_SECRET`. Sin la variable configurada, responde `503` (nunca ejecuta sin secreto). Con secreto incorrecto o ausente, `401`. **No hay ejecución pública posible.**
- **Vercel Cron envía este header automáticamente** cuando `CRON_SECRET` está configurado como variable de entorno del proyecto — no requiere configuración adicional en `vercel.json` más allá de la ruta y el schedule.
- **Respuesta**: solo contadores (`processed`, `succeeded`, `failed`, `duplicatePrevented`) y duración — nunca mensajes de error individuales ni identificadores sensibles. Los detalles de cada fallo quedan en `recurrence_executions`, consultables solo desde la app autenticada.
- **Logging**: inicio y fin con duración van a `console.log`/`console.error` (capturados por los logs de la plataforma de despliegue).
- **`maxDuration = 60`**: límite razonable para un lote de 50 recurrencias con generación transaccional por ocurrencia.

## Variables de entorno

| Variable | Requerida | Descripción |
|---|---|---|
| `CRON_SECRET` | Sí, en producción | Secreto compartido para autenticar al invocador del cron. Generar con `openssl rand -hex 32` o similar; configurar en el dashboard de Vercel (Settings → Environment Variables) y localmente en `.env` si se quiere probar el endpoint HTTP real (no necesario para desarrollo — ver runner local). |

## `vercel.json`

```json
{
  "crons": [
    { "path": "/api/cron/recurrences", "schedule": "*/10 * * * *" }
  ]
}
```

Cada 10 minutos, acorde a la recomendación del spec (5–10 minutos) y al lote máximo de 50 (`RECURRENCE_BATCH_LIMIT`). Ajustar el `schedule` si el volumen de recurrencias crece; documentar el cambio aquí.

## Ejecución local sin cron desplegado

El spec exige explícitamente no depender de que el cron real esté configurado para poder probar. Dos vías, ambas llaman a la **misma** función `runDueRecurrences`:

1. **Script de desarrollo**: `npx tsx scripts/run-recurrences.ts [batchLimit]` — no requiere `CRON_SECRET`, no requiere servidor corriendo, imprime cada resultado por consola.
2. **Endpoint HTTP local**: si se quiere probar la ruta real, arrancar el servidor (`npm run dev` o `npm run start`), configurar `CRON_SECRET` en `.env`, y `curl -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/cron/recurrences`.

## Verificación en producción

```
curl -H "Authorization: Bearer $CRON_SECRET" https://<tu-dominio>/api/cron/recurrences
```

Respuesta esperada: `{ "ok": true, "durationMs": N, "processed": N, "succeeded": N, "failed": N, "duplicatePrevented": N }`. Revisar los logs de Vercel (Functions → `/api/cron/recurrences`) para confirmar invocaciones periódicas reales, y la pestaña Historial de cualquier recurrencia activa para confirmar que sus ejecuciones tienen `executionSource: "scheduler"`.

## Recuperación ante fallos (el cron no corrió)

Si el cron estuvo caído (despliegue roto, `CRON_SECRET` mal configurado, límite de Vercel Cron alcanzado) y hay recurrencias con `nextRunAt` vencido sin procesar:

1. Corregir la causa (variable de entorno, despliegue).
2. Verificar `/recurring?view=overdue` para ver qué quedó pendiente.
3. Para cada una: **Ejecutar ahora** cubre la ocurrencia inmediata; **Backfill** (SuperAdmin/Administrator/Director) cubre un rango de ocurrencias perdidas de forma controlada y auditada, con límite de 31 y preview antes de confirmar.
4. El próximo ciclo normal del cron retoma el calendario automáticamente una vez `nextRunAt` esté al día.

## Concurrencia y aislamiento

`runDueRecurrences` procesa el lote de recurrencias vencidas **de cualquier organización** en una sola invocación (no hay instancia separada por tenant — el aislamiento es a nivel de fila, ver `docs/architecture/organization-and-data-isolation.md`), pero cada recurrencia se procesa en su propio `try/catch` — un fallo nunca detiene el resto del lote (spec §9: "cada recurrencia debe fallar de manera aislada"). Si dos invocaciones del cron se solapan (ej. una tardía y la siguiente programada), el índice único de `occurrenceKey` hace que la segunda pierda la carrera silenciosamente (`duplicate_prevented`) — ver `docs/architecture/recurrence-idempotency.md`.
