---
description: "Esquema de la base de datos PostgreSQL, tablas, migraciones y procedimientos de copia de seguridad de SnapOtter."
i18n_source_hash: b37398ae91a3
i18n_provenance: human
i18n_output_hash: 70b4aa5ae152
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

Biblioteca de archivos persistente con seguimiento de la cadena de versiones. Cada paso de procesamiento que guarda un resultado crea una nueva fila enlazada a su padre mediante `parentId`, formando un árbol de versiones.

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

**Opción 1: pg_dump (recomendada)**

```bash
# Dump the database while the stack is running
docker exec SnapOtter-postgres pg_dump -U snapotter snapotter > backup.sql

# Restore into a fresh database
cat backup.sql | docker exec -i SnapOtter-postgres psql -U snapotter snapotter
```

**Opción 2: Instantánea del volumen**

```bash
# Stop the stack, then snapshot the pgdata volume
docker compose down
docker run --rm -v SnapOtter-pgdata:/data -v $(pwd)/backup:/backup \
  alpine tar czf /backup/snapotter-pgdata.tar.gz -C /data .
```

### Migrar desde 1.x (SQLite) {#migrating-from-1-x-sqlite}

Actualizar desde SnapOtter 1.x tiene su propia guía: consulta [Actualizar de 1.x a 2.0](./upgrading). En resumen, reutiliza tu volumen `/data` existente y 2.0 detecta e importa automáticamente `/data/snapotter.db` en el primer arranque (o define `SQLITE_MIGRATE_PATH` para apuntar a él explícitamente). Haz primero una copia de seguridad de todo el volumen `/data`, no solo de `snapotter.db`: 1.x usa el modo WAL de SQLite, por lo que un contenedor detenido suele dejar la mayor parte de sus datos en `snapotter.db-wal` junto a un `snapotter.db` casi vacío.
