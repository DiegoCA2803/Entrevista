# Paso 2: publicar MineFleet en Vercel con Docker

Primero completa [la base de datos en Neon](NEON.md). Esta configuración publica React + Express en una imagen Docker, con PostgreSQL fuera del contenedor. No publica el stack completo de Docker Compose.

## Archivos preparados

- `Dockerfile.vercel`: instala dependencias, compila frontend y backend y arranca el servidor como usuario sin privilegios.
- `vercel.json`: usa la detección del contenedor y programa el cron diario de la cola.
- `.dockerignore` y `.vercelignore`: excluyen secretos, dependencias locales y resultados de pruebas.
- `npm run setup:vercel`: crea `.env.vercel.local` con secretos y contraseñas aleatorios. Completa `DATABASE_URL` con Neon.

El contenedor sirve tanto `/` como `/api/*` y `/metrics`. Se retiró el adaptador `api/index.js`; no hay que crear una segunda función Node ni publicar `frontend/dist` por separado.

## Subir esta versión a GitHub

Desde la raíz de tu copia local, revisa y sube los cambios:

```powershell
git status
git add .
git commit -m "Prepare Docker deployment on Vercel with Neon"
git push -u origin main
```

El ejemplo supone que estás en `main`. Si trabajas en otra rama, sube esa rama y fusiónala a la que Vercel utilice como producción. `.env.vercel.local` no debe aparecer entre los archivos del commit. Si ya guardaste y subiste estos cambios, no necesitas crear otro commit.

## Importar el repositorio

1. Entra a [Vercel](https://vercel.com/) e inicia sesión con tu cuenta.
2. Abre **Add New → Project**.
3. Conecta GitHub si Vercel aún no tiene acceso y selecciona `DiegoCA2803/Entrevista`.
4. Pulsa **Import** y elige un nombre, por ejemplo `minefleet-prueba`.
5. Usa **Root Directory: `./`**, la raíz que contiene `Dockerfile.vercel`.
6. Si pide un framework, selecciona **Other**. Deja sin sobrescrituras los campos **Build Command**, **Install Command** y **Output Directory**; la instalación y compilación están dentro de Docker.
7. Antes de pulsar **Deploy**, agrega las variables del siguiente apartado.

Vercel detecta `Dockerfile.vercel` y construye el contenedor. Esta capacidad está en beta y disponible en todos los planes, con sus límites de uso: [Container Images](https://vercel.com/docs/functions/container-images). La ruta general de importación está descrita en [Vercel Git](https://vercel.com/docs/git).

**Si el proyecto ya existía en Vercel:** ve a Settings y elimina las sobrescrituras antiguas `npm run build`, `frontend/dist` y cualquier Root Directory `frontend`. Mantén la raíz `./` y el framework Other, guarda y vuelve a desplegar desde el commit actualizado.

## Variables de entorno

Abre `.env.vercel.local` en tu editor. En **Environment Variables** del formulario de importación, carga el archivo con **Import .env** si aparece esa opción; también puedes agregar cada nombre y valor manualmente. En un proyecto existente, usa **Settings → Environment Variables**. Selecciona **Production**.

| Variable                          | Qué poner                                                                             |
| --------------------------------- | ------------------------------------------------------------------------------------- |
| `DATABASE_URL`                    | La conexión pooled de Neon que acabas de completar                                    |
| `NODE_ENV`                        | `production`                                                                          |
| `PORT`                            | **`4000`**, también en el panel de Vercel                                             |
| `COOKIE_SECURE`                   | `true`                                                                                |
| `SEED_DEMO`                       | `true` para cargar los casos de evaluación                                            |
| `SHOW_DEMO_CREDENTIALS`           | `true` para mostrar las cuentas de prueba en el login; `false` fuera de la evaluación |
| `JWT_SECRET`                      | El valor aleatorio generado                                                           |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`   | El correo y contraseña generados; puedes elegir otros antes del primer arranque       |
| `ADMIN_NAME`                      | Nombre visible del supervisor                                                         |
| `VIEWER_EMAIL`, `VIEWER_PASSWORD` | Credenciales opcionales de consulta                                                   |
| `CRON_SECRET`, `METRICS_TOKEN`    | Los secretos aleatorios generados                                                     |
| `QUEUE_TARGET_URL`                | Déjala sin configurar si no tienes un receptor HTTPS externo                          |
| `WEBHOOK_SECRET`                  | El secreto generado; debe coincidir con el receptor si lo configuras                  |

Al agregar valores manualmente, no copies las comillas que delimitan `ADMIN_NAME`. No uses prefijos `VITE_` para secretos, ni copies `DATABASE_URL` o `QUEUE_TARGET_URL` del Compose local: sus nombres de red solo funcionan dentro de Docker local.

Las cuentas se crean una vez. **La contraseña pública inicial está en `ADMIN_PASSWORD` de `.env.vercel.local`**, y es diferente a la contraseña demo local del README. Cambiar esa variable después de crear el usuario no cambia su contraseña almacenada. Si borras y regeneras el archivo, perderás la copia de las credenciales anteriores.

Con `SHOW_DEMO_CREDENTIALS=true` el login muestra las cuentas Supervisor y Consulta y permite rellenarlas con un clic. Esta publicación de credenciales es intencional para la evaluación; usa solo datos demo. Configura `false` y vuelve a desplegar para ocultarlas fuera de la prueba. Si una contraseña de las variables ya no coincide con la almacenada, esa cuenta no se muestra.

En las opciones de variables del proyecto, conserva la exposición automática de variables de sistema de Vercel: la aplicación utiliza `VERCEL` para reconocer su proxy. Los cambios de variables se aplican a un despliegue nuevo; haz **Redeploy** después de modificarlas. [Variables de entorno](https://vercel.com/docs/environment-variables/managing-environment-variables).

## Desplegar y verificar

1. Pulsa **Deploy**. Los logs deben mostrar la construcción de una imagen desde `Dockerfile.vercel`.
2. Cuando aparezca **Ready**, abre la URL de producción `https://<nombre>.vercel.app`.
3. Abre `https://<nombre>.vercel.app/api/health`: debe responder `status: UP` y `database: PostgreSQL`. El primer arranque puede tardar más mientras prepara las tablas.
4. Inicia sesión con `ADMIN_EMAIL` y `ADMIN_PASSWORD` del archivo privado.
5. Comprueba que aparecen los casos demo y que puedes programar un turno con sus asignaciones.
6. Comprueba en Neon que hay registros usando las consultas de [NEON.md](NEON.md).
7. Abre la URL de producción en una ventana privada para confirmar que el evaluador puede llegar al login de MineFleet. Si Vercel muestra su propia pantalla de autorización, revisa **Deployment Protection** de ese proyecto; entrega una URL de producción accesible para la evaluación.
8. Añade al README la URL real y las credenciales de evaluación elegidas. Comparte únicamente una cuenta demo destinada a esa prueba; nunca JWT_SECRET ni la conexión de PostgreSQL.

Importar el repositorio permite desplegar posteriores commits de la rama de producción. También puedes desplegar manualmente, después de configurar las variables del proyecto:

```powershell
npx vercel login
npx vercel link
npx vercel --prod
```

## Cola, Grafana y alcance del plan gratuito

La aplicación publicada mantiene las reglas, JWT, idempotencia, auditoría y cola en PostgreSQL. Con un receptor HTTPS configurado, el cron procesa hasta cinco eventos una vez al día. Sin receptor, los eventos permanecen pendientes y la interfaz lo indica.

No se inicia `worker.ts` dentro del contenedor HTTP de Vercel: las funciones pueden escalar a cero. Para reintentos continuos necesitas el worker en otro host conectado a Neon. Prometheus y Grafana permanecen en el stack Docker local/VPS. Vercel no ejecuta nuestro archivo Compose: [alcance de Docker Compose](https://vercel.com/i/can-you-run-docker-compose-on-vercel).

El cron diario corresponde a los [límites de Hobby](https://vercel.com/docs/cron-jobs/usage-and-pricing). [Hobby](https://vercel.com/docs/plans/hobby) está destinado a proyectos personales no comerciales. La disponibilidad del contenedor en Hobby no significa recursos ilimitados; revisa las cuotas de Vercel y Neon y selecciona Free/Hobby para esta demostración.

## Si algo falla

Si aparecen errores `Cannot find module 'react'` o `react/jsx-runtime`, comprueba que estás desplegando la última versión de `vercel.json`: el `installCommand` debe estar dentro del servicio `app`, que usa `Dockerfile.vercel` como entrada. Vercel no permite `installCommand` en el nivel superior cuando existe `services`. Elimina las sobrescrituras antiguas de Build/Install/Output en Settings y vuelve a desplegar el commit actualizado sin caché. La configuración explícita sigue la [documentación de servicios con contenedores](https://vercel.com/docs/functions/container-images).

| Síntoma                                  | Revisión                                                                                              |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Pide `frontend/dist` o no detecta Docker | Confirma commit, raíz `./`, `Dockerfile.vercel` y elimina las sobrescrituras de build/output antiguas |
| Error de conexión o 503 al arrancar      | Revisa `DATABASE_URL`, TLS, base/usuario, contraseña y región; no uses `localhost` ni `postgres`      |
| La función no recibe tráfico             | Confirma `PORT=4000` en Settings y vuelve a desplegar                                                 |
| Login incorrecto                         | Usa ADMIN_PASSWORD del archivo de Vercel; no la contraseña de Docker local                            |
| No hay tablas en Neon                    | Abre `/api/health` y revisa los logs del primer arranque y permisos del usuario de la base            |
| No se entregan eventos                   | Hace falta un receptor externo y cron o worker; crear la cola no crea un receptor público             |
| Cambié variables y no se aplican         | Haz un nuevo despliegue / Redeploy                                                                    |

La imagen se comprueba localmente con PostgreSQL. La publicación real y la conexión a Neon quedan por verificar al ejecutar estos pasos con tus cuentas; no se afirma que exista ya una URL pública desplegada.

Para mostrar pruebas automáticas y reproducir una caída/recuperación sin Grafana ni Prometheus, sigue [el guion de evaluación](PRUEBA.md).
