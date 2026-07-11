---
i18n_source_hash: 9a6abf3fc8ae
i18n_provenance: human
i18n_output_hash: 8a8aff1aaa00
---
# Actualizar de la versión 1.x a la 2.0 {#upgrading-from-1-x-to-2-0}

SnapOtter 1.x almacenaba todo en un único archivo SQLite y se ejecutaba como un solo contenedor. SnapOtter 2.0 usa PostgreSQL y Redis. Esta guía explica cómo migrar una instalación 1.x a 2.0 sin perder datos.

La versión corta: reutiliza tu volumen `/data` existente y 2.0 importa tu base de datos 1.x automáticamente en el primer arranque. Tus usuarios, archivos guardados, configuración, claves de API y pipelines se conservan. La base de datos antigua nunca se modifica, así que siempre puedes revertir.

::: tip Una nota para nuestros usuarios de 1.x
Muchos de ustedes han confiado en SnapOtter desde el primer día, y sus comentarios dieron forma a esta versión. La 2.0 cambia mucho por dentro, y esta guía existe para que la migración no les cueste nada de lo que les importa. Sus cuentas, archivos, configuración, claves de API y pipelines se conservan, y su base de datos antigua nunca se toca. Gracias por actualizar con nosotros.
:::

## Antes de empezar: haz una copia de seguridad del volumen `/data` completo {#before-you-start-back-up-the-whole-data-volume}

Haz esto primero, siempre. Respalda el volumen `/data` **completo**, no solo el archivo `snapotter.db`.

Aquí va el porqué. 1.x ejecuta SQLite en modo WAL, así que un contenedor 1.x detenido suele dejar la mayor parte de sus datos confirmados en `snapotter.db-wal` junto a un `snapotter.db` casi vacío. Copiar solo `snapotter.db` captura una base de datos vacía y pierde todo en silencio. El volumen lleva `snapotter.db`, `snapotter.db-wal`, `snapotter.db-shm` y tu directorio `files/` juntos, y deben viajar como un conjunto.

```bash
# Adjust the volume name to match yours (see "Check your volume name" below).
docker run --rm -v SnapOtter-data:/data -v "$PWD":/backup \
  alpine tar czf /backup/snapotter-1x-data.tgz -C /data .
```

## Actualiza primero a la 1.17.2 {#upgrade-to-1-17-2-first}

Actualiza tu instalación 1.x a la última versión 1.x (1.17.2) antes de migrar a la 2.0. Eso permite que 1.x ejecute sus propias migraciones de esquema finales, para que 2.0 importe desde un esquema conocido y completo. No se admite actualizar de una versión 1.x más antigua directamente a la 2.0.

## Comprueba el nombre de tu volumen {#check-your-volume-name}

El importador solo ve tus datos si el stack 2.0 monta el mismo volumen que usaba tu instalación 1.x. Los nombres de volumen de Docker distinguen entre mayúsculas y minúsculas, y fragmentos antiguos del README usaban `snapotter-data` en minúsculas mientras que los archivos de Compose usan `SnapOtter-data`. Confirma cuál tienes:

```bash
docker volume ls | grep -i snapotter
```

Usa ese nombre exacto en tu configuración de 2.0.

## Ruta A: contenedor único (la más rápida) {#path-a-single-container-quickest}

Si ejecutas SnapOtter con un único `docker run`, sigue haciéndolo. La 2.0 arranca un PostgreSQL y un Redis embebidos dentro del contenedor cuando no defines `DATABASE_URL` ni `REDIS_URL`, y detecta e importa `/data/snapotter.db` automáticamente en el primer arranque.

```bash
docker run -d --name snapotter -p 1349:1349 \
  -v SnapOtter-data:/data \
  snapotter/snapotter:latest
```

Vigila en los logs una línea como:

```
Imported 1.x SQLite database: {"tables":{"users":2,"teams":1,...},"blobs":{"present":1,"missing":0}}
```

Eso es todo. Inicia sesión con tus credenciales existentes.

## Ruta B: Compose (recomendada para producción) {#path-b-compose-recommended-for-production}

El stack de Compose de 2.0 ejecuta tres servicios (app, Postgres, Redis). Reutiliza tu volumen `/data` de 1.x para el servicio de la app. La app detecta `/data/snapotter.db` automáticamente y lo importa a Postgres en el primer arranque.

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    volumes:
      - SnapOtter-data:/data          # your existing 1.x volume
      - SnapOtter-workspace:/tmp/workspace
    environment:
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
      - REDIS_URL=redis://:snapotter@redis:6379
    # ...
```

Si prefieres apuntar a la base de datos antigua de forma explícita, establece `SQLITE_MIGRATE_PATH=/data/snapotter.db`. Una ruta explícita siempre gana sobre la detección automática.

## Previsualiza la importación primero (opcional) {#preview-the-import-first-optional}

Para ver exactamente qué se importaría sin escribir nada, ejecuta una prueba en seco contra tu archivo de base de datos:

```bash
pnpm --filter @snapotter/api migrate:sqlite -- /path/to/snapotter.db --dry-run
```

Imprime el recuento de filas por tabla, cuántos archivos de la biblioteca guardada encontró en disco y cualquier estado de trabajo que vaya a normalizar. No necesita un Postgres en ejecución.

## Qué se conserva y qué no {#what-carries-over-and-what-does-not}

Se conserva:

- Los usuarios y la capacidad de iniciar sesión. Los hashes de contraseña no cambian, así que el mismo usuario y contraseña funcionan.
- Equipos, configuración (incluida la identidad de tu instancia), roles, claves de API (siguen funcionando) y pipelines guardados.
- Registros del historial de trabajos.
- Tu biblioteca de archivos guardados, tanto los registros como los archivos reales, porque `/data/files` se conserva en el volumen.

No se conserva:

- Las sesiones de inicio de sesión. Todo el mundo inicia sesión una vez tras la actualización. Las credenciales no cambian, así que es un único reinicio de sesión, nada más.
- Los archivos de entrada y salida de trabajos de procesamiento antiguos. Estos vivían en un espacio de trabajo temporal y desaparecen por diseño. Los registros del historial de trabajos permanecen.
- Los indicadores de consentimiento de analítica por usuario de 1.x, que no tienen equivalente en 2.0 (la analítica de 2.0 es una configuración a nivel de instancia).

## Desactivar la importación {#turning-the-import-off}

Si deliberadamente quieres una base de datos nueva aunque haya un `snapotter.db` presente en el volumen, establece `SQLITE_MIGRATE_PATH=off`.

## Si ya tienes datos en la instancia 2.0 {#if-you-already-have-data-in-the-2-0-instance}

El importador solo se ejecuta sobre una base de datos vacía. Si arrancaste 2.0 desde cero (creando datos) y luego montaste un `snapotter.db` antiguo, 2.0 lo detectará pero no lo importará, porque fusionar dos conjuntos de datos puede colisionar en los IDs. Verás una advertencia en los logs. Para importar los datos de 1.x necesitas una instancia vacía:

- Si la instancia 2.0 solo contiene el administrador predeterminado (no la has usado de verdad), detén el stack, elimina el volumen de Postgres (`SnapOtter-pgdata`) y arranca de nuevo con el `/data` antiguo presente. Se importará limpiamente. Esto borra solo los datos desechables de Postgres, no tu base de datos 1.x.
- Si la instancia 2.0 contiene datos reales que quieres conservar, los dos conjuntos de datos no pueden fusionarse automáticamente. Exporta lo que necesites e importa los datos de 1.x en un despliegue nuevo e independiente.

## Revertir {#rolling-back}

La actualización nunca modifica ni elimina tu `snapotter.db` de 1.x. Si necesitas volver a 1.x, vuelve a desplegar la imagen 1.x contra el mismo volumen. Todo lo que creaste en 2.0 tras la actualización vive en Postgres y no estaría en la base de datos 1.x, así que revierte pronto si vas a hacerlo.
