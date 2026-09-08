# Paso 1: PostgreSQL en Neon

Esta guía prepara la base de datos para MineFleet. La aplicación se publica después siguiendo [VERCEL.md](VERCEL.md). No necesitas instalar PostgreSQL en tu computadora para el despliegue público.

## Crear el proyecto

1. Entra a [Neon](https://console.neon.tech/) y crea una cuenta o inicia sesión.
2. Selecciona **New project** y el plan **Free** para la demostración.
3. Ponle un nombre, por ejemplo `minefleet-prueba`.
4. Selecciona PostgreSQL **16** para coincidir con la versión probada localmente.
5. Elige una región próxima a la de la aplicación en Vercel. Puedes utilizar AWS US East / Northern Virginia y seleccionar esa misma región para la función en Vercel.
6. Crea el proyecto. Puedes conservar la base y el usuario que Neon propone, normalmente `neondb` y `neondb_owner`.

Referencia: [gestión de proyectos en Neon](https://neon.com/docs/manage/projects). El plan gratuito tiene cuotas; revisa [los planes vigentes](https://neon.com/docs/introduction/plans) antes de seleccionar una opción de pago.

## Obtener la conexión

1. En el panel de tu proyecto, pulsa **Connect**.
2. Selecciona la rama principal que usarás para la evaluación, la base y su usuario propietario. El primer arranque de MineFleet necesita permisos para crear tablas.
3. Activa **Connection pooling**.
4. Copia únicamente la URL PostgreSQL, sin el comando `psql` ni las comillas que lo rodean. El servidor suele contener `-pooler`.
5. Conserva los parámetros TLS que incluye Neon. No desactives SSL ni uses `rejectUnauthorized=false`.

Ejemplo de formato, con datos ficticios:

```text
postgresql://USUARIO:CONTRASENA@ep-EJEMPLO-pooler.REGION.aws.neon.tech/neondb?sslmode=require
```

La contraseña ya está incluida en esta URL. No la publiques en GitHub ni en el README. Más información: [pooling de Neon](https://neon.com/docs/connect/connection-pooling) y [conexión manual con Vercel](https://neon.com/docs/guides/vercel-manual).

## Completar el archivo de configuración local

Desde la raíz del proyecto:

```powershell
npm run setup:vercel
```

Abre `.env.vercel.local` en tu editor y completa la línea vacía:

```dotenv
DATABASE_URL=PEGA_AQUI_LA_URL_COMPLETA_DE_NEON
```

Sustituye el texto de ejemplo por la URL real, todo en una sola línea. El archivo ya contiene las otras variables, contraseñas y secretos aleatorios. `setup:vercel` no sobrescribe un archivo existente.

Este archivo es distinto de `.env`, que sirve para Docker local. Está excluido de Git, del envío de Vercel CLI y del contexto Docker. Por eso **debes cargar sus variables en Vercel** como explica la siguiente guía: no se incorporan automáticamente a la imagen.

## Tablas y datos de demostración

No ejecutes el script de reinicio del seed contra Neon. Con `SEED_DEMO=true`, MineFleet crea las tablas al arrancar y carga los ejemplos únicamente si la flota está vacía. También crea las cuentas de acceso iniciales desde las variables de Vercel.

Después de desplegar la aplicación, puedes comprobar los datos en **SQL Editor** de Neon:

```sql
SELECT count(*) AS equipos FROM equipment;
SELECT count(*) AS operadores FROM operators;
SELECT count(*) AS turnos FROM shifts;
```

Una base nueva contiene inicialmente cinco equipos, cuatro operadores y cuatro turnos. La base seguirá conservando los datos cuando Vercel apague o reemplace un contenedor.

Para desplegar previews que modifiquen datos, crea una rama o base separada y configura otra `DATABASE_URL` para **Preview**. No uses la base de la evaluación como entorno de pruebas destructivas.

Continúa con [Paso 2: Vercel con Docker](VERCEL.md).
