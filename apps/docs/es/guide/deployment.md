---
description: "Despliega SnapOtter en producción con Docker. Requisitos de hardware, configuración de GPU y configuraciones de proxy inverso para Nginx, Traefik y Cloudflare."
i18n_source_hash: ecc1b528bc4b
i18n_provenance: human
i18n_output_hash: 14eafc7e0596
---

# Despliegue {#deployment}

SnapOtter se despliega como una pila de Docker Compose de 3 contenedores: la imagen de la aplicación SnapOtter, PostgreSQL 17 y Redis 8. La imagen de la aplicación admite **linux/amd64** (con NVIDIA CUDA para aceleración de IA) y **linux/arm64** (CPU), por lo que se ejecuta de forma nativa en servidores Intel/AMD, Macs con Apple Silicon y dispositivos ARM como la Raspberry Pi 4/5. La aceleración de iGPU Intel/AMD mediante VA-API, Quick Sync u OpenCL no es compatible con la inferencia de IA por ahora.

Consulta [Imagen Docker](./docker-tags) para la configuración de GPU, ejemplos de Docker Compose y fijación de versiones.

## Inicio rápido (CPU) {#quick-start-cpu}

```yaml
# docker-compose.yml - Copy this file and run: docker compose up -d
services:
  SnapOtter:
    image: snapotter/snapotter:latest    # or ghcr.io/snapotter-hq/snapotter:latest
    container_name: SnapOtter
    ports:
      - "1349:1349"                # Web UI + API
    volumes:
      - SnapOtter-data:/data           # AI models, user files (PERSISTENT)
      - SnapOtter-workspace:/tmp/workspace  # Temp processing files (can be tmpfs)
    environment:
      # --- Authentication ---
      - AUTH_ENABLED=true          # Set to false to disable login entirely
      - DEFAULT_USERNAME=admin     # First-run admin username
      - DEFAULT_PASSWORD=admin     # First-run admin password (you'll be forced to change it)

      # --- Database + Queue ---
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
      - REDIS_URL=redis://redis:6379

      # --- Limits (set 0 for unlimited) ---
      # - MAX_UPLOAD_SIZE_MB=100   # Per-file upload limit in MB
      # - MAX_BATCH_SIZE=100       # Max files per batch request
      # - RATE_LIMIT_PER_MIN=1000  # API rate limit per IP, default shown (0 = disabled)
      # - MAX_USERS=0              # Max user accounts

      # --- Networking ---
      # - TRUST_PROXY=true         # Trust X-Forwarded-For headers (set false if not behind a proxy)

      # --- Bind mount permissions ---
      # - PUID=1000                # Match your host user's UID (run: id -u)
      # - PGID=1000                # Match your host user's GID (run: id -g)
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:1349/api/v1/health"]
      interval: 30s
      timeout: 5s
      start_period: 60s
      retries: 3
    shm_size: "2gb"            # Needed for Python ML shared memory
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

  postgres:
    image: postgres:17-alpine
    container_name: SnapOtter-postgres
    environment:
      POSTGRES_USER: snapotter
      POSTGRES_PASSWORD: snapotter     # Change this for non-local deployments
      POSTGRES_DB: snapotter
    volumes:
      - SnapOtter-pgdata:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U snapotter"]
      interval: 10s
      timeout: 5s
      retries: 12
      start_period: 15s

  redis:
    image: redis:8-alpine
    container_name: SnapOtter-redis
    command: ["redis-server", "--maxmemory-policy", "noeviction", "--appendonly", "yes"]
    volumes:
      - SnapOtter-redisdata:/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 12
      start_period: 10s

volumes:
  SnapOtter-data:       # Named volume - Docker manages permissions automatically
  SnapOtter-workspace:
  SnapOtter-pgdata:
  SnapOtter-redisdata:
```

```bash
docker compose up -d
```

La aplicación estará entonces disponible en `http://localhost:1349`.

> **¿Límites de tasa de Docker Hub?** Reemplaza `snapotter/snapotter:latest` por `ghcr.io/snapotter-hq/snapotter:latest` para descargar desde GitHub Container Registry en su lugar. Ambos registros reciben la misma imagen en cada versión.

## Inicio rápido (NVIDIA CUDA) {#quick-start-nvidia-cuda}

Para aceleración NVIDIA CUDA en las herramientas de IA (eliminación de fondo, escalado, mejora facial, OCR):

```yaml
# docker-compose-gpu.yml - Requires: NVIDIA GPU + nvidia-container-toolkit
# Install toolkit: https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    container_name: SnapOtter
    ports:
      - "1349:1349"
    volumes:
      - SnapOtter-data:/data
      - SnapOtter-workspace:/tmp/workspace
    environment:
      - AUTH_ENABLED=true
      - DEFAULT_USERNAME=admin
      - DEFAULT_PASSWORD=admin
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
      - REDIS_URL=redis://redis:6379
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:1349/api/v1/health"]
      interval: 30s
      timeout: 5s
      start_period: 60s
      retries: 3
    shm_size: "2gb"                # Required for PyTorch CUDA shared memory
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all           # Or set to 1 for a specific GPU
              capabilities: [gpu]
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

  postgres:
    image: postgres:17-alpine
    container_name: SnapOtter-postgres
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
      start_period: 15s

  redis:
    image: redis:8-alpine
    container_name: SnapOtter-redis
    command: ["redis-server", "--maxmemory-policy", "noeviction", "--appendonly", "yes"]
    volumes:
      - SnapOtter-redisdata:/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 12
      start_period: 10s

volumes:
  SnapOtter-data:
  SnapOtter-workspace:
  SnapOtter-pgdata:
  SnapOtter-redisdata:
```

```bash
docker compose -f docker-compose-gpu.yml up -d
```

Comprueba la detección de CUDA en los logs:

```bash
docker logs SnapOtter 2>&1 | head -20
# Look for: [gpu] CUDA available via torch
```

## Requisitos de hardware {#hardware-requirements}

Estas cifras provienen de pruebas de rendimiento en una variedad de sistemas, desde una estación de trabajo amd64 moderna con una NVIDIA RTX 4070 hasta una Raspberry Pi, ejecutando todo el catálogo de herramientas en cada una y ajustando los límites de recursos de Docker para encontrar el mínimo real.

### Referencia rápida {#quick-reference}

| Nivel | Caso de uso | CPU | RAM | GPU | Almacenamiento |
|------|----------|-----|-----|-----|---------|
| Mínimo | Herramientas de imagen, archivos y PDF ligeras; un solo usuario; lotes pequeños | 2 núcleos | 2 GB | Ninguna | ~7 GB |
| Recomendado | Las cinco modalidades incl. vídeo, PDF e IA en CPU; lotes; unos pocos usuarios | 4 núcleos | 4 GB | Ninguna | ~25 GB |
| Completo | Todo con rapidez incl. IA en GPU; lotes grandes; muchos usuarios | 6-8 núcleos | 8 GB | NVIDIA 8 GB+ de VRAM (12 GB cómodo) | ~35 GB |

**Arquitectura: solo 64 bits** (`linux/amd64` o `linux/arm64`). SnapOtter se ejecuta de forma nativa en servidores Intel/AMD, Macs con Apple Silicon y placas ARM de 64 bits, incluidas la **Raspberry Pi 4 y 5** (4-8 GB). **No** se ejecuta en ARM de 32 bits (`armv7`/`armhf`), no se construye ninguna imagen para ella, ni en placas de la clase de 512 MB como la Pi Zero, que están por debajo del mínimo de memoria (ver más abajo).

### Mínimo (herramientas de imagen, archivos y PDF ligeras; sin IA) {#minimum-image-files-and-light-pdf-tools-no-ai}

| Recurso | Requisito |
|---|---|
| CPU | 2 núcleos |
| RAM | 2 GB |
| Disco | ~5,5 GB (imagen) + volumen de datos |
| GPU | No requerida |

Las 222 herramientas del catálogo que no son de IA (imagen: redimensionar, recortar, convertir, comprimir, ajustar, marca de agua; vídeo: recortar, silenciar, remultiplexar; audio: convertir, normalizar, recortar; PDF: combinar, dividir, comprimir, rotar, proteger; conversiones de archivos, y ajustes preestablecidos de conversión dedicados) se ejecutan en hardware modesto. La mayoría de las operaciones terminan en bastante menos de un segundo incluso con un archivo grande: una imagen de 2,7 MB se redimensiona en ~0,05 s y se vuelve a codificar a WebP en ~2 s.

El mínimo de memoria es real, según un barrido de límites de recursos de Docker: **512 MB no pueden arrancar la pila** (incluso un solo redimensionado de imagen se cancela), **1 GB** gestiona operaciones de un solo archivo pero un lote de varios archivos se queda sin memoria, y **2 GB / 2 núcleos** es la configuración más pequeña que gestiona lotes con comodidad.

```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2G
```

**La única excepción con uso intensivo de CPU es la recodificación de vídeo.** Las operaciones de copia de flujo (recortar, silenciar, remultiplexado de contenedor) son instantáneas, pero la transcodificación a un códec diferente depende de la CPU. Un clip de 1080p / 45 segundos recodificado a VP9 (WebM) tarda aproximadamente **~40 s** en una CPU moderna rápida, ~45 s en Apple Silicon, ~80 s en una CPU móvil antigua de 4 núcleos y **~130 s** en un servidor antiguo de 4 núcleos. Si tu carga de trabajo tiene mucho vídeo, prioriza los núcleos de CPU y la frecuencia de reloj, o eleva el límite `cpus:` del contenedor; el compose incluido limita la aplicación a 4 núcleos por defecto (8 en el compose de GPU).

### Recomendado (herramientas de IA en CPU) {#recommended-ai-tools-on-cpu}

| Recurso | Requisito |
|---|---|
| CPU | 4 núcleos |
| RAM | 4 GB |
| Disco | 3 GB (imagen) + 24 GB (modelos de IA) + espacio de trabajo |
| GPU | No requerida (respaldo en CPU) |

**Instalar los paquetes de IA es lo que eleva la RAM a 4 GB.** Sin IA instalada, la aplicación consume en reposo alrededor de 360 MB; con los siete paquetes instalados mantiene ~2,6 GB residentes, porque el sidecar de IA de Python precarga sus modelos (eliminación de fondo, escalado, OCR, transcripción, detección facial, restauración) al arrancar. Las instalaciones sin IA se mantienen ligeras; las instalaciones con IA necesitan ≥4 GB.

La mayoría de las herramientas de IA son perfectamente utilizables en CPU; un par realmente quieren una GPU. Medido en una CPU moderna de 4 núcleos:

| Herramienta de IA | Tiempo en CPU | ¿Utilizable en CPU? |
|---|---|---|
| Detección facial (blur-faces, smart-crop, red-eye), noise-removal | menos de 1 s | Sí |
| OCR, transcripción, subtítulos | 1-3 s | Sí |
| Colorear, mejora facial | ~10 s | Sí |
| Eliminación / reemplazo / desenfoque de fondo | ~29 s | Sí (tendrás que esperar) |
| Escalado con IA (RealESRGAN) | ~33 s en imágenes pequeñas; minutos en imágenes grandes | Marginal — se recomienda encarecidamente una GPU |
| Restauración de fotos (pipeline completo) | varios minutos | No — necesita una GPU o una CPU rápida de muchos núcleos |

Tamaños de descarga de los modelos de IA:

| Paquete | Tamaño en disco |
|---|---|
| Eliminación de fondo | 4-5 GB |
| Escalado + Mejora facial + Eliminación de ruido | 5-6 GB |
| Detección facial | 200-300 MB |
| Borrador de objetos + Colorear | 1-2 GB |
| OCR | 5-6 GB |
| Restauración de fotos | 4-5 GB |
| **Todos los paquetes** | **~24 GB** |

```yaml
deploy:
  resources:
    limits:
      cpus: '4'
      memory: 4G
```

### Completo (herramientas de IA en NVIDIA CUDA) {#full-ai-tools-on-nvidia-cuda}

| Recurso | Requisito |
|---|---|
| CPU | 6-8 núcleos (la preparación de vídeo y la concurrencia se ejecutan en CPU incluso con IA en GPU) |
| RAM | 8 GB |
| GPU | NVIDIA con 8+ GB de VRAM (12 GB recomendado) |
| Disco | ~35 GB en total |

Una GPU NVIDIA (CUDA) acelera drásticamente los modelos de IA pesados. Medido en una RTX 4070 frente a una CPU moderna:

| Herramienta de IA | Aceleración con GPU | Notas |
|---|---|---|
| Escalado con IA (RealESRGAN 2×) | **~47×** | La mayor mejora — menos de un segundo frente a ~33 s (minutos en imágenes grandes) |
| Mejora facial (CodeFormer) | **~12×** | ~0,9 s frente a ~11 s |
| Transcripción (Whisper) | ~4,5× | |
| Eliminación / reemplazo / desenfoque de fondo | ~4× | ~7 s en GPU frente a ~29 s en CPU |
| Colorear | ~1,8× | |
| OCR, detección facial, red-eye, noise-removal | ~1× | Ya son rápidas en CPU — una GPU no ayuda |
| Restauración de fotos | ninguna | Depende de la CPU incluso con una GPU (0% de uso de GPU); aquí importa más una CPU rápida que una GPU |

Las herramientas que valen una GPU son **escalado, mejora facial, transcripción y eliminación de fondo**. La detección facial, el OCR y el red-eye dependen de la CPU y ya son rápidas, así que una GPU no aporta nada.

El uso máximo de VRAM alcanza los 7,5 GB durante el escalado con mejora facial. Una GPU NVIDIA de 6 GB funciona para la mayoría de las herramientas de IA por separado, pero fallará en el escalado. 8-12 GB de VRAM manejan todo.

La aceleración de iGPU Intel/AMD mediante VA-API, Quick Sync u OpenCL no es compatible con la inferencia de IA por ahora. Mapear `/dev/dri` dentro del contenedor no habilita la aceleración de IA por GPU; SnapOtter ejecutará las herramientas de IA en CPU a menos que NVIDIA CUDA esté disponible.

```yaml
deploy:
  resources:
    limits:
      cpus: '4'
      memory: 8G
    reservations:
      devices:
        - driver: nvidia
          count: all
          capabilities: [gpu]
```

### Usuarios concurrentes {#concurrent-users}

Solicitudes paralelas de redimensionado de imagen contra el contenedor de la aplicación limitado a 4 núcleos por defecto:

| Solicitudes concurrentes | Tiempo medio de respuesta | Errores |
|---|---|---|
| 1 | 0,4 s | 0 |
| 5 | 1,2 s | 0 |
| 10 | 2,1 s | 0 |

El tiempo de respuesta se degrada de forma sublineal sin errores a medida que el pool de workers se satura. Elevar el límite `cpus:` del contenedor de la aplicación (o usar un host con más núcleos) sube el techo. Ten en cuenta que los trabajos pesados (transcodificación de vídeo, IA en CPU) retienen un worker durante toda su duración, así que dimensiona la CPU según el número esperado de trabajos pesados concurrentes, no solo según el número de solicitudes.

### Formatos de imagen compatibles {#supported-image-formats}

SnapOtter admite **más de 55 formatos de entrada** y **14 formatos de salida**, incluidos archivos RAW de más de 20 marcas de cámaras, formatos profesionales (PSD, EPS, OpenEXR, HDR), códecs modernos (JPEG XL, AVIF, HEIC, QOI) y formatos científicos/de videojuegos (FITS, DDS).

Consulta la [lista completa de formatos](/es/guide/supported-formats) para los detalles de cada formato compatible, el decodificador utilizado y los controles de calidad disponibles.

### Limitaciones conocidas {#known-limitations}

- **El redimensionado con reconocimiento de contenido** falla en imágenes grandes (>5 MP) debido a una limitación del binario caire. Funciona bien con imágenes más pequeñas.
- **La decodificación HEIF** tarda de 13 a 23 segundos. HEIC (la variante de Apple) es mucho más rápida, de 0,3 a 0,9 segundos.
- **El OCR en japonés** falla en CPU debido a un error de MKLDNN de PaddlePaddle. Funciona en GPU.
- **El escalado** agota el tiempo de espera en CPU para cualquier cosa más allá de imágenes pequeñas. Se requiere GPU para un uso práctico.
- **La mejora facial con CodeFormer** es significativamente más lenta que GFPGAN (53 s frente a 2 s en GPU). Se recomienda GFPGAN para la mayoría de los casos de uso.

## Volúmenes {#volumes}

| Montaje / Volumen | Propósito | ¿Requerido? |
|---|---|---|
| `/data` (app) | Modelos de IA, venv de Python, archivos de usuario | **Sí** - pérdida de archivos sin él |
| `/tmp/workspace` (app) | Archivos temporales de procesamiento (limpiados automáticamente) | Recomendado |
| `SnapOtter-pgdata` (postgres) | Directorio de datos de PostgreSQL (usuarios, ajustes, pipelines, trabajos) | **Sí** - pérdida de datos sin él |
| `SnapOtter-redisdata` (redis) | Archivo append-only de Redis para colas de trabajos duraderas | Recomendado |

### Bind mounts frente a volúmenes con nombre {#bind-mounts-vs-named-volumes}

**Volúmenes con nombre** (recomendado) — Docker gestiona los permisos automáticamente:
```yaml
volumes:
  - SnapOtter-data:/data
```

**Bind mounts** — Tú gestionas los permisos. Define `PUID`/`PGID` para que coincidan con tu usuario del host:
```yaml
volumes:
  - ./SnapOtter-data:/data
environment:
  - PUID=1000    # Your host UID (run: id -u)
  - PGID=1000    # Your host GID (run: id -g)
```

### Permisos de almacenamiento {#storage-permissions}

SnapOtter escribe en dos ubicaciones en tiempo de ejecución: `/data` (archivos de usuario, logs, modelos de IA y el venv de Python) y `/tmp/workspace` (espacio temporal de procesamiento). Ambas deben ser escribibles por el usuario con el que se ejecuta el contenedor. Si alguna no lo es, el contenedor **falla rápidamente al arrancar** con un mensaje que nombra el directorio, el UID/GID en ejecución y cómo solucionarlo, en lugar de arrancar como "healthy" y luego fallar en la primera subida con un error críptico.

Cómo se gestionan los permisos depende de cómo se lance el contenedor:

**Por defecto (arranca como root, desciende a `snapotter`)** — el entrypoint arranca como root, corrige la propiedad de los volúmenes montados y luego desciende al usuario sin privilegios `snapotter` mediante `gosu`. Los volúmenes con nombre funcionan sin configuración. Para bind mounts, define `PUID`/`PGID` con tu usuario del host (arriba) para que los archivos que escribe te pertenezcan.

**Kubernetes / OpenShift (no-root mediante `runAsUser`)** — lanzado directamente como un usuario no-root, el contenedor no puede hacer chown de los volúmenes por sí mismo, así que el orquestador debe hacerlos escribibles. Define `fsGroup`:

```yaml
securityContext:
  runAsUser: 999
  runAsGroup: 999
  fsGroup: 999        # makes mounted volumes writable by the pod
```

Los directorios escribibles de la imagen pertenecen al grupo GID 0 y son escribibles por el grupo, de modo que un pod que se ejecuta con un **UID arbitrario** más el grupo suplementario root (el valor por defecto de OpenShift) puede escribir sin ningún `chown`.

**TrueNAS Scale (y otras configuraciones de "UID extranjero")** — TrueNAS ejecuta las aplicaciones como un usuario no-root (a menudo `568:568`) y monta datasets del host propiedad de un usuario distinto, así que ni el entrypoint ni `fsGroup` los hacen escribibles por sí solos. Elige una opción:

- **Ejecutar la aplicación como root** (recomendado) — deja el usuario de la aplicación sin definir o defínelo como `0`, y deja que el entrypoint por defecto corrija los permisos y descienda a `snapotter`.
- **Ejecutar como UID `999`** — define el usuario/grupo de la aplicación como `999:999` (el usuario integrado `snapotter` de SnapOtter) para que coincida con la propiedad de la imagen.
- **`chown` el dataset del host** al UID con el que se ejecuta el contenedor, desde la shell de TrueNAS:

  ```bash
  # Usa el UID del error de arranque (o ejecuta `id` dentro del contenedor)
  chown -R 568:568 /mnt/<pool>/<dataset>
  ```

El error de arranque nombra el UID exacto que se debe usar, así que el camino más rápido es arrancar la aplicación una vez, leer el mensaje y luego `chown` (o ajustar el usuario) en consecuencia.

## Variables de entorno {#environment-variables}

| Variable | Por defecto | Descripción |
|---|---|---|
| `AUTH_ENABLED` | `true` | Habilitar/deshabilitar el requisito de inicio de sesión |
| `DEFAULT_USERNAME` | `admin` | Nombre de usuario del administrador inicial |
| `DEFAULT_PASSWORD` | `admin` | Contraseña del administrador inicial (cambio forzado en el primer inicio de sesión) |
| `MAX_UPLOAD_SIZE_MB` | `100` | Límite de subida por archivo |
| `MAX_BATCH_SIZE` | `100` | Máximo de archivos por solicitud de lote |
| `RATE_LIMIT_PER_MIN` | `1000` | Solicitudes de API por minuto por IP (define 0 para deshabilitar) |
| `MAX_USERS` | `0` (ilimitado) | Máximo de cuentas de usuario |
| `TRUST_PROXY` | `true` | Confiar en las cabeceras X-Forwarded-For del proxy inverso |
| `PUID` | `999` | Ejecutar con este UID (para permisos de bind mount) |
| `PGID` | `999` | Ejecutar con este GID (para permisos de bind mount) |
| `LOG_LEVEL` | `info` | Verbosidad del log: fatal, error, warn, info, debug, trace |
| `CONCURRENT_JOBS` | `0` (auto) | Máximo de trabajos de procesamiento de IA en paralelo |
| `SESSION_DURATION_HOURS` | `168` | Duración de la sesión de inicio de sesión (7 días) |
| `CORS_ORIGIN` | (vacío) | Orígenes permitidos separados por comas, o vacío para el mismo origen |

## Health Check {#health-check}

El contenedor incluye un health check integrado:

```bash
# Check container health status
docker inspect --format='{{.State.Health.Status}}' SnapOtter

# Manual health check
curl http://localhost:1349/api/v1/health
# {"status":"healthy","version":"x.y.z"}
```

## Proxy inverso {#reverse-proxy}

SnapOtter establece `TRUST_PROXY=true` por defecto para que la limitación de tasa y el registro usen la IP real del cliente desde las cabeceras `X-Forwarded-For`.

### Nginx {#nginx}

```nginx
server {
    listen 80;
    server_name images.example.com;

    # Match MAX_UPLOAD_SIZE_MB (0 = nginx default 1M, so set high for unlimited)
    client_max_body_size 500M;

    location / {
        proxy_pass http://localhost:1349;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # SSE support (batch progress, feature install progress)
        proxy_buffering off;
        proxy_read_timeout 300s;
    }
}
```

### Nginx Proxy Manager {#nginx-proxy-manager}

1. Añade un nuevo Proxy Host
2. Establece Domain Name con tu dominio
3. Establece Scheme en `http`, Forward Hostname en `SnapOtter` (o la IP de tu contenedor), Forward Port en `1349`
4. Habilita el soporte para WebSocket
5. En Advanced, añade: `client_max_body_size 500M;` y `proxy_buffering off;`

### Traefik {#traefik}

```yaml
# Add these labels to the SnapOtter service in docker-compose.yml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.snapotter.rule=Host(`images.example.com`)"
  - "traefik.http.routers.snapotter.entrypoints=websecure"
  - "traefik.http.routers.snapotter.tls.certresolver=letsencrypt"
  - "traefik.http.services.snapotter.loadbalancer.server.port=1349"
  # Increase upload limit (default 2MB is too low)
  - "traefik.http.middlewares.snapotter-body.buffering.maxRequestBodyBytes=524288000"
  - "traefik.http.routers.snapotter.middlewares=snapotter-body"
```

### Caddy {#caddy}

```txt
images.example.com {
    reverse_proxy localhost:1349 {
        flush_interval -1
        transport http {
            read_timeout 300s
            write_timeout 300s
        }
    }
}
```

`flush_interval -1` deshabilita el almacenamiento en búfer de las respuestas, que es necesario para los eventos de progreso SSE (procesamiento por lotes, herramientas de IA, instalaciones de funciones). Los tiempos de espera ampliados permiten que las subidas de archivos grandes se completen sin que Caddy cierre la conexión antes de tiempo.

### Cloudflare Tunnels {#cloudflare-tunnels}

```bash
cloudflared tunnel --url http://localhost:1349
```

Nota: Cloudflare tiene un límite de subida de 100 MB en los planes gratuitos. Establece `MAX_UPLOAD_SIZE_MB=100` para que coincida.

## CI/CD {#ci-cd}

El repositorio de GitHub tiene tres flujos de trabajo:

- **ci.yml** - Se ejecuta automáticamente en cada push y PR. Aplica lint, verifica tipos, prueba, construye y valida la imagen Docker (sin publicarla).
- **release.yml** - Se activa manualmente mediante `workflow_dispatch`. Ejecuta semantic-release para crear una etiqueta de versión y una release de GitHub, luego construye una imagen Docker multi-arquitectura (amd64 + arm64) y la publica en Docker Hub (`snapotter/snapotter`) y GitHub Container Registry (`ghcr.io/snapotter-hq/snapotter`).
- **deploy-docs.yml** - Construye este sitio de documentación y lo despliega en Cloudflare Pages al hacer push a `main`.

Para crear una release, ve a **Actions > Release > Run workflow** en la interfaz de GitHub, o ejecuta:

```bash
gh workflow run release.yml
```

Semantic-release determina la versión a partir del historial de commits. La etiqueta Docker `latest` siempre apunta a la release más reciente.

## Analítica {#analytics}

SnapOtter incluye analítica anónima del producto (patrones de uso de las herramientas, informes de errores) para ayudar a detectar errores y mejorar las funciones. Está activada por defecto. Tus archivos, nombres de archivo y datos personales nunca forman parte de esto. SnapOtter funciona con normalidad con la analítica desactivada.

### Desactivar la analítica {#disabling-analytics}

La exclusión en tiempo de ejecución es un interruptor de administrador de un solo clic. Abre Settings > System > Privacy y desactiva Anonymous Product Analytics. Se detiene de inmediato para toda la instancia, sin necesidad de reconstruir.

Para una imagen que nunca pueda emitir analítica, establece la desactivación total en tiempo de compilación clonando el repositorio y reconstruyendo:

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker/docker-compose.yml build --build-arg SNAPOTTER_ANALYTICS=off
docker compose -f docker/docker-compose.yml up -d
```

O añade el argumento de compilación a tu `docker-compose.yml` existente:

```yaml
services:
  snapotter:
    build:
      context: .
      dockerfile: docker/Dockerfile
      args:
        SNAPOTTER_ANALYTICS: "off"
```
