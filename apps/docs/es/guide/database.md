---
description: "Esquema de la base de datos PostgreSQL, tablas, migraciones y procedimientos de copia de seguridad de SnapOtter."
i18n_source_hash: a68264552836
i18n_provenance: machine
i18n_output_hash: 98e6d1aeab16
i18n_hash_version: 2
---

# Base de datos {#database}

SnapOtter usa PostgreSQL 17 con [Drizzle ORM](https://orm.drizzle.team/) (pg-core / node-postgres) para la persistencia de datos. El esquema se define en `apps/api/src/db/schema.ts`.

La conexión se configura mediante la variable de entorno `DATABASE_URL` (por defecto `postgres://snapotter:snapotter@postgres:5432/snapotter`). En Docker Compose, el contenedor de Postgres almacena sus datos en el volumen con nombre `SnapOtter-pgdata`.

## Tablas {#tables}

### users {#users}

Almacena las cuentas de usuario. Se crea automáticamente en el primer arranque a partir de `DEFAULT_USERNAME` y `DEFAULT_PASSWORD`.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid | Clave primaria |
| `username` | varchar | Único, obligatorio |
| `passwordHash` | varchar | hash scrypt |
| `role` | varchar | `admin`, `editor` o `user` |
| `mustChangePassword` | boolean | Indicador de restablecimiento de contraseña forzado |
| `createdAt` | timestamp | Momento de creación |
| `updatedAt` | timestamp | Momento de última actualización |

### sessions {#sessions}

Sesiones de inicio de sesión activas. Cada fila vincula un token de sesión a un usuario.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | varchar | Clave primaria (token de sesión) |
| `userId` | uuid | Clave foránea a `users.id` |
| `expiresAt` | timestamp | Momento de expiración |
| `createdAt` | timestamp | Momento de creación |

### teams {#teams}

Grupos para organizar usuarios. Los administradores pueden asignar usuarios a equipos.

| Columna | Tipo | Descripción |
|--------|------|-------------|
| `id` | uuid | Clave primaria |
| `name` | varchar (único, máx. 50 caracteres) | Nombre del equipo |
| `createdAt` | timestamp | Momento de creación |

### api_keys {#api-keys}

Claves de API para acceso programático. La clave sin procesar se muestra una sola vez al crearla; solo se almacena el hash.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid | Clave primaria |
| `userId` | uuid | Clave foránea a `users.id` |
| `keyHash` | varchar | hash scrypt de la clave |
| `name` | varchar | Etiqueta proporcionada por el usuario |
| `createdAt` | timestamp | Momento de creación |
| `lastUsedAt` | timestamp | Actualizado en cada solicitud autenticada |

Las claves llevan el prefijo `si_` seguido de 96 caracteres hexadecimales (48 bytes aleatorios).

### pipelines {#pipelines}

Cadenas de herramientas guardadas que los usuarios crean en la interfaz.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid | Clave primaria |
| `name` | varchar | Nombre del pipeline |
| `description` | varchar | Descripción opcional |
| `steps` | jsonb | Array de objetos `{ toolId, settings }` |
| `createdAt` | timestamp | Momento de creación |

### user_files {#user-files}

Biblioteca de archivos persistente. Una edición guardada se inserta de forma predeterminada como una fila raíz independiente ("guardar como nuevo": `version` 1, `parentId` null, de modo que el original sigue listado), o como una versión enlazada a su padre cuando sobrescribes el original (`parentId` establecido, `version` incrementado, reemplazándolo). La columna `toolChain` registra las herramientas aplicadas.

| Columna | Tipo | Descripción |
|--------|------|-------------|
| `id` | uuid | Clave primaria |
| `userId` | uuid | FK a users (CASCADE DELETE) |
| `originalName` | varchar | Nombre de archivo original de la subida |
| `storedName` | varchar | Nombre de archivo en disco |
| `mimeType` | varchar | Tipo MIME |
| `size` | integer | Tamaño del archivo en bytes |
| `width` | integer | Ancho de la imagen en px |
| `height` | integer | Alto de la imagen en px |
| `version` | integer | Número de versión (1 = original) |
| `parentId` | uuid o null | FK a user_files (versión padre) |
| `toolChain` | jsonb | IDs de las herramientas aplicadas en orden para producir esta versión |
| `createdAt` | timestamp | Momento de creación |

### jobs {#jobs}

Realiza el seguimiento de los trabajos de procesamiento para el reporte de progreso y la limpieza.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid | Clave primaria |
| `type` | varchar | Identificador de la herramienta o el pipeline |
| `status` | varchar | `queued`, `processing`, `completed` o `failed` |
| `progress` | real | Fracción de 0.0 a 1.0 |
| `inputFiles` | jsonb | Array de rutas de archivos de entrada |
| `outputPath` | varchar | Ruta al archivo de resultado |
| `settings` | jsonb | Ajustes de la herramienta utilizados |
| `error` | varchar | Mensaje de error si falló |
| `createdAt` | timestamp | Momento de creación |
| `completedAt` | timestamp | Momento de finalización |

### settings {#settings}

Almacén clave-valor para ajustes de todo el servidor que los administradores pueden cambiar desde la interfaz.

| Columna | Tipo | Notas |
|---|---|---|
| `key` | varchar | Clave primaria |
| `value` | varchar | Valor del ajuste |
| `updatedAt` | timestamp | Momento de última actualización |

### roles {#roles}

Roles personalizados con permisos granulares.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid | Clave primaria |
| `name` | varchar | Nombre de rol único |
| `description` | varchar | Descripción opcional |
| `permissions` | jsonb | Array de cadenas de permisos |
| `createdAt` | timestamp | Momento de creación |

### audit_log {#audit-log}

Registro de acciones relevantes para la seguridad.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid | Clave primaria |
| `userId` | uuid | FK a users |
| `action` | varchar | Tipo de acción |
| `details` | jsonb | Datos específicos de la acción |
| `createdAt` | timestamp | Momento de la acción |

### user_preferences {#user-preferences}

Estado de la interfaz por usuario, indexado por nombre de preferencia. Almacena las herramientas fijadas de la página de inicio, que se escriben a través de `PUT /api/v1/preferences`.

| Columna | Tipo | Notas |
|---|---|---|
| `userId` | text | FK a users, con borrado en cascada. Clave primaria junto con `key` |
| `key` | text | Nombre de la preferencia. Clave primaria junto con `userId` |
| `value` | jsonb | Contenido de la preferencia |
| `updatedAt` | timestamp | Última escritura |

## Migraciones {#migrations}

Drizzle gestiona las migraciones del esquema. Los archivos de migración están en `apps/api/drizzle/`. Durante el desarrollo:

```bash
cd apps/api
npx drizzle-kit generate   # generate a migration from schema changes
npx drizzle-kit migrate    # apply pending migrations
```

En producción, las migraciones pendientes se aplican automáticamente al arrancar.

## Copia de seguridad y restauración {#backup-and-restore}

La base de datos relacional reside en el volumen `SnapOtter-pgdata` del contenedor de Postgres, no en el volumen `/data` de la aplicación.

**Copia de seguridad lógica con validación (recomendado)**

```bash
# Dump into PostgreSQL's portable custom archive format
docker exec SnapOtter-postgres \
  pg_dump --format=custom --no-owner -U snapotter snapotter > snapotter.dump
test -s snapotter.dump
docker exec -i SnapOtter-postgres pg_restore --list < snapotter.dump >/dev/null

# Restore into a fresh/disposable target first and fail on the first SQL error
docker exec -i SnapOtter-postgres \
  pg_restore --exit-on-error --clean --if-exists --no-owner \
  -U snapotter -d snapotter < snapotter.dump
```

Este volcado de base de datos no contiene objetos de biblioteca guardados en `/data/files` ni en estado BullMQ duradero en Redis. Realice una copia de seguridad y restaure aquellos con el procedimiento coordinado en [Seguridad y refuerzo](/es/guide/security#backup-and-recovery).

**Instantánea del volumen frío**

```bash
# Stop every service first, then use your storage platform to snapshot the
# PostgreSQL, app-data, and Redis volumes as one crash-consistent set.
docker compose -f docker/docker-compose.yml stop
```

No copie un directorio de datos de PostgreSQL activo con `tar`. Redacte los nombres de los volúmenes con prefijos por proyecto, de modo que resuelva los ID de los volúmenes montados desde `docker inspect` o su plataforma de almacenamiento en lugar de asumir la etiqueta literal `SnapOtter-pgdata`.

### Migrar desde 1.x (SQLite) {#migrating-from-1-x-sqlite}

Actualizar desde SnapOtter 1.x tiene su propia guía: consulta [Actualizar de 1.x a 2.0](./upgrading). En resumen, reutiliza tu volumen `/data` existente y 2.0 detecta e importa automáticamente `/data/snapotter.db` en el primer arranque (o define `SQLITE_MIGRATE_PATH` para apuntar a él explícitamente). Haz primero una copia de seguridad de todo el volumen `/data`, no solo de `snapotter.db`: 1.x usa el modo WAL de SQLite, por lo que un contenedor detenido suele dejar la mayor parte de sus datos en `snapotter.db-wal` junto a un `snapotter.db` casi vacío.
