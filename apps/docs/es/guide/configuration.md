---
description: "Todas las variables de entorno de SnapOtter con sus valores predeterminados. Configura autenticación, almacenamiento, modelos de IA, analítica y más."
i18n_source_hash: 8e9e9ca2840c
i18n_provenance: human
i18n_output_hash: e405b8a429bd
---

# Configuración {#configuration}

Toda la configuración se realiza mediante variables de entorno. Cada variable tiene un valor predeterminado sensato, por lo que SnapOtter funciona de inmediato sin necesidad de establecer ninguna de ellas.

## Variables de entorno {#environment-variables}

### Servidor {#server}

| Variable | Predeterminado | Descripción |
|---|---|---|
| `PORT` | `1349` | Puerto en el que escucha el servidor. |
| `RATE_LIMIT_PER_MIN` | `1000` | Máximo de solicitudes por minuto por IP. Ponlo a 0 para desactivar la limitación de tasa. |
| `CORS_ORIGIN` | (vacío) | Orígenes permitidos para CORS separados por comas, o vacío para solo el mismo origen. |
| `LOG_LEVEL` | `info` | Verbosidad del registro. Uno de: `fatal`, `error`, `warn`, `info`, `debug`, `trace`. |
| `TRUST_PROXY` | `true` | Confía en las cabeceras `X-Forwarded-For` de un proxy inverso. Ponlo a `false` si no está detrás de un proxy. |

### Autenticación {#authentication}

| Variable | Predeterminado | Descripción |
|---|---|---|
| `AUTH_ENABLED` | `false` | Ponlo a `true` para requerir inicio de sesión. La imagen de Docker usa `true` por defecto. |
| `DEFAULT_USERNAME` | `admin` | Nombre de usuario de la cuenta de administrador inicial. Solo se usa en la primera ejecución. |
| `DEFAULT_PASSWORD` | `admin` | Contraseña de la cuenta de administrador inicial. Cámbiala tras el primer inicio de sesión. |
| `MAX_USERS` | `0` (ilimitado) | Número máximo de cuentas de usuario registradas. Ponlo a 0 para ilimitado. |
| `SESSION_DURATION_HOURS` | `168` | Duración de la sesión de inicio de sesión en horas (el valor predeterminado es 7 días). |
| `SKIP_MUST_CHANGE_PASSWORD` | - | Ponlo a cualquier valor no vacío para omitir el aviso obligatorio de cambio de contraseña en el primer inicio de sesión |

### Almacenamiento {#storage}

| Variable | Predeterminado | Descripción |
|---|---|---|
| `STORAGE_MODE` | `local` | `local` o `s3`. S3/MinIO requiere una licencia con la función s3_storage. |
| `DATABASE_URL` | `postgres://snapotter:snapotter@postgres:5432/snapotter` | Cadena de conexión de PostgreSQL. |
| `REDIS_URL` | `redis://redis:6379` | Cadena de conexión de Redis (usada para las colas de tareas de BullMQ). |
| `WORKSPACE_PATH` | `./tmp/workspace` | Directorio para archivos temporales durante el procesamiento. Se limpia automáticamente. |
| `FILES_STORAGE_PATH` | `./data/files` | Directorio para archivos de usuario persistentes (imágenes subidas, resultados guardados). |

### Modo embebido {#embedded-mode}

Ejecuta la imagen sin `DATABASE_URL` ni `REDIS_URL` y arrancará sus propios PostgreSQL 17 y Redis dentro del contenedor, enlazados a loopback, con todos los datos en el volumen `/data`. Esto restaura la experiencia de un solo comando `docker run` para el inicio rápido, el homelab y las actualizaciones desde la 1.x. Es una vía de conveniencia, no un despliegue de producción: para producción, ejecuta la pila de Compose de 3 contenedores con PostgreSQL y Redis separados. El modo embebido requiere ejecutar el contenedor como root y es incompatible con los tiempos de ejecución de UID arbitrario (OpenShift, Kubernetes `runAsNonRoot`); usa Compose en esos casos.

| Variable | Predeterminado | Descripción |
|---|---|---|
| `EMBEDDED` | `auto` | Se activa automáticamente cuando tanto `DATABASE_URL` como `REDIS_URL` están sin establecer. Ponlo a `0` para desactivarlo (la app entonces falla rápido si no hay `DATABASE_URL`/`REDIS_URL` externo establecido, en lugar de arrancar silenciosamente una base de datos dentro del contenedor). |
| `REDIS_MAXMEMORY` | `512mb` | Límite de memoria para el Redis embebido (solo en modo embebido). Redúcelo en hosts con memoria limitada, como una Raspberry Pi. |

Actualizar desde la 1.x: coloca tu antiguo `snapotter.db` en `/data/snapotter.db` dentro del volumen y el modo embebido lo importa al PostgreSQL embebido en el primer arranque. La importación se ejecuta una vez; los arranques posteriores la omiten.

Nota sobre telemetría: el modo embebido hereda el valor predeterminado de analítica de la imagen como cualquier otra configuración. La imagen publicada se distribuye con la analítica activada; compila con `--build-arg SNAPOTTER_ANALYTICS=off`, o usa la exclusión voluntaria de administrador dentro de la app, para desactivarla.

### Límites de procesamiento {#processing-limits}

| Variable | Predeterminado | Descripción |
|---|---|---|
| `MAX_UPLOAD_SIZE_MB` | `100` | Tamaño máximo de archivo por subida en megabytes. Ponlo a 0 para ilimitado. |
| `MAX_BATCH_SIZE` | `100` | Número máximo de archivos en una sola solicitud por lotes. Ponlo a 0 para ilimitado. |
| `CONCURRENT_JOBS` | `0` (automático) | Número de tareas por lotes que se ejecutan en paralelo. Ponlo a 0 para detectarlo automáticamente según los núcleos de CPU disponibles. |
| `MAX_MEGAPIXELS` | `0` (ilimitado) | Resolución máxima de imagen permitida en megapíxeles. Ponlo a 0 para ilimitado. |
| `MAX_WORKER_THREADS` | `0` (automático) | Máximo de hilos de trabajo para el procesamiento de imágenes. Ponlo a 0 para detectarlo automáticamente según los núcleos de CPU disponibles. |
| `PROCESSING_TIMEOUT_S` | `0` (sin límite) | Tiempo máximo de procesamiento por solicitud en segundos. Ponlo a 0 para que no haya tiempo de espera. |
| `MAX_PIPELINE_STEPS` | `20` | Número máximo de pasos en una canalización. Ponlo a 0 para que no haya límite. |
| `MAX_CANVAS_PIXELS` | `0` (sin límite) | Tamaño máximo del lienzo en píxeles para las imágenes de salida. Ponlo a 0 para que no haya límite. |
| `MAX_SVG_SIZE_MB` | `0` (ilimitado) | Tamaño máximo de archivo SVG en megabytes. Ponlo a 0 para ilimitado. |
| `MAX_SPLIT_GRID` | `100` | Dimensión máxima de la cuadrícula para la herramienta de división de imágenes. |
| `MAX_PDF_PAGES` | `0` (ilimitado) | Número máximo de páginas de PDF para la conversión de PDF a imagen. Ponlo a 0 para ilimitado. |

### Limpieza {#cleanup}

| Variable | Predeterminado | Descripción |
|---|---|---|
| `FILE_MAX_AGE_HOURS` | `72` | Cuánto tiempo se conservan los resultados de procesamiento no guardados (subidas en bruto y salidas de herramientas) antes de su eliminación automática. Los archivos que guardas explícitamente en la biblioteca de Archivos no se ven afectados y persisten hasta que los eliminas. |
| `CLEANUP_INTERVAL_MINUTES` | `60` | Con qué frecuencia se ejecuta la tarea de limpieza. |

### Apariencia {#appearance}

| Variable | Predeterminado | Descripción |
|---|---|---|
| `DEFAULT_THEME` | `light` | Tema predeterminado para las sesiones nuevas. `light` o `dark`. |
| `DEFAULT_LOCALE` | `en` | Idioma predeterminado de la interfaz. |
| `DEFAULT_TOOL_VIEW` | `sidebar` | Diseño de herramienta predeterminado. `sidebar` o `fullscreen`. |

### Permisos de Docker {#docker-permissions}

| Variable | Predeterminado | Descripción |
|---|---|---|
| `PUID` | `999` | Ejecuta el proceso del contenedor con este UID. Ponlo para que coincida con tu usuario del host en los montajes de enlace (`id -u`). |
| `PGID` | `999` | Ejecuta el proceso del contenedor con este GID. Ponlo para que coincida con tu grupo del host en los montajes de enlace (`id -g`). |

## Ejemplo de Docker {#docker-example}

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    ports:
      - "1349:1349"
    volumes:
      - SnapOtter-data:/data
      - SnapOtter-workspace:/tmp/workspace
    environment:
      - AUTH_ENABLED=true
      - DEFAULT_USERNAME=admin
      - DEFAULT_PASSWORD=changeme
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
      - REDIS_URL=redis://redis:6379
      - MAX_UPLOAD_SIZE_MB=200
      - CONCURRENT_JOBS=4
      - FILE_MAX_AGE_HOURS=12
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped

  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: snapotter
      POSTGRES_PASSWORD: snapotter
      POSTGRES_DB: snapotter
    volumes:
      - SnapOtter-pgdata:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U snapotter"]
      interval: 10s
      timeout: 5s
      retries: 12

  redis:
    image: redis:8-alpine
    command: ["redis-server", "--maxmemory-policy", "noeviction", "--appendonly", "yes"]
    volumes:
      - SnapOtter-redisdata:/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 12

volumes:
  SnapOtter-data:
  SnapOtter-workspace:
  SnapOtter-pgdata:
  SnapOtter-redisdata:
```

## Volúmenes {#volumes}

La pila de Docker Compose usa cuatro volúmenes:

- `/data` (app) - Modelos de IA, entorno virtual de Python y archivos de usuario. Móntalo para conservar los archivos subidos y los paquetes de IA instalados entre reinicios.
- `/tmp/workspace` (app) - Almacenamiento temporal para los archivos que se están procesando. Puede ser efímero, pero montarlo evita llenar la capa escribible del contenedor.
- `SnapOtter-pgdata` (postgres) - Directorio de datos de PostgreSQL. Contiene todos los datos relacionales (usuarios, ajustes, canalizaciones, tareas, registro de auditoría). Haz copia de seguridad mediante `pg_dump` o una instantánea del volumen.
- `SnapOtter-redisdata` (redis) - Archivo de solo anexado de Redis para colas de tareas duraderas.
