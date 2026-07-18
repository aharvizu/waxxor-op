# Programación de Recurrencias

> Status: shipped 2026-07-18, parte de Recurrentes. Motor puro en `src/lib/recurrence.ts` — sin dependencias nuevas, sin RRULE de terceros.

## Por qué una implementación propia y no RRULE

Se evaluó `rrule` (la librería más común para esto) pero las reglas requeridas por el spec (diaria/cada N días/laborales, semanal/múltiples días/cada N semanas, mensual día fijo o último día o "primer lunes", trimestral, semestral, anual, `endAt`, `maxOccurrences`) son un subconjunto pequeño y bien acotado de RRULE, y el requisito de **timezone IANA con corrección de DST por fecha local** (no por instante UTC fijo) necesita un tratamiento cuidadoso independientemente de la librería de repetición usada. Una implementación propia de ~250 líneas, pura y 100% unit-testada, es más simple de auditar y mantener que integrar y envolver una dependencia externa para este alcance. Documentado como decisión, no como descuido — CLAUDE.md: "no agregues dependencias sin justificar".

## Modelo de campos (`ScheduleFields`)

```ts
{
  frequency: "daily"|"weekly"|"monthly"|"quarterly"|"semiannual"|"annual"|"weekdays"|"custom",
  interval: number,        // cada N periodos
  daysOfWeek: number[]|null,  // ISO 1(lun)–7(dom), para weekly/custom
  dayOfMonth: number|null,    // 1–31, o -1 = último día del mes
  monthOfYear: number|null,   // 1–12, para annual
  weekOfMonth: number|null,   // 1–4, o -1 = última semana (con daysOfWeek[0])
  timeOfDay: string,       // "HH:MM", hora local en `timezone`
  timezone: string,        // IANA, ej. "America/Mexico_City"
  startAt: string,         // YYYY-MM-DD
  endAt: string|null,
}
```

Estos son **columnas tipadas de Postgres**, no solo JSON — spec §3: "no guardar reglas de negocio importantes solo en JSON si requieren consultas o integridad relacional". El índice `(organizationId, status, nextRunAt)` depende de que `nextRunAt` sea una columna real, calculada y persistida.

## Reglas soportadas

| Frecuencia | Ejemplo | Campos usados |
|---|---|---|
| `daily` | cada día / cada 2 días | `interval` |
| `weekdays` | solo lun–vie | (ninguno adicional) |
| `weekly` / `custom` | cada lunes; lun/mié/vie; cada 2 semanas | `daysOfWeek`, `interval` |
| `monthly` | día 1; día 15; último día; primer lunes; cada 3 meses (vía `quarterly`) | `dayOfMonth` **o** `weekOfMonth`+`daysOfWeek[0]`, `interval` |
| `quarterly` / `semiannual` | cada 3 / 6 meses | igual que `monthly`, paso multiplicado |
| `annual` | cada 15 de enero | `monthOfYear`, `dayOfMonth` |

No hay editor cron visible — la UI (`RecurrenceWizard`) traduce estas opciones a controles simples (botones de día de semana, selects numéricos) y `describeSchedule()` genera la frase legible ("el primer lunes de cada mes a las 09:00 (America/Mexico_City)") que se muestra en el directorio y en la revisión del asistente.

## Zona horaria y DST

1. Cada recurrencia guarda su `timezone` IANA — nunca se usa la zona horaria del proceso del servidor.
2. `zonedTimeToUtc(date, timeOfDay, tz)` convierte una fecha+hora local a instante UTC con **corrección de dos pasadas**: calcula un instante candidato, verifica qué fecha/hora local produce ese instante en `tz`, y corrige el delta — esto absorbe el cambio de offset por DST sin necesitar tablas de reglas de zonas horarias propias (usa `Intl.DateTimeFormat` del runtime de Node/V8, que sí las tiene).
3. **La clave de ocurrencia (`occurrenceKey`) es la fecha local calendario** (`YYYY-MM-DD`), no el instante UTC. Esto es lo que garantiza que un cambio de horario de verano dentro del rango de una recurrencia diaria nunca duplique ni pierda una ocurrencia — cada día local produce exactamente una clave, sin importar que su offset UTC cambie.
4. **Huecos de DST** (ej. 2:30am que no existe el día del "spring forward"): la corrección converge al instante inmediatamente después del salto — nunca produce `Invalid Date` ni una ocurrencia perdida (unit-tested contra América/Nueva York 2026-03-08).
5. **`nextRunAt` se compara por instante**, no por fecha: `computeNextRun` solo avanza a la siguiente ocurrencia si el instante calculado ya pasó — una ocurrencia de hoy cuya hora aún no llega sigue siendo la próxima ejecución elegible.

## `endAt` y `maxOccurrences`

Ambos opcionales e independientes; `isExhausted()` (pura) determina cuál se cumple primero:
- Si `maxOccurrences` se alcanza → la recurrencia pasa a `completed` (fue una decisión intencional del usuario).
- Si `endAt` se supera sin más ocurrencias → pasa a `expired` (corte por tiempo).

## Fechas relativas del objeto generado

`dueOffsetDays`/`startOffsetDays` en la plantilla se suman a la fecha **local** de la ocurrencia (`addDays`, aritmética de calendario pura, sin husos horarios de por medio). **No se simulan días hábiles** — no existe un calendario laboral de referencia para offsets de negocio (el único calendario laboral del sistema es el de SLA, `business-time.ts`, con un alcance distinto). Documentado como limitación explícita, no implementado silenciosamente con una aproximación incorrecta.

## Pruebas

28 casos en `src/lib/recurrence.test.ts` cubren cada rama de frecuencia, los límites de `endAt`/`maxOccurrences`, timezone/DST (incluyendo el hueco de primavera) y la descripción legible. Ver también `docs/features/recurring.md` §Pruebas.
