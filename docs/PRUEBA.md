# Cómo demostrar la aplicación y sus pruebas

No necesitas Prometheus, Grafana ni un video. La consigna pide una aplicación publicada, acceso al código y documentos. Puedes mostrar la URL pública y dejar instrucciones reproducibles para que el evaluador ejecute las pruebas; si te entrevista en vivo, usa este guion.

## 1. Pruebas automatizadas con informe

En tu computadora, inicia Docker Desktop. Desde la raíz del proyecto:

```powershell
npm ci
npm run setup
docker compose up -d postgres
npm run test:evidence
```

Espera a que PostgreSQL esté saludable antes del último comando; puedes comprobarlo con `docker compose ps postgres`. No necesitas levantar el frontend ni instalarlo para ejecutar estas pruebas.

La terminal muestra el nombre y resultado de cada caso. Se generan:

- `artifacts/PRUEBAS.md`: informe legible con fecha, commit base y resultados.
- `artifacts/unit-tests.json`: resultados estructurados de reglas y componentes.
- `artifacts/integration-tests.json`: resultados estructurados con PostgreSQL y HTTP reales.

El comando termina con un código de error si falla una suite y el informe indica el fallo. No convierte una base caída en una prueba aprobada. La suite de integración crea una base `minefleet_test_<aleatorio>` y la elimina al terminar; no borra la base demo. Los informes están excluidos de Git por defecto: puedes mostrarlos en tu editor o adjuntarlos a la evaluación. Ejecutar el comando frente al evaluador permite reproducir el resultado.

Para ejecutar solo una parte:

```powershell
npm test
npm run test:integration
```

`npm test` omite la integración cuando no existe TEST_DATABASE_URL. Para demostrar el conjunto completo usa `test:evidence` o el segundo comando; no presentes las pruebas omitidas como aprobadas.

Casos que conviene explicar:

| Caso                                          | Qué demuestra                                                                  |
| --------------------------------------------- | ------------------------------------------------------------------------------ |
| Misma clave en dos cierres simultáneos        | Ambas peticiones reciben el mismo resultado; el horómetro aumenta una sola vez |
| Dos asignaciones simultáneas del mismo equipo | Solo una se guarda                                                             |
| Fallo de auditoría durante el cierre          | Turno, horómetros e idempotencia se revierten juntos                           |
| Varias reglas incumplidas                     | Se muestran todas las causas sin guardar un turno incompleto                   |
| Certificado que vence durante la noche        | La vigencia debe cubrir el turno completo                                      |
| Receptor HTTP que falla y se recupera         | El evento permanece en la cola y se entrega al recuperarse                     |
| Dos workers y leases vencidos                 | Reclamo seguro y recuperación de trabajo interrumpido                          |
| Credenciales demo                             | Solo se muestran cuando está habilitado y coinciden con las almacenadas        |

## 2. Demostración visual: un servicio se cae y vuelve

Haz esta parte en **Docker local**, usando el mismo código de la aplicación. No necesitas modificar el servidor ni introducir un botón de fallo en la URL pública.

```powershell
docker compose up -d --build
```

Abre http://localhost:4000 y usa una de las cuentas que aparecen en el login. Para crear operaciones, selecciona Supervisor.

1. Abre **Trazabilidad y servicios → Cola de eventos** y anota el número de entregados. Pulsa **Actualizar datos** si hay eventos recién creados.
2. Detén únicamente el receptor de eventos:

```powershell
docker compose stop notifications
```

3. En la aplicación pulsa **Programar turno**, elige una fecha/jornada que aún no exista y agrega un equipo disponible con un operador certificado. Guarda el turno.
4. El turno debe aparecer guardado aunque el receptor esté detenido. Vuelve a **Cola de eventos**, espera al menos un ciclo del worker (cinco segundos) y actualiza. Verás eventos **Pendientes**, intentos y el último error de entrega. Conserva el identificador de uno de esos eventos.
5. Inicia de nuevo el receptor:

```powershell
docker compose start notifications
```

6. Espera el próximo reintento y actualiza. Los mismos identificadores pasan a **Entregado** sin volver a crear el turno. El retraso aumenta con cada fallo (5, 10, 20… segundos), así que la recuperación no siempre es inmediata. Si acumularon diez fallos, aparecen agotados y el supervisor debe pulsar **Reintentar**.

También puedes mostrar la evidencia persistida en PostgreSQL, sin exponer contraseñas:

```powershell
docker compose exec -T postgres psql -U mine_user -d mine_fleet -c "SELECT id, topic, status, attempts, last_error FROM outbox_events ORDER BY created_at DESC LIMIT 5;"
docker compose exec -T postgres psql -U mine_user -d mine_fleet -c "SELECT e.id, e.status, count(i.id) AS recepciones FROM outbox_events e LEFT JOIN notification_inbox i ON i.id=e.id GROUP BY e.id ORDER BY e.created_at DESC LIMIT 5;"
```

La segunda consulta debe mostrar una recepción por evento entregado, aunque haya tenido varios intentos. La clave primaria del receptor impide duplicar el registro. Puedes guardar capturas del turno creado, la cola pendiente y los mismos eventos entregados como evidencia adicional.

Una explicación breve para el evaluador:

> El cambio de negocio y su evento se guardan en una misma transacción. El receptor externo está caído, pero el evento permanece en PostgreSQL. El worker vuelve a intentarlo y confirma la entrega cuando el receptor responde. La red puede repetir una entrega, por eso el consumidor también deduplica el identificador.

## 3. Qué demuestra Vercel y qué demuestra Docker

La URL pública muestra login, turnos, validaciones, cierres, mantenimiento, proyección, auditoría e idempotencia usando Neon. El login puede mostrar las credenciales de evaluación con `SHOW_DEMO_CREDENTIALS=true`.

La demostración de caída/recuperación anterior usa el receptor y worker locales de Compose. En Vercel Hobby el cron es diario: no prometas recuperación cada cinco segundos allí. Sin un receptor HTTPS externo configurado, los eventos públicos permanecen pendientes; el receptor Docker de tu computadora no es accesible desde Vercel usando `localhost` o `notifications`.

Si el evaluador pide repetir la caída, puede ejecutar los comandos locales anteriores o las pruebas automatizadas. Es evidencia del comportamiento del código, no una afirmación de que se apagó un servicio de Vercel. Los pasos de publicación están en [VERCEL.md](VERCEL.md) y los de PostgreSQL en [NEON.md](NEON.md).

Si deseas demostrar además una caída de PostgreSQL, hazlo solo en la demo local: al detener `postgres`, la API debe fallar sin confirmar nuevas operaciones. Tras iniciarlo, vuelve a enviar la misma solicitud; la idempotencia evita duplicarla. Esa situación es distinta de una integración externa caída: no se pueden encolar órdenes nuevas en una base que está desconectada.
