# Despliegue de MineFleet

## 1. Vercel con Docker + PostgreSQL en Neon

La aplicacion se publica como un contenedor React + Express usando `Dockerfile.vercel`. La base de datos se aloja por separado en Neon. Elige Free/Hobby para la demostracion, sujeto a las cuotas de cada proveedor.

Sigue las guias en este orden:

1. [Crear la base de datos y obtener DATABASE_URL en Neon](docs/NEON.md).
2. [Publicar el contenedor en Vercel desde GitHub](docs/VERCEL.md).
3. [Mostrar las pruebas automatizadas y demostrar caída/recuperación](docs/PRUEBA.md).

`npm run setup:vercel` genera `.env.vercel.local` con secretos y contraseñas aleatorios sin sobrescribir el archivo existente. Completa la conexion de Neon y carga las variables en Vercel. El archivo privado no se sube a GitHub ni se incluye en la imagen.

Vercel aloja el servidor HTTP; PostgreSQL conserva todos los datos fuera del contenedor. El worker continuo, Prometheus y Grafana pertenecen al despliegue completo de Docker que se explica abajo. El cron de Vercel procesa un lote diario si hay un receptor externo configurado.

## 2. Docker completo en tu computadora o una VPS

```bash
npm ci
npm run setup
docker compose up -d --build
docker compose ps
```

| Servicio        | Función                                                  |
| --------------- | -------------------------------------------------------- |
| `postgres`      | Persistencia de negocio, sesiones, idempotencia y cola   |
| `app`           | API + frontend, puerto local 4000                        |
| `worker`        | Consume la cola cada 5 segundos, lotes de hasta 10       |
| `notifications` | Receptor de prueba con firma HMAC y deduplicación por ID |
| `prometheus`    | Captura métricas cada 15 segundos y conserva siete días  |
| `grafana`       | Dashboard provisionado, puerto local 3001                |

Prometheus y Grafana son opcionales. Solo se inician al añadir `--profile monitoring`; no hacen falta para la evaluación ni para demostrar la cola.

El receptor de prueba guarda eventos en `notification_inbox`; no envía correos, SMS ni mensajes a terceros. Para una integración real cambia `QUEUE_TARGET_URL` en `x-app-env` de Compose y configura el mismo `WEBHOOK_SECRET` en el receptor.

### Publicar desde una VPS

1. Instala Docker Engine con Compose y copia este proyecto a la VPS; también puedes transferirlo por SSH/SFTP sin GitHub.
2. Genera `.env` con `npm run setup`, o crea uno siguiendo `.env.example`. Define contraseñas propias antes de arrancar por primera vez.
3. Cambia `COOKIE_SECURE=true` y configura HTTPS mediante un proxy inverso. Se incluye [docs/Caddyfile.example](docs/Caddyfile.example): apunta un dominio a la VPS y haz que Caddy reenvíe al puerto `127.0.0.1:4000`.
4. Ejecuta `docker compose --profile monitoring up -d --build`.
5. Abre `https://tu-dominio` y verifica login y datos.

Los puertos de Compose se publican únicamente en `127.0.0.1`. La aplicación se expone por el proxy HTTPS; PostgreSQL, Prometheus y Grafana pueden permanecer privados. Para acceder a Grafana desde tu computadora:

```bash
ssh -L 3001:127.0.0.1:3001 -L 9090:127.0.0.1:9090 usuario@IP_DE_TU_VPS
```

Después abre http://localhost:3001 y http://localhost:9090. El software Docker/Prometheus/Grafana no exige una licencia de pago para este uso, pero **la VPS y un eventual dominio tienen su propio costo**. Ejecutarlo en tu computadora no lo convierte en un enlace público permanente.

### Comprobar caída y recuperación de un servicio

En un entorno de prueba:

```bash
docker compose stop notifications
```

Registra un turno o mantenimiento. La operación queda confirmada en PostgreSQL y sus eventos permanecen `PENDING`. En **Trazabilidad y servicios → Cola de eventos**, verás intentos y el último fallo.

```bash
docker compose start notifications
docker compose logs --tail=50 worker
```

El worker vuelve a intentar cuando llega `available_at` y la entrega cambia a `DELIVERED`. Los retrasos son 5, 10, 20… segundos, hasta una hora. Tras diez fallos queda `DEAD` y el supervisor puede pulsar **Reintentar**. Un worker que se reinicia recupera los eventos cuyo lease de 30 segundos venció.

El receptor recibe `Idempotency-Key` y `X-MineFleet-Signature` (HMAC-SHA256 del cuerpo). Debe deduplicar el ID: si procesó el evento pero la respuesta se perdió, habrá una entrega repetida. El receptor incluido ya lo hace con una clave primaria.

Si se cae PostgreSQL, la operación no se confirma ni se sustituye por un dato en memoria. El frontend conserva la clave de una petición fallida en `sessionStorage`; al volver a enviarla con los mismos datos consulta el resultado guardado o ejecuta la operación una vez. Esto **no es una PWA offline** ni una cola de comandos disponible mientras la base de datos está caída.

### Operación cotidiana

```bash
docker compose ps
docker compose logs --tail=100 app worker
docker compose restart worker
docker compose stop
docker compose start
```

`docker compose down` elimina contenedores y red, pero conserva volúmenes. **No uses `down -v` si quieres conservar datos.** Para backups, ejecuta `pg_dump` dentro de PostgreSQL y copia el archivo fuera del contenedor. Ejemplo compatible con PowerShell:

```bash
docker compose exec postgres pg_dump -U mine_user -d mine_fleet -Fc -f /tmp/minefleet.dump
docker compose cp postgres:/tmp/minefleet.dump ./minefleet.dump
```

Los usuarios de PostgreSQL y Grafana se inicializan al crear sus respectivos volúmenes; cambiar sus variables después no modifica automáticamente las contraseñas ya almacenadas.

### Métricas y alertas

Grafana incluye disponibilidad, estado de PostgreSQL, tasa de solicitudes, latencia p95, errores 5xx, memoria, flota y estados de cola. Las alertas de Prometheus detectan API/BD no disponibles, eventos agotados y acumulación de pendientes. No se configuró Alertmanager ni envío a terceros.

Prometheus aporta métricas; la bitácora y los logs JSON aportan trazabilidad con `request_id` y `event_id`. No se presenta esto como tracing distribuido con spans: OpenTelemetry/Tempo/Loki quedan fuera. En Vercel las instancias son efímeras, por lo que las métricas de proceso no reemplazan un colector persistente.

## Solución de problemas

- **Docker no conecta:** inicia Docker Desktop y espera a que el motor Linux esté listo.
- **Puerto 4000 ocupado:** detén el `npm start` local antes de levantar el contenedor `app`.
- **503 en Vercel:** revisa `DATABASE_URL`, conexión SSL, credenciales y `JWT_SECRET`; consulta los logs del despliegue.
- **Login vuelve a la pantalla inicial en HTTP local:** usa `COOKIE_SECURE=false` solo para localhost. En HTTPS público debe ser `true`.
- **No aparecen datos demo:** `SEED_DEMO=true` solo carga cuando la flota está vacía. No sobrescribe una base existente.
- **Cola pendiente sin intentos:** revisa `QUEUE_TARGET_URL`, que el worker esté activo o que el cron haya sido invocado.
- **Base heredada con intervalos distintos dentro del mismo tipo:** concilia esos datos antes de agregar la restricción `fk_equipment_type_interval`. El arranque falla explícitamente; no corrige historiales de manera silenciosa.

Las condiciones de los proveedores se verificaron contra sus documentos oficiales el 8 de septiembre de 2026. El despliegue público requiere la cuenta y configuración del propietario; no se incluye una URL ficticia.
