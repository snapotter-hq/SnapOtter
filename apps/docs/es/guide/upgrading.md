---
i18n_source_hash: 959cca5c298c
i18n_provenance: machine
i18n_output_hash: ebe2be1e969d
i18n_hash_version: 2
---
# Actualización de 1.x a 2.0 {#upgrading-from-1-x-to-2-0}

SnapOtter 1.x almacenaba todo en un único archivo SQLite y se ejecutaba como un solo contenedor. SnapOtter 2.0 usa PostgreSQL y Redis. Esta guía explica cómo mover una instalación 1.x a 2.0 sin perder datos.

La versión corta: reutilice su volumen `/data` existente y 2.0 importará automáticamente su base de datos 1.x en el primer arranque. Sus usuarios, archivos guardados, ajustes, claves de API y pipelines se trasladan. La base de datos antigua nunca se modifica, por lo que siempre puede volver atrás.

::: tip Una nota para nuestros usuarios de 1.x
Muchos de ustedes han confiado en SnapOtter desde el primer día, y sus comentarios dieron forma a esta versión. 2.0 cambia mucho internamente, y esta guía existe para que el traslado no le cueste nada que le importe. Sus cuentas, archivos, ajustes, claves de API y pipelines se conservan, y su base de datos antigua no se toca. Gracias por actualizar con nosotros.
:::

## Antes de empezar: haga una copia de seguridad de todo el volumen `/data` {#before-you-start-back-up-the-whole-data-volume}

Haga esto primero, siempre. Haga una copia de seguridad del volumen `/data` **completo**, no solo del archivo `snapotter.db`.

Este es el motivo. 1.x ejecuta SQLite en modo WAL, por lo que un contenedor 1.x detenido suele dejar la mayor parte de sus datos confirmados en `snapotter.db-wal`, junto a un `snapotter.db` casi vacío. Copiar solo `snapotter.db` captura una base de datos vacía y pierde todo en silencio. El volumen contiene `snapotter.db`, `snapotter.db-wal`, `snapotter.db-shm` y su directorio `files/` juntos, y deben trasladarse como un conjunto.

```bash
# Adjust the volume name to match yours (see "Check your volume name" below).
docker run --rm -v SnapOtter-data:/data -v "$PWD":/backup \
  alpine tar czf /backup/snapotter-1x-data.tgz -C /data .
```

## Actualice primero a 1.17.2 {#upgrade-to-1-17-2-first}

Actualice su instalación 1.x a la última versión 1.x (1.17.2) antes de pasar a 2.0. Así 1.x ejecuta sus propias migraciones finales de esquema y 2.0 importa desde un esquema conocido y completo. No se admite actualizar desde una 1.x anterior directamente a 2.0.

## Compruebe el nombre de su volumen {#check-your-volume-name}

El importador solo ve sus datos si el stack de 2.0 monta el mismo volumen que usaba su instalación 1.x. Los nombres de volúmenes de Docker distinguen entre mayúsculas y minúsculas, y los fragmentos antiguos del README usaban `snapotter-data` en minúsculas, mientras que los archivos de Compose usan `SnapOtter-data`. Confirme cuál tiene:

```bash
docker volume ls | grep -i snapotter
```

Use ese nombre exacto en su configuración de 2.0.

## Ruta A: contenedor único (la más rápida) {#path-a-single-container-quickest}

Si ejecuta SnapOtter con un solo `docker run`, siga haciéndolo. 2.0 inicia un PostgreSQL y un Redis integrados dentro del contenedor cuando no define `DATABASE_URL` ni `REDIS_URL`, y detecta e importa `/data/snapotter.db` automáticamente en el primer arranque.

```bash
docker run -d --name snapotter -p 1349:1349 \
  -v SnapOtter-data:/data \
  snapotter/snapotter:latest
```

Vigile los registros en busca de una línea como:

```
Imported 1.x SQLite database: {"tables":{"users":2,"teams":1,...},"blobs":{"present":1,"missing":0}}
```

Eso es todo. Inicie sesión con sus credenciales existentes.

## Ruta B: Compose (recomendada para producción) {#path-b-compose-recommended-for-production}

El stack de Compose de 2.0 ejecuta tres servicios (aplicación, Postgres, Redis). Reutilice su volumen `/data` de 1.x para el servicio de la aplicación. La aplicación detecta `/data/snapotter.db` automáticamente y lo importa a Postgres en el primer arranque.

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    volumes:
      - SnapOtter-data:/data          # your existing 1.x volume
      - SnapOtter-workspace:/tmp/workspace
    environment:
      - DATABASE_URL=postgres://${POSTGRES_APP_USER:-snapotter_app}:${POSTGRES_APP_PASSWORD:-snapotter_app}@postgres:5432/${POSTGRES_DB:-snapotter}
      - DATABASE_MIGRATION_URL=postgres://${POSTGRES_USER:-snapotter}:${POSTGRES_PASSWORD:-snapotter}@postgres:5432/${POSTGRES_DB:-snapotter}
      - REDIS_URL=redis://:snapotter@redis:6379
    # ...
```

Si prefiere apuntar explícitamente a la base de datos antigua, defina `SQLITE_MIGRATE_PATH=/data/snapotter.db`. Una ruta explícita siempre prevalece sobre la detección automática.

## Previsualice primero la importación (opcional) {#preview-the-import-first-optional}

Para ver exactamente qué se importaría sin escribir nada, ejecute una simulación sobre su archivo de base de datos:

```bash
pnpm --filter @snapotter/api migrate:sqlite -- /path/to/snapotter.db --dry-run
```

Muestra el recuento de filas por tabla, cuántos archivos de la biblioteca guardada encontró en disco y qué estados de trabajo normalizará. No requiere un Postgres en ejecución.

## Qué se conserva y qué no {#what-carries-over-and-what-does-not}

Se conserva:

- Los usuarios y la posibilidad de iniciar sesión. Los hashes de contraseña no cambian, por lo que sirven el mismo nombre de usuario y la misma contraseña.
- Los equipos, los ajustes (incluida la identidad de su instancia), los roles, las claves de API (siguen funcionando) y los pipelines guardados.
- Los registros del historial de trabajos.
- Su biblioteca de archivos guardados, tanto los registros como los archivos reales, porque `/data/files` se conserva en el volumen.

No se conserva:

- Las sesiones de inicio de sesión. Todos deben iniciar sesión una vez tras la actualización. Las credenciales no cambian, así que es un único reinicio de sesión, nada más.
- Los archivos de entrada y salida de trabajos de procesamiento antiguos. Estaban en un espacio de trabajo temporal y han desaparecido por diseño. Los registros del historial de trabajos permanecen.
- Los indicadores de consentimiento de analítica por usuario de 1.x, que no tienen equivalente en 2.0 (la analítica de 2.0 es un ajuste a nivel de instancia).

## Desactivar la importación {#turning-the-import-off}

Si desea deliberadamente una base de datos nueva aunque haya un `snapotter.db` presente en el volumen, defina `SQLITE_MIGRATE_PATH=off`.

## Si ya tiene datos en la instancia 2.0 {#if-you-already-have-data-in-the-2-0-instance}

El importador solo se ejecuta sobre una base de datos vacía. Si inició 2.0 desde cero (creando datos) y después montó un `snapotter.db` antiguo, 2.0 lo detectará pero no lo importará, porque combinar dos conjuntos de datos puede provocar colisiones de ID. Verá una advertencia en los registros. Para importar los datos de 1.x necesita una instancia vacía:

- Si la instancia 2.0 solo contiene el administrador predeterminado (en realidad no la ha usado), detenga el stack, elimine el volumen de Postgres (`SnapOtter-pgdata`) y arranque de nuevo con el `/data` antiguo presente. Se importará sin problemas. Esto solo borra los datos desechables de Postgres, no su base de datos 1.x.
- Si la instancia 2.0 contiene datos reales que desea conservar, los dos conjuntos de datos no pueden fusionarse automáticamente. Exporte lo que necesite e importe los datos de 1.x en un despliegue nuevo y separado.

## Volver atrás {#rolling-back}

La actualización nunca modifica ni elimina su `snapotter.db` de 1.x. Si necesita volver a 1.x, vuelva a desplegar la imagen 1.x sobre el mismo volumen. Todo lo que haya creado en 2.0 tras la actualización reside en Postgres y no estaría en la base de datos 1.x, así que vuelva atrás cuanto antes si piensa hacerlo.