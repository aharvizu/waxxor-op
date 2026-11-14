# Levantamientos (Sales)

> Status: construido 2026-11-14. Rutas `/assessments`, `/assessments/new`, `/assessments/[id]`, `/assessments/[id]/edit`.
> Origen: pedido del dueño — "una sección para crear levantamientos para tener información necesaria de los clientes y poder generar propuestas o solo tenerlo como base de datos". No había formato previo; el cuestionario se diseñó aquí.

## Qué es

Un análisis **básico** del entorno de TI de un cliente o prospecto, que sirve como base de conocimiento y como punto de partida de sus propuestas. Se llena en una visita o llamada de 20–30 minutos.

## Cuestionario

Nueve secciones, 47 preguntas, en `src/lib/assessments/questionnaire.ts`: perfil, dominios y DNS, sitio web y alojamiento, correo y colaboración, protección de dispositivos, respaldos, red y acceso remoto, usuarios y capacitación, prioridades.

Criterios:

- Cada sección responde **qué tienen, quién lo controla y cuándo vence**.
- Preguntas cerradas donde se puede; "No se sabe" es una respuesta válida — que nadie sepa quién controla el dominio es el hallazgo.
- **Nada es obligatorio** salvo a quién se le hace: se guarda a medias y se completa después.
- Vive en código: las respuestas son un `jsonb` por clave, así que agregar una pregunta no requiere migración. **No renombrar una `key` usada.**

## Oportunidades

`deriveOpportunities` (`recommendations.ts`) convierte respuestas en oportunidades, cada una citando el hallazgo que la sustenta. Con plantilla de propuesta (Microsoft 365, SentinelOne, MSP360) ofrece **«Generar propuesta»**, que abre la propuesta con cliente y cantidades precargadas (buzones → licencias, equipos y servidores → agentes, TB → almacenamiento; los precios nunca). Capacitación y dominio/alojamiento se muestran como hallazgo sin botón: aún no tienen formato de propuesta.

Reglas conservadoras: sin respuesta no hay hallazgo.

## Modelo

Tabla `assessments`: `companyId` opcional (un prospecto se levanta antes de ser Empresa), `clientName`, contacto, `status` (`draft`/`completed`), `conductedOn`, `answers`, `notes`. `proposals.assessmentId` liga cada propuesta con el levantamiento del que nació. Auditado como `entityType: "assessment"`.
