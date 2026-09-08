# Despliegue de MineFleet

## 1. Vercel gratis para la demostración, sin GitHub

Esta configuración publica React como archivos estáticos y Express como una función Node.js; PostgreSQL vive en Neon. Usa la raíz del proyecto, no solamente `frontend/`. Se incluyen `vercel.json` y `api/index.js`.

### Base de datos

1. Crea un proyecto en el plan Free de [Neon](https://neon.com/docs/introduction/plans).
2. En **Connect**, selecciona conexión con pooling y copia la cadena PostgreSQL. El hostname suele incluir `-pooler`.
3. Esa cadena será `DATABASE_URL`. Mantén TLS; puedes usar `sslmode=verify-full` para verificar el certificado. No uses la dirección Docker `postgres:5432` en Vercel.

Neon ofrece [pooling en su plan Free](https://neon.com/docs/connect/connection-pooling). El pool de MineFleet está limitado a cinco conexiones por instancia. Las tablas se crean de forma idempotente y el seed se ejecuta una sola vez si la flota está vacía.

### Proyecto de Vercel

Desde la carpeta raíz:

```bash
npx vercel login
npx vercel link
```

Selecciona tu cuenta personal y crea un proyecto. No hace falta reconectar el repositorio de GitHub. Si aparecen ajustes de framework, usa **Other**, Node.js **22.x**, y conserva los comandos definidos en `vercel.json`:

- Install: `npm ci && npm ci --prefix frontend`
- Build: `npm run build`
- Output: `frontend/dist`

Antes de publicar, abre **Project → Settings → Environment Variables** y configura:

| Variable                          | Valor                                                                    |
| --------------------------------- | ------------------------------------------------------------------------ |
| `DATABASE_URL`                    | Cadena pooled de Neon con TLS                                            |
| `NODE_ENV`                        | `production`                                                             |
| `JWT_SECRET`                      | Secreto aleatorio de al menos 32 caracteres                              |
| `ADMIN_EMAIL`                     | Correo de acceso de prueba                                               |
| `ADMIN_PASSWORD`                  | Contraseña de al menos 12 caracteres                                     |
| `ADMIN_NAME`                      | Nombre visible del supervisor                                            |
| `VIEWER_EMAIL`, `VIEWER_PASSWORD` | Cuenta opcional de consulta                                              |
| `SEED_DEMO`                       | `true` para la evaluación                                                |
| `COOKIE_SECURE`                   | `true`                                                                   |
| `CRON_SECRET`                     | Secreto aleatorio para el endpoint de cola                               |
| `METRICS_TOKEN`                   | Secreto aleatorio para métricas                                          |
| `QUEUE_TARGET_URL`                | Opcional: receptor HTTPS real de eventos                                 |
| `WEBHOOK_SECRET`                  | Obligatorio si configuras receptor; 32 caracteres aleatorios como mínimo |

Puedes usar **Production** y **Preview**, preferiblemente con bases distintas. Para generar cada secreto:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

No pegues claves en el código, en variables `VITE_*` ni en Git. `.env` y `.vercel/` están excluidos del repositorio.

Publica:

```bash
npx vercel --prod
```

Vercel devuelve la URL `https://<proyecto>.vercel.app`. Ábrela, inicia sesión, crea un turno con sus recursos y comprueba `/api/health`. Añade esa URL al README y a los enlaces de la evaluación. Las credenciales de la guía local solo se aplican si las elegiste también como variables de Vercel.

Los usuarios iniciales se insertan si no existen. Cambiar `ADMIN_PASSWORD` después del primer inicio **no cambia una contraseña almacenada**. El reinicio demo tampoco modifica usuarios. Una gestión completa de usuarios queda fuera de esta entrega.

### Qué significa “gratis” aquí

[Vercel Hobby](https://vercel.com/docs/plans/hobby) está orientado a proyectos personales no comerciales, con límites de uso. Es una opción para esta demo; para una operación comercial hay que revisar el plan aplicable. Neon también tiene cuotas: el plan gratuito no implica capacidad ilimitada.

El cron incluido ejecuta `/api/cron/outbox` **una vez al día**, en un lote de hasta cinco eventos. En [Hobby los cron jobs no pueden ejecutarse más de una vez al día](https://vercel.com/docs/cron-jobs/usage-and-pricing), y la ejecución no tiene precisión de minuto. Si hay más eventos o fallos, quedan pendientes para la siguiente invocación. Vercel agrega `Authorization: Bearer <CRON_SECRET>` al cron.

La versión Vercel no inicia un worker con `setInterval`. Para recuperación rápida necesitas un worker persistente en otro host o un scheduler externo que llame al endpoint autenticado; eso requiere configurar ese servicio y revisar sus condiciones. Sin receptor configurado, los eventos se guardan pero no se declaran entregados.

### Docker y Vercel

La [documentación actual de Vercel admite imágenes OCI como funciones](https://vercel.com/kb/guide/does-vercel-support-docker-deployments), pero eso no ejecuta este stack de Docker Compose con PostgreSQL, worker continuo, Prometheus y Grafana. La configuración entregada para Vercel usa Node.js y archivos estáticos. Para desplegar todos los contenedores juntos, utiliza la opción siguiente. No se ha validado aquí una publicación mediante Vercel Container Registry.

## 2. Docker completo en tu computadora o una VPS

```bash
npm ci
npm run setup
docker compose --profile monitoring up -d --build
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
