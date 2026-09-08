# Decisiones de MineFleet

## Alcance y arquitectura

Se conserva React + TypeScript + Express y PostgreSQL. El núcleo es un **monolito modular** con repositorios y servicios de dominio; no son microservicios de equipos/operadores desplegados por separado. Las reglas cruzan esas entidades y necesitan una confirmación atómica. Separarlas en procesos aumentaría los fallos parciales sin un beneficio demostrado para esta escala.

La integración externa sí está separada: una outbox transaccional, un worker independiente y un receptor de ejemplo. Docker Compose puede interrumpir ese receptor sin perder operaciones de negocio.

## Modelo relacional

- `equipment_types`: catálogo de tipo e intervalo. El dataset usa 250 h para los cinco tipos, sin implicar que sea el intervalo real del fabricante.
- `equipment`: código único, tipo, horómetro y base del último mantenimiento. Una FK compuesta garantiza que el intervalo coincide con el catálogo de su tipo. Cambiar el catálogo requiere una migración controlada; no se permite alterar el ciclo de un único equipo desde la pantalla.
- `operators` y `certifications`: un operador puede tener varias acreditaciones por tipo y vigencia. Se preservan las anteriores al registrar una renovación.
- `shifts`: fecha, jornada y duración. `UNIQUE(date, period)` evita crear dos identidades para la misma jornada. Día empieza 06:00 y noche 18:00, hora de Perú (UTC−5).
- `assignments`: relación turno/equipo/operador. Índices únicos parciales impiden duplicar un equipo u operador en el turno salvo registros cancelados. Cancelar conserva el historial y libera el recurso para una nueva asignación.
- `maintenance_records`: fecha, horómetro real, tipo, observaciones y responsable autenticado.
- `app_users` y `auth_sessions`: identidad con hash de contraseña, rol y sesiones JWT revocables.
- `idempotency_keys`: actor, clave, huella de la petición y respuesta confirmada.
- `audit_logs` y `outbox_events`: evidencia local y entrega externa pendiente. `notification_inbox` demuestra la deduplicación del consumidor.

PostgreSQL usa NUMERIC y restricciones de integridad. La aritmética de aplicación redondea los horómetros a dos decimales. La memoria solo sirve para tests unitarios o una vista previa explícita; no es persistencia relacional ni fallback de producción.

## Decisiones de negocio abiertas

### 1. Equipo bloqueado con turnos futuros

El cierre marca sus asignaciones pendientes `EN_RIESGO` y conserva la razón. El panel muestra la alerta. El supervisor puede registrar mantenimiento o cancelar la asignación con motivo y agregar otro recurso. No se borran reservas ni se oculta su historia.

Se revalidan recursos al cerrar, para impedir que una reserva previa permita operar después de un bloqueo. El mantenimiento libera el equipo y restaura asignaciones de riesgo únicamente si la certificación sigue cubriendo toda la jornada; si no, conserva el riesgo con el motivo actualizado.

### 2. Excepciones de supervisor

**No se permite saltar las reglas de mantenimiento, vigencia o colisión**, ni siquiera con rol supervisor. La consigna permite decidir; se opta por mantener las invariantes de asignación. La autorización habilita la operación, no convierte en válido un equipo bloqueado. Los campos históricos de override permanecen en el esquema para compatibilidad, pero las nuevas solicitudes forzadas se rechazan.

### 3. Mantenimiento tardío

El nuevo ciclo parte del **horómetro real de la intervención**. Si el intervalo es 250 h y se atiende a 280 h, el siguiente umbral es 530 h. La demora queda en el historial; no se declara que el mantenimiento se realizó a 250 h. El horómetro registrado nunca puede retroceder respecto del actual. Si la intervención informa un valor mayor, se actualizan tanto el horómetro como la base del ciclo.

### 4. Horas reales distintas a las planeadas

La planificación no se reescribe. Al cerrar se guarda la duración real y se suma a cada equipo activo; la auditoría conserva ambas cifras y los bloqueos resultantes. Se aceptan 0–24 h reales y 0.5–24 h planificadas. Una asignación cancelada no recibe horas.

Esta versión utiliza **una duración real común por turno**, acorde al formulario de jornada. No modela pausas o trabajo individual distinto por equipo; con más tiempo añadiría partes de horas por asignación y control de inicio real. No hay una acción de reapertura que pueda sumar o descontar horas de forma ambigua.

### 5. Certificación que vence durante un turno nocturno

La fecha de vencimiento es válida hasta el final de ese día en Perú. Se calcula el final exclusivo del turno con su duración. Una noche de 8 h que empieza el 8 a las 18:00 termina el 9 a las 02:00; necesita una certificación vigente también el día 9. Si termina exactamente a medianoche, basta la vigencia del día anterior. La fecha de emisión tampoco puede ser posterior al inicio.

La regla se aplica al programar y se vuelve a comprobar con las horas reales al cerrar. Si varias causas fallan, se devuelven todas. No se depende de la zona horaria de la máquina ni de comparar solo `shift.date`.

### 6. Supervisores simultáneos

Cada comando HTTP se ejecuta en una transacción PostgreSQL. `AsyncLocalStorage` mantiene la misma conexión para todos los repositorios, auditoría e idempotencia. La respuesta HTTP se envía **después de COMMIT**.

Un `pg_advisory_xact_lock` común serializa las escrituras entre todas las instancias de la API. Es una decisión explícita para una sola operación minera con bajo volumen de comandos; simplifica la relación entre cierre, asignación y mantenimiento. Las lecturas siguen concurrentes. A mayor escala se sustituiría por bloqueos ordenados por recurso y una estrategia de serialización con reintentos.

Los índices únicos actúan además como defensa en PostgreSQL. Se validan cruces de horarios entre jornadas cuando una duración extendida produce solapamiento. Las pruebas usan dos instancias, dos pools y una base real; no simulan concurrencia con un array en memoria.

## Creación integral e idempotencia

`POST /api/shifts` exige al menos una pareja en `assignments`. Se comprueban todas las filas, incluidas repeticiones en el formulario, antes de persistir. La transacción revierte turno, asignaciones, auditoría y cola si falla cualquier parte. Se mantienen las observaciones que el repositorio anterior omitía.

Las escrituras exigen `Idempotency-Key`. La huella incluye método, ruta y cuerpo ya validado; la clave pertenece al usuario. Repetir la misma petición devuelve el mismo cuerpo y código con `Idempotency-Replayed: true`. Usar la clave para otro contenido da `409`. La clave y el resultado se guardan en la misma transacción que los efectos.

Los errores de validación o transacciones revertidas pueden reintentarse. El frontend conserva en `sessionStorage` la clave de solicitudes con fallo de red/servidor y la reutiliza al reenviar el mismo formulario. La retención termina si el usuario cierra esa sesión del navegador; el servidor conserva el registro de idempotencia. Una política de archivo/retención del historial requerirá definir una ventana contractual antes de borrar claves.

## Cola y recuperación

La evidencia local no se pierde si falla el receptor: el evento se inserta junto con el cambio de negocio. No se hace una llamada HTTP externa dentro de la transacción del turno. Si falla la auditoría local, se revierte el comando; no se responde éxito silenciosamente.

El worker reclama cada evento con `FOR UPDATE SKIP LOCKED`, un token de propiedad y un lease de 30 s. Se confirma la entrega solo con respuesta 2xx del receptor. Los fallos vuelven a `PENDING` con backoff exponencial de 5 s a 1 h. Después de 10 intentos quedan `DEAD` visibles para revisión. El supervisor puede reencolarlos y esa acción se audita. Un worker caído libera sus eventos al vencer el lease.

La garantía es **al menos una entrega**, no exactamente una entrega de red. El consumidor debe ser idempotente. El receptor demo usa `notification_inbox.id` como PK: si procesa un evento y se pierde la respuesta, la siguiente entrega no crea otro registro. Se firma el cuerpo con HMAC-SHA256 usando un secreto compartido.

La cola cubre eventos hacia la integración externa; no convierte las reglas de negocio en operaciones offline. Si PostgreSQL cae, no puede persistirse una nueva orden en la misma base; se devuelve error y se reintenta sin duplicar usando la clave. Una cola de comandos offline requeriría otro almacén durable, semántica de conflictos y aceptación explícita de trabajo pendiente.

En Docker el worker permanece activo. En Vercel Hobby el cron es diario y limitado a cinco eventos por invocación, por lo que es una demostración de entrega diferida, no recuperación inmediata. La guía explica el worker externo para mayor frecuencia.

## Proyección y observabilidad

La ventana contiene siete fechas: inicio a inicio + 6, inclusive. Se ordenan las jornadas, se agregan las horas planificadas de asignaciones activas y se identifica el primer turno que alcanza el umbral. Se incluyen reservas en riesgo como demanda prevista, suponiendo que el mantenimiento se realiza antes de ejecutarlas. Los equipos ya vencidos se señalan aparte.

Si falla la proyección, la respuesta lleva `isDegraded` y la interfaz advierte que solo muestra datos actuales; esos valores no son una previsión válida. Un fallo de PostgreSQL no se disfraza de disponibilidad con un fallback en memoria.

Prometheus mide HTTP, latencia, memoria, disponibilidad de PostgreSQL, flota y cola. Grafana presenta esos indicadores. La auditoría muestra responsable, detalles y `request_id`; el evento externo conserva ese contexto. Los logs no imprimen contraseñas, JWT ni cadenas de conexión. No se implementaron spans distribuidos ni alertas enviadas a terceros.

## Autenticación y permisos

JWT HS256 con algoritmo permitido explícitamente, issuer, audience, expiración de ocho horas y un identificador de sesión. Se usa cookie `HttpOnly`/`SameSite=Strict`, `Secure` en HTTPS, y se comprueba en PostgreSQL que la sesión no esté revocada y el usuario esté activo. Logout invalida el token incluso en otra instancia. El rol se lee de la base; no se confía en el formulario ni en un nombre de supervisor ingresado a mano.

Supervisor puede escribir; Consulta solo lee. Las mutaciones requieren un encabezado propio, JSON y no se habilita CORS abierto. Los intentos de login se limitan por cuenta e IP con almacenamiento compartido. No hay autorregistro, recuperación de contraseña, MFA ni consola de administración de usuarios. Las cuentas iniciales se crean desde variables de entorno; los hashes usan scrypt con salt aleatorio.

Para facilitar la evaluación, `SHOW_DEMO_CREDENTIALS=true` habilita un endpoint público con las cuentas demo y las muestra en el login. Solo devuelve las contraseñas configuradas que coinciden con el hash almacenado; no devuelve JWT_SECRET ni otros secretos. La opción está apagada por defecto en el servidor y se activa expresamente en los scripts de preparación de la demo. Se desactiva con `false` y un nuevo despliegue para uso fuera de la evaluación.

Prometheus y Grafana son un perfil opcional de Compose. No son dependencias del despliegue Vercel ni de las pruebas. La evidencia reproducible se genera con `npm run test:evidence` y el guion de `docs/PRUEBA.md`; distingue los fallos HTTP probados automáticamente, la caída real del receptor en Docker local y los límites del cron de Vercel.

## Qué se dejó fuera y siguientes pasos

- Partes de horas por equipo, inicio real, pausas y reapertura contable de jornadas.
- CRUD administrativo de usuarios, recuperación de acceso y MFA.
- Migraciones versionadas y despliegues de esquema separados del arranque; hoy el esquema es idempotente y conserva los datos existentes compatibles.
- Planes de mantenimiento del fabricante, múltiples faenas y configuración de intervalos desde la UI.
- Ventanas de retención, archivado de auditoría/outbox/idempotencia, backups programados y prueba de restauración.
- Calendario con arrastrar y soltar, paginación del catálogo, exportaciones y PWA offline.
- OpenTelemetry/Tempo, Loki, Alertmanager e integración real de notificaciones.

El stack completo está preparado para Docker Compose. Para Vercel se usa `Dockerfile.vercel`: React y Express se compilan dentro de Docker y se sirven desde un único proceso HTTP que escucha en `PORT=4000`. Se retiró el adaptador Node `api/index.js` y las reglas de publicación estática para evitar dos rutas de despliegue simultáneas. PostgreSQL se aloja en Neon; no se incorpora al contenedor efímero. El archivo `vercel.json` permite la detección del contenedor y conserva el cron diario. **No se ha publicado con la cuenta del propietario ni se afirma tener un enlace público verificado.** La imagen se verifica localmente; la conexión real a Neon y la publicación se realizan siguiendo DESPLIEGUE.md con las cuentas del propietario.

## Uso de IA y repositorio

Se utilizó **OpenAI Codex** para inspeccionar el proyecto, implementar autenticación, transacciones/idempotencia, cola, interfaz, pruebas y documentación, y para consultar documentación oficial de despliegue. Se ejecutaron pruebas unitarias, de integración con PostgreSQL y revisiones en navegador. Esta declaración no certifica que el autor haya revisado manualmente cada línea: esa revisión y la capacidad de explicarla siguen siendo parte de la entrega de la evaluación.

La versión previa del documento declaraba otras herramientas. Esa declaración histórica puede consultarse en Git; no se verifica ni se extiende aquí. Se conserva el historial local. El remoto `origin`, inicialmente retirado, se conectó nuevamente a `DiegoCA2803/Entrevista` por petición del propietario. No se inventan enlaces de despliegue ni se publican credenciales: `.env.vercel.local` está excluido de Git y de ambos contextos de despliegue.
