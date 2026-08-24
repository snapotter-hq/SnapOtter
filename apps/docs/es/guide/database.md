---
description: "Esquema de la base de datos PostgreSQL, tablas, migraciones y procedimientos de copia de seguridad de SnapOtter."
i18n_source_hash: a68264552836
i18n_provenance: machine
i18n_output_hash: 98e6d1aeab16
i18n_hash_version: 2
---

# Base de datos {#database}

SnapOtter usa PostgreSQL 17 con [Drizzle ORM](https://orm.drizzle.team/) (pg-core / node-postgres) para la persistencia de datos. El esquema se define en `apps/api/src/db/schema.ts`.

La conexión se configura mediante la variable de entorno `DATABASE_URL` (por defecto `postgres://snapotter:snapotter@postgres:5432/snapotter`). En Docker Compose, el contenedor de Postgres almacena sus datos en el volumen con nombre `SnapOtter-pgdata`. Las solicitudes se atienden con un rol que solo puede leer y escribir filas, algo que se detalla más abajo en [Roles de privilegio mínimo](#least-privilege-roles).

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

## Roles de privilegio mínimo {#least-privilege-roles}

Dos roles, dos tareas. `DATABASE_URL` atiende las solicitudes y tiene `SELECT`, `INSERT`, `UPDATE`, `DELETE` sobre las tablas de la aplicación, además de `USAGE` y `SELECT` sobre sus secuencias. Esa es toda la lista. No puede crear ni eliminar una tabla, instalar una extensión, hacer `TRUNCATE`, leer `pg_authid`, crear una base de datos, modificar un rol ni tocar el esquema `drizzle`, donde reside el historial de migraciones.

`DATABASE_MIGRATION_URL` es el privilegiado. Ejecuta las migraciones y otorga los permisos al rol de ejecución durante el arranque, y luego se cierra antes de que se atienda una sola solicitud.

Compose y la imagen todo en uno ya vienen configurados así, incluidas las instalaciones existentes. Al arrancar, SnapOtter crea el rol de ejecución si falta, le otorga los permisos, migra y después extiende esos permisos a las tablas que ya estaban. Actualizar no requiere ningún SQL manual.

Si dejas `DATABASE_MIGRATION_URL` vacío, se ejecuta con un solo rol y `DATABASE_URL` hace ambas tareas igual que antes de la separación. Es una configuración admitida, no una obsoleta. Es la respuesta correcta en Postgres gestionado, donde a menudo crear roles no está en tus manos.

### Postgres externo y gestionado {#external-and-managed-postgres}

En RDS, Supabase, Cloud SQL o cualquier clúster que administres tú mismo, la separación es opcional. Crea el rol de ejecución una sola vez:

```sql
CREATE ROLE snapotter_app LOGIN PASSWORD 'choose-a-strong-password'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
```

Después pasa a SnapOtter ambas cadenas de conexión, apuntando al mismo host, puerto y base de datos:

```bash
DATABASE_URL=postgres://snapotter_app:choose-a-strong-password@db.example.com:5432/snapotter
DATABASE_MIGRATION_URL=postgres://snapotter:the-owner-password@db.example.com:5432/snapotter
```

Ahí termina el trabajo. SnapOtter aplica los permisos por su cuenta y los vuelve a aplicar después de cada migración, así que una tabla que añada una versión futura queda cubierta sin que nadie ejecute SQL para ello.

El rol de `DATABASE_MIGRATION_URL` tiene que ser el propietario de las tablas de SnapOtter, porque solo el propietario de una tabla puede otorgar permisos sobre ella. En una instalación existente eso significa el rol con el que has venido ejecutando SnapOtter, no uno nuevo creado para la ocasión. Si lo apuntas a un rol nuevo que no posee nada, el arranque falla con un error que dice exactamente esto. También necesita `CREATEROLE` para crear y mantener el rol de ejecución, y el derecho a crear el esquema `drizzle`.

Si nombras el mismo rol en ambas URL, la separación queda desactivada, y SnapOtter lo dice en el registro en lugar de fingir lo contrario. Si tu proveedor no te da ningún rol que pueda a la vez ser propietario de las tablas y tener `CREATEROLE`, ejecuta con un solo rol.

### Por qué no se toca el bit de superusuario {#why-the-superuser-bit-is-left-alone}

SnapOtter nunca quita `SUPERUSER` de un rol por su cuenta. En una instalación creada antes de la separación, `snapotter` es el único superusuario del clúster, y degradarlo dejaría al clúster sin ninguno, algo recuperable solo mediante el modo monousuario con el servidor detenido. Lo que aporta la protección es mover la conexión de larga duración al rol restringido. El superusuario está en la línea durante los pocos segundos del arranque y luego desaparece.

Las instalaciones todo en uno nuevas nunca tienen ese problema. Reciben tres roles: `postgres` (superusuario de arranque, ausente de todas las cadenas de conexión que usa SnapOtter), `snapotter` (`NOSUPERUSER`, es propietario de los datos, se conecta solo al arrancar) y `snapotter_app` (solo filas, atiende las solicitudes).

Para degradar de todos modos un `snapotter` antiguo, crea primero un segundo superusuario e inicia sesión con él para confirmar que funciona. Después, `ALTER ROLE snapotter NOSUPERUSER`.

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

Ambos comandos se conectan como `snapotter`, el propietario, y deberían seguir haciéndolo. El rol de ejecución no puede ver el esquema `drizzle`, así que un volcado tomado con ese rol saldría incompleto. `--no-owner` deja los objetos restaurados en manos de quien ejecute la restauración, de modo que hacerlo como propietario deja la propiedad donde los permisos la esperan. Un detalle en un clúster nuevo: `pg_dump` lleva los permisos pero no los roles a los que nombran, así que crea `snapotter_app` antes de restaurar o `--exit-on-error` se detendrá en el primer `GRANT`. SnapOtter vuelve a aplicar los permisos en su siguiente arranque de todos modos.

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
