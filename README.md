# MineFleet — Control de operaciones mineras

Aplicación para programar equipos y operadores, registrar mantenimiento y anticipar bloqueos por uso. React + TypeScript + Express + PostgreSQL. Incluye autenticación JWT, roles, operaciones idempotentes, auditoría y una cola persistente para integraciones.

## Inicio rápido con Docker

Requisitos: Node.js 22 y Docker Desktop con contenedores Linux. Desde la raíz del proyecto:

```bash
npm ci
npm run setup
docker compose up -d --build
```

`setup` crea `.env` con secretos aleatorios sin sobrescribir una configuración existente. Compose levanta PostgreSQL, aplicación, worker y receptor de eventos. Los volúmenes conservan los datos al reiniciar. **Prometheus y Grafana son opcionales y no se necesitan para ejecutar ni evaluar la aplicación.**

| Acceso local           | Dirección             | Credenciales de demostración                           |
| ---------------------- | --------------------- | ------------------------------------------------------ |
| Aplicación, supervisor | http://localhost:4000 | `supervisor@minefleet.local` / `MineFleet.Demo2026!`   |
| Aplicación, consulta   | http://localhost:4000 | `consulta@minefleet.local` / `MineFleet.Consulta2026!` |
| Grafana                | http://localhost:3001 | `admin` / `MineFleet.Grafana2026!`                     |
| Prometheus             | http://localhost:9090 | Solo expuesto en localhost                             |

Los accesos de Grafana y Prometheus solo están disponibles si habilitas explícitamente `docker compose --profile monitoring up -d`. Para la prueba bastan el panel **Trazabilidad y servicios** y los informes automatizados.

Estas contraseñas son exclusivamente de demostración. Para publicar, configura credenciales propias y `COOKIE_SECURE=true`; revisa [DESPLIEGUE.md](DESPLIEGUE.md).

El login muestra las cuentas de evaluación y permite rellenarlas con un clic cuando `SHOW_DEMO_CREDENTIALS=true`. Los scripts de preparación activan esta opción para la prueba; usa `false` y vuelve a desplegar para ocultarlas fuera de ese contexto. Solo muestra contraseñas que coinciden con las almacenadas. En Vercel se muestran las del archivo privado `.env.vercel.local`, no las contraseñas locales de esta tabla.

## Qué incluye

- Panel con disponibilidad, carga semanal, próximos turnos y prioridades de mantenimiento; diseño adaptable y tema claro/oscuro.
- **Programar turno:** fecha, jornada, duración, observaciones y varias parejas equipo + operador en un solo formulario. El servidor guarda todo o revierte todo.
- Certificación válida durante la jornada completa, incluidos turnos nocturnos; control de solapamientos y duplicados.
- Cierre con horas reales, bloqueo por umbral, asignaciones futuras en riesgo y liberación mediante mantenimiento.
- Cancelación auditada de asignaciones pendientes para reemplazar recursos.
- Proyección de siete fechas, desde hoy hasta hoy + 6, usando horas de turnos programados.
- JWT en cookie `HttpOnly`, sesión revocable, contraseñas con scrypt, límites de intentos y roles supervisor/consulta.
- `Idempotency-Key` persistida con el resultado de cada escritura. Los reintentos no duplican cierres ni horómetros.
- Auditoría transaccional, IDs de correlación, logs JSON y cola outbox con reintentos, recuperación tras reinicios y revisión manual de eventos agotados.
- Docker con usuario sin privilegios, healthchecks, volúmenes; Prometheus y dashboard de Grafana.

## Desarrollo local

```bash
npm ci
npm ci --prefix frontend
npm run setup
docker compose up -d postgres
npm run dev
```

Frontend en http://localhost:3000, API en http://localhost:4000. Para probar las integraciones con procesos locales, usa otras dos terminales:

```bash
npm run notifications
npm run worker
```

Para servir la compilación completa:

```bash
npm run build
npm start
```

PostgreSQL es obligatorio. **Si falla, la aplicación no cambia a memoria ni inventa confirmaciones.** Existe `DEMO_MEMORY=true` únicamente como vista previa temporal fuera de producción; no cumple el requisito de persistencia relacional y no tiene cola durable.

## Verificación

Para presentar todas las pruebas y generar un informe:

```bash
npm run test:evidence
```

El resultado queda en `artifacts/PRUEBAS.md`, con fecha, commit base y cada caso aprobado o fallido. Requiere PostgreSQL local levantado. Sigue el [guion de demostración de pruebas y caída/recuperación](docs/PRUEBA.md).

```bash
npm test
npm run test:integration
npm run build
```

- Pruebas unitarias de reglas, proyección e inyección de dependencias.
- Pruebas con **PostgreSQL real y dos instancias de API**: autenticación y roles, CSRF, idempotencia, cierres simultáneos, doble asignación, reversión por fallo, creación integral, turno nocturno, mantenimiento y cancelación.
- Pruebas de cola con receptor HTTP que falla y se recupera, reclamo entre workers, leases vencidos y eventos agotados.

`test:integration` requiere el PostgreSQL local y un usuario con permiso de crear bases. Crea una base aislada `minefleet_test_<aleatorio>` y la elimina al finalizar; nunca ejecuta los tests contra `mine_fleet`. `npm test` omite esa suite cuando no existe `TEST_DATABASE_URL`.

Verificación realizada el 8 de septiembre de 2026: **14 pruebas unitarias y 16 de integración aprobadas**, compilación de producción e imágenes Docker generadas. Se comprobó en navegador la creación de un turno con dos asignaciones, el diseño móvil, el tema oscuro y el acceso con las cuentas visibles en el login. Al detener el receptor, tres eventos permanecieron pendientes; al reiniciarlo se entregaron automáticamente, con tres registros únicos en el consumidor. El informe reproducible se genera con `npm run test:evidence`. Los monitores opcionales se verificaron previamente, pero no son necesarios para esta evaluación.

## Casos de prueba iniciales

Se cargan solo cuando `SEED_DEMO=true` y la flota está vacía. Las fechas se calculan al inicializar.

| Caso                    | Identificador                    | Cómo probarlo                                                        |
| ----------------------- | -------------------------------- | -------------------------------------------------------------------- |
| Cerca del mantenimiento | CAM-001, 246 h de 250 h          | Cerrar el turno de día de hoy con 8 h lo lleva a 254 h y lo bloquea. |
| Certificación vencida   | OP-003, Jorge Quispe             | El servidor rechaza asignaciones y explica el vencimiento.           |
| Equipo bloqueado        | EXC-101, 512 h                   | Registrar mantenimiento lo libera y conserva el historial.           |
| En taller               | CRG-301                          | No puede asignarse hasta registrar mantenimiento.                    |
| Riesgo futuro           | CAM-001 en una jornada posterior | Después del cierre crítico, su asignación queda en riesgo.           |

Para reemplazar expresamente la planificación demo, el script exige `SEED_CONFIRM=RESET` y `npm run seed`. Este comando borra los datos de flota, operadores y turnos; conserva usuarios, auditoría y eventos. No hay un botón público de reinicio.

## API y trazabilidad

`GET /api/health` es público. Las demás rutas de negocio requieren sesión y las escrituras requieren supervisor. Envía `X-Requested-With: MineFleet` en peticiones POST y una `Idempotency-Key` única por operación. Reutiliza exactamente esa clave para reintentar la misma operación.

| Ruta                                                                | Uso                                                           |
| ------------------------------------------------------------------- | ------------------------------------------------------------- |
| `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout` | Ingreso, sesión actual y revocación                           |
| `GET /api/equipment`, `GET /api/operators`, `GET /api/shifts`       | Consultas                                                     |
| `POST /api/shifts`                                                  | Turno y array `assignments` obligatorio                       |
| `POST /api/shifts/:id/assignments`                                  | Agregar un recurso a un turno existente                       |
| `POST /api/shifts/:id/assignments/:assignmentId/cancel`             | Liberar una asignación con motivo                             |
| `POST /api/shifts/:id/close`                                        | Horas reales del cierre                                       |
| `POST /api/maintenance`                                             | Mantenimiento y liberación                                    |
| `GET /api/projection`                                               | Proyección; acepta `reference_date=YYYY-MM-DD`                |
| `GET /api/audit-logs`, `GET /api/operations`                        | Bitácora y cola                                               |
| `POST /api/operations/retry/:id`                                    | Reintento autorizado de un evento agotado                     |
| `GET /metrics`                                                      | Métricas; requiere `Authorization: Bearer <METRICS_TOKEN>`    |
| `GET /api/cron/outbox`                                              | Lote limitado; requiere `Authorization: Bearer <CRON_SECRET>` |

Los rechazos de negocio responden `422` con todas las `violations`. Duplicados y claves reutilizadas con otro contenido responden `409`; sesión inválida `401`; rol insuficiente `403`. `X-Request-Id` permite correlacionar respuesta, logs y auditoría.

## Publicación y repositorio

La guía [DESPLIEGUE.md](DESPLIEGUE.md) explica paso a paso **Vercel con Docker + PostgreSQL en Neon**, importando este repositorio desde GitHub, y el despliegue completo con Docker Compose en una VPS. `Dockerfile.vercel` compila y sirve React + Express en un contenedor; `vercel.json` conserva el cron diario. `npm run setup:vercel` genera `.env.vercel.local` con credenciales privadas y secretos aleatorios: completa la conexión de Neon y carga esas variables en Vercel. [DECISIONES.md](DECISIONES.md) documenta arquitectura, reglas, garantías y límites.

Repositorio: [DiegoCA2803/Entrevista](https://github.com/DiegoCA2803/Entrevista). El remoto `origin` está conectado nuevamente por petición del propietario. No se ha creado un despliegue público durante esta modificación: añade aquí el enlace después de desplegar con tu cuenta y comprobar la aplicación. La imagen se verifica localmente; no se presenta esa prueba como un despliegue remoto en Vercel/Neon.
