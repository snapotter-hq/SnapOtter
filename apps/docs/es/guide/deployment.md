---
description: "Despliegue de SnapOtter en producción con Docker. Requisitos de hardware, configuración de GPU y configuraciones de proxy inverso para Nginx, Traefik y Cloudflare."
i18n_source_hash: 0c8f078ebe75
i18n_provenance: machine
i18n_output_hash: f3d6477a9dee
i18n_hash_version: 2
---

# Despliegue {#deployment}

SnapOtter se despliega como una pila Docker Compose de 3 contenedores: la imagen de la aplicación SnapOtter, PostgreSQL 17 y Redis 8. La imagen de la aplicación admite **linux/amd64** (con NVIDIA CUDA para aceleración de IA) y **linux/arm64** (CPU), por lo que se ejecuta de forma nativa en servidores Intel/AMD, Macs con Apple Silicon y dispositivos ARM como la Raspberry Pi 4/5. La aceleración de iGPU Intel/AMD mediante VA-API, Quick Sync u OpenCL no es compatible hoy con la inferencia de IA.

Consulte [Imagen de Docker](./docker-tags) para la configuración de GPU, ejemplos de Docker Compose y fijación de versiones.

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
      # Requests are served by a role that can only read and write rows. The
      # owner connects only during boot, to migrate and to grant. Set
      # POSTGRES_APP_PASSWORD and POSTGRES_PASSWORD for any non-local deployment.
      - DATABASE_URL=postgres://${POSTGRES_APP_USER:-snapotter_app}:${POSTGRES_APP_PASSWORD:-snapotter_app}@postgres:5432/${POSTGRES_DB:-snapotter}
      - DATABASE_MIGRATION_URL=postgres://${POSTGRES_USER:-snapotter}:${POSTGRES_PASSWORD:-snapotter}@postgres:5432/${POSTGRES_DB:-snapotter}
      - REDIS_URL=redis://redis:6379

      # --- Limits (set 0 for unlimited) ---
      # - MAX_UPLOAD_SIZE_MB=100   # Per-file upload limit in MB
      # - MAX_BATCH_SIZE=100       # Max files per batch request
      # - RATE_LIMIT_PER_MIN=1000  # API rate limit per IP, default shown (0 = disabled)
      # - MAX_USERS=0              # Max user accounts

      # --- Networking ---
      # - TRUST_PROXY=loopback,linklocal,uniquelocal  # Which peers may set the client IP via X-Forwarded-For (default shown)

      # --- Bind mount permissions ---
      # - PUID=1000                # Match your host user's UID (run: id -u)
      # - PGID=1000                # Match your host user's GID (run: id -g)

      # --- Engines (empty = the image's own binaries, see Configuration) ---
      - FFMPEG_PATH=${FFMPEG_PATH:-}
      - FFPROBE_PATH=${FFPROBE_PATH:-}
      - QPDF_PATH=${QPDF_PATH:-}
      - SOFFICE_PATH=${SOFFICE_PATH:-}
      - PDFCPU_PATH=${PDFCPU_PATH:-}
      - SNAPOTTER_HW_ACCEL=${SNAPOTTER_HW_ACCEL:-}  # nvenc|vaapi, needs your own ffmpeg build
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
      # These describe the owner. The app's own role (POSTGRES_APP_USER,
      # POSTGRES_APP_PASSWORD) is created by SnapOtter at boot, so Postgres is
      # not told about it here.
      POSTGRES_USER: ${POSTGRES_USER:-snapotter}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-snapotter}     # Change this for non-local deployments
      POSTGRES_DB: ${POSTGRES_DB:-snapotter}
    volumes:
      - SnapOtter-pgdata:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-snapotter} -d ${POSTGRES_DB:-snapotter}"]
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

La aplicación queda entonces disponible en `http://localhost:1349`.

La pila anterior se conecta como propietaria de la base de datos. Desde SnapOtter 2.3.0 puede atender solicitudes con un rol que solo lee y escribe filas; consulte [Roles de mínimo privilegio](./database#least-privilege-roles).

> **¿Límites de velocidad de Docker Hub?** Reemplace `snapotter/snapotter:latest` por `ghcr.io/snapotter-hq/snapotter:latest` para descargar desde GitHub Container Registry. Ambos registros reciben la misma imagen en cada versión.

## Inicio rápido (NVIDIA CUDA) {#quick-start-nvidia-cuda}

Para la aceleración NVIDIA CUDA en las herramientas de IA compatibles (eliminación de fondo, ampliación, mejora de rostros):

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
      # Runtime role (rows only) and the boot-only owner connection. See the CPU
      # example above.
      - DATABASE_URL=postgres://${POSTGRES_APP_USER:-snapotter_app}:${POSTGRES_APP_PASSWORD:-snapotter_app}@postgres:5432/${POSTGRES_DB:-snapotter}
      - DATABASE_MIGRATION_URL=postgres://${POSTGRES_USER:-snapotter}:${POSTGRES_PASSWORD:-snapotter}@postgres:5432/${POSTGRES_DB:-snapotter}
      - REDIS_URL=redis://redis:6379
      # Engines (empty = the image's own binaries, see Configuration)
      - FFMPEG_PATH=${FFMPEG_PATH:-}
      - FFPROBE_PATH=${FFPROBE_PATH:-}
      - QPDF_PATH=${QPDF_PATH:-}
      - SOFFICE_PATH=${SOFFICE_PATH:-}
      - PDFCPU_PATH=${PDFCPU_PATH:-}
      - SNAPOTTER_HW_ACCEL=${SNAPOTTER_HW_ACCEL:-}  # nvenc|vaapi, needs your own ffmpeg build
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
      # These describe the owner. The app's own role (POSTGRES_APP_USER,
      # POSTGRES_APP_PASSWORD) is created by SnapOtter at boot, so Postgres is
      # not told about it here.
      POSTGRES_USER: ${POSTGRES_USER:-snapotter}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-snapotter}     # Change this for non-local deployments
      POSTGRES_DB: ${POSTGRES_DB:-snapotter}
    volumes:
      - SnapOtter-pgdata:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-snapotter} -d ${POSTGRES_DB:-snapotter}"]
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

### Verificar la aceleración por GPU {#verify-gpu-acceleration}

Compruebe la detección de CUDA en los registros:

```bash
docker logs SnapOtter 2>&1 | head -20
# Look for: [gpu] CUDA available via torch
```

Si las herramientas de IA se ejecutan en CPU aunque `--gpus all` y NVIDIA Container Toolkit estén bien configurados, reinstale el paquete afectado (por ejemplo Eliminación de fondo) desde **Configuración → Funciones de IA**. El instalador restaura la compilación para GPU de ONNX Runtime, que una compilación solo para CPU incorporada por otro paquete (como la transcripción) puede ocultar en el entorno de IA compartido. Si reinstalar desde la interfaz no restaura la GPU en una imagen anterior, consulte la reparación manual en el [issue #490](https://github.com/snapotter-hq/SnapOtter/issues/490).

## Requisitos de hardware {#hardware-requirements}

Estas cifras provienen de pruebas de rendimiento en una variedad de sistemas, desde una estación de trabajo amd64 moderna con una NVIDIA RTX 4070 hasta una Raspberry Pi, ejecutando todo el catálogo de herramientas en cada uno y variando los límites de recursos de Docker para encontrar el mínimo real.

¿Ejecuta SnapOtter en el extremo bajo de estos niveles (una Pi, un portátil antiguo, un VPS de 2 GB)? [Configuraciones de bajos recursos](/es/guide/low-resource) convierte estas cifras en una guía concreta con límites ajustados.

### Referencia rápida {#quick-reference}

| Nivel | Caso de uso | CPU | RAM | GPU | Almacenamiento |
|------|----------|-----|-----|-----|---------|
| Mínimo | Herramientas sin IA (imagen, archivos, PDF ligero) más OCR rápido integrado y detección de rostros; un solo usuario; lotes pequeños | 2 núcleos | 2 GB | Ninguna | ~7 GB |
| Recomendado | Las cinco modalidades, incluidos vídeo, PDF y paquetes de IA estándar en CPU; lotes; algunos usuarios | 4 núcleos | 4 GB (8 GB para inpainting HQ) | Ninguna | ~25 GB |
| Completo | Todo a plena velocidad, incluida la IA en GPU; lotes grandes; muchos usuarios | 6-8 núcleos | 8 GB | NVIDIA con 8 GB+ de VRAM (12 GB cómodo) | ~35 GB |

**Arquitectura: solo 64 bits** (`linux/amd64` o `linux/arm64`). SnapOtter se ejecuta de forma nativa en servidores Intel/AMD, Macs con Apple Silicon y placas ARM de 64 bits, incluidas la **Raspberry Pi 4 y 5** (4-8 GB). **No** se ejecuta en ARM de 32 bits (`armv7`/`armhf`), porque no se compila ninguna imagen para él, ni en placas de clase 512 MB como la Pi Zero, que están por debajo del mínimo de memoria (vea más abajo).

### Mínimo (herramientas de imagen, archivos y PDF ligero; sin IA) {#minimum-image-files-and-light-pdf-tools-no-ai}

| Recurso | Requisito |
|---|---|
| CPU | 2 núcleos |
| RAM | 2 GB |
| Disco | ~5,5 GB (imagen) + volumen de datos |
| GPU | No requerida |

Las 222 herramientas del catálogo sin IA (imagen: redimensionar, recortar, convertir, comprimir, ajustar, marca de agua; vídeo: recortar, silenciar, remultiplexar; audio: convertir, normalizar, recortar; PDF: combinar, dividir, comprimir, rotar, proteger; conversiones de archivos y ajustes preestablecidos de conversión dedicados) se ejecutan en hardware modesto. La mayoría de las operaciones terminan en bastante menos de un segundo incluso con un archivo grande: una imagen de 2,7 MB se redimensiona en ~0,05 s y se recodifica a WebP en ~2 s.

El mínimo de memoria es real, según un barrido de límites de recursos de Docker: **512 MB no pueden iniciar la pila** (incluso un solo redimensionado de imagen es terminado), **1 GB** gestiona operaciones de un solo archivo pero un lote de varios archivos se queda sin memoria, y **2 GB / 2 núcleos** es la configuración más pequeña que gestiona lotes sin IA con comodidad. El OCR rápido integrado y el paquete `face-detection` también caben en 2 GB, mientras que los paquetes de IA más grandes (Whisper, LaMa/DDColor, rembg, RealESRGAN, restauración de fotos e inpainting HQ con SD1.5) necesitan de 4 a 8 GB de RAM y se rechazan de inmediato cuando la memoria libre está por debajo del mínimo de cada paquete.

```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2G
```

**La única excepción que consume mucha CPU es la recodificación de vídeo.** Las operaciones de copia de flujo (recortar, silenciar, remultiplexar el contenedor) son instantáneas, pero la transcodificación a otro códec depende de la CPU. Un clip de 1080p / 45 segundos recodificado a VP9 (WebM) tarda aproximadamente **~40 s** en una CPU moderna rápida, ~45 s en Apple Silicon, ~80 s en un portátil antiguo de 4 núcleos y **~130 s** en un servidor antiguo de 4 núcleos. Si su carga de trabajo se centra en vídeo, priorice los núcleos de CPU y la frecuencia de reloj, o aumente el límite `cpus:` del contenedor: el Compose incluido limita la aplicación a 4 núcleos por defecto (8 en el Compose para GPU).

### Recomendado (herramientas de IA en CPU) {#recommended-ai-tools-on-cpu}

| Recurso | Requisito |
|---|---|
| CPU | 4 núcleos |
| RAM | 4 GB |
| Disco | 3 GB (imagen) + unos 20 GB (todos los paquetes de IA opcionales) + espacio de trabajo |
| GPU | No requerida (alternativa en CPU) |

**Instalar y ejecutar los paquetes de IA más grandes es lo que eleva la recomendación a 4 GB de RAM.** Sin paquetes opcionales instalados, la aplicación en reposo ronda los 360 MB. Las herramientas Python heredadas comparten un sidecar, mientras que el OCR preciso usa un despachador dedicado de larga duración fijado a la generación inmutable activa. Antes de la activación, el instalador ejecuta una prueba de humo sobre el candidato. Después cambia de forma atómica al nuevo despachador y drena el despachador anterior antes de la recolección de basura. Cada artefacto oficial de OCR preciso debe superar su suite de versión de peor caso dentro de un cgroup de 4 GiB, mientras que la recomendación de 4 GB para el host deja margen para la aplicación Node.js, Postgres, Redis, las colas y el trabajo concurrente.

La mayoría de las herramientas de IA son perfectamente utilizables en CPU; un par realmente necesitan una GPU. Medido en una CPU moderna de 4 núcleos:

| Herramienta de IA | Tiempo en CPU | ¿Utilizable en CPU? |
|---|---|---|
| Detección de rostros (blur-faces, smart-crop, red-eye), noise-removal | menos de 1 s | Sí |
| OCR, transcripción, subtítulos | 1-3 s | Sí |
| Colorización, mejora de rostros | ~10 s | Sí |
| Eliminación / reemplazo / desenfoque de fondo | ~29 s | Sí (tendrá que esperar) |
| Ampliación con IA (RealESRGAN) | ~33 s en imágenes pequeñas; minutos en imágenes grandes | Marginal: se recomienda mucho una GPU |
| Restauración de fotos (proceso completo) | varios minutos | No: necesita una GPU o una CPU rápida de muchos núcleos |

SnapOtter no incorpora a propósito estas descargas de modelos en la imagen de Docker. Los paquetes de IA se descargan solo cuando un administrador habilita la herramienta correspondiente, se almacenan en el volumen persistente `/data/ai` y los comparten todas las herramientas que dependen de la misma pila de modelos. Esto mantiene pequeña la imagen final del contenedor y aun así permite que una instalación completa de IA alcance las cifras de almacenamiento más altas que se muestran abajo.

Algunas herramientas dependen de más de un paquete compartido. Por ejemplo, Foto de pasaporte necesita tanto `background-removal` como `face-detection`; si `background-removal` ya está instalado, habilitar Foto de pasaporte solo descarga el paquete `face-detection` que falta. La misma reutilización se aplica a todas las herramientas de IA.

Almacenamiento de los paquetes de IA opcionales y mínimos de memoria de CPU (SnapOtter comprueba la memoria disponible antes de enviar al sidecar de Python y rechaza de inmediato las ejecuciones por debajo del mínimo de memoria libre del paquete):

| Paquete | Tamaño en disco | Mínimo de memoria de CPU |
|---|---|---|
| Detección de rostros | 200-300 MB | 2 GB de RAM del host (~0,5 GB libres) |
| Transcripción | ~600 MB | 4 GB de RAM del host (~2 GB libres) |
| Borrador de objetos + Colorización | 1-2 GB | 4 GB de RAM del host (~2 GB libres) |
| OCR preciso (`balanced`/`best`) | ~208-234 MiB de descarga / ~409-488 MiB instalado | 4 GiB de memoria efectiva configurada (`fast` se ejecuta en 2 GB) |
| Eliminación de fondo | 4-5 GB | 4 GB de RAM del host (~2,5 GB libres) |
| Ampliación + Mejora de rostros + Eliminación de ruido | 5-6 GB | 4 GB de RAM del host (~2,5 GB libres) |
| Restauración de fotos | 4-5 GB | 4 GB de RAM del host (~3 GB libres) |
| Inpainting de alta calidad (`inpaint-hq`) | 5-7 GB | 8 GB de RAM del host (~6 GB libres) |
| **Todos los paquetes** | **~25 GB instalados** | **4 GB (8 GB con `inpaint-hq`)** |

El OCR rápido está integrado en la imagen mediante Tesseract, añade unos 25 MiB y no requiere el paquete de OCR opcional ni sus 4 GiB de memoria. El modo rápido admite `auto`, `en`, `de`, `es`, `fr`, `zh` y `ja`, pero no coreano (`ko`) ni árabe (`ar`). Ambos usan `balanced` o `best` y por tanto requieren el paquete preciso. El paquete preciso está disponible en los contenedores oficiales de Linux amd64 y arm64 y ejecuta ONNX Runtime en CPU. Los hosts NVIDIA usan ese mismo entorno de OCR en CPU, por lo que el OCR no depende de la versión de CUDA ni de la arquitectura de la GPU. El entorno preciso requiere al menos 4 GiB de memoria efectiva: el límite del cgroup del contenedor configurado o, si no lo hay, la memoria del host. SnapOtter rechaza los sistemas por debajo de ese mínimo de compatibilidad firmado antes de descargar el paquete. La instalación del paquete preciso también se rechaza en archivos bare-metal/precompilados cuya libc y ABI de Python no se pueden garantizar. En esos hosts no compatibles, el OCR de coreano y árabe devuelve un error de incompatibilidad explícito y nunca recurre silenciosamente al modo rápido. Una solicitud explícita de modo rápido para coreano devuelve `FEATURE_INCOMPATIBLE` con el motivo `fast-korean-unsupported` antes de que el trabajo se ponga en cola.

Las réplicas que comparten el mismo `DATA_DIR` deben usar la misma arquitectura de CPU; fije los despliegues de varias réplicas con afinidad de nodo. Las réplicas mixtas amd64/arm64 necesitan volúmenes de datos separados y despliegues independientes de SnapOtter.

El entorno preciso mantiene una única generación activa y purga su caché de descargas tras la activación. En esta versión, una primera instalación necesita temporalmente unos 620-720 MiB para el archivo más el área de preparación, y una actualización puede alcanzar cerca de 1,2 GiB mientras la generación anterior sigue activa. El instalador calcula el requisito exacto a partir del índice firmado y las generaciones actuales antes de descargar o extraer, y falla pronto si el volumen de datos es demasiado pequeño.

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
| GPU | NVIDIA con 8+ GB de VRAM (se recomiendan 12 GB) |
| Disco | ~35 GB en total |

Una GPU NVIDIA (CUDA) acelera drásticamente los modelos de IA más pesados. Medido en una RTX 4070 frente a una CPU moderna:

| Herramienta de IA | Aceleración con GPU | Notas |
|---|---|---|
| Ampliación con IA (RealESRGAN 2×) | **~47×** | La mayor mejora: menos de un segundo frente a ~33 s (minutos en imágenes grandes) |
| Mejora de rostros (CodeFormer) | **~12×** | ~0,9 s frente a ~11 s |
| Transcripción (Whisper) | ~4,5× | |
| Eliminación / reemplazo / desenfoque de fondo | ~4× | ~7 s en GPU frente a ~29 s en CPU |
| Colorización | ~1,8× | |
| OCR, detección de rostros, red-eye, noise-removal | ~1× | Ya son rápidos en CPU: una GPU no ayuda |
| Restauración de fotos | ninguna | Limitada por la CPU incluso con GPU (0 % de uso de GPU); aquí importa más una CPU rápida que una GPU |

Las herramientas que justifican una GPU son **ampliación, mejora de rostros, transcripción y eliminación de fondo**. La detección de rostros, el OCR y red-eye dependen de la CPU y ya son rápidos, así que una GPU no aporta nada.

El uso máximo de VRAM llega a 7,5 GB durante la ampliación con mejora de rostros. Una GPU NVIDIA de 6 GB funciona con la mayoría de las herramientas de IA por separado, pero fallará en la ampliación. De 8 a 12 GB de VRAM gestionan todo.

La aceleración de iGPU Intel/AMD mediante VA-API, Quick Sync u OpenCL no es compatible hoy con la inferencia de IA. Asignar `/dev/dri` al contenedor no habilita la aceleración de IA por GPU; SnapOtter ejecutará las herramientas de IA en CPU a menos que NVIDIA CUDA esté disponible.

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

Solicitudes paralelas de redimensionado de imágenes contra el contenedor de la aplicación predeterminado limitado a 4 núcleos:

| Solicitudes concurrentes | Tiempo medio de respuesta | Errores |
|---|---|---|
| 1 | 0,4 s | 0 |
| 5 | 1,2 s | 0 |
| 10 | 2,1 s | 0 |

El tiempo de respuesta se degrada de forma sublineal y sin errores a medida que el grupo de workers se satura. Aumentar el límite `cpus:` del contenedor de la aplicación (o usar un host con más núcleos) eleva el techo. Tenga en cuenta que los trabajos pesados (transcodificación de vídeo, IA en CPU) ocupan un worker durante toda su duración, así que dimensione la CPU según el número esperado de trabajos pesados concurrentes, no solo según el número de solicitudes.

### Formatos de imagen compatibles {#supported-image-formats}

SnapOtter admite **más de 55 formatos de entrada** y **14 formatos de salida**, incluidos archivos RAW de más de 20 marcas de cámaras, formatos profesionales (PSD, EPS, OpenEXR, HDR), códecs modernos (JPEG XL, AVIF, HEIC, QOI) y formatos científicos y de videojuegos (FITS, DDS).

Consulte la [lista completa de formatos](/es/guide/supported-formats) para ver los detalles de cada formato compatible, el decodificador utilizado y los controles de calidad disponibles.

### Limitaciones conocidas {#known-limitations}

- El **redimensionado con detección de contenido** falla en imágenes grandes (>5 MP) por una limitación del binario caire. Funciona bien con imágenes más pequeñas.
- La **decodificación HEIF** tarda de 13 a 23 segundos. HEIC (la variante de Apple) es mucho más rápida, de 0,3 a 0,9 segundos.
- La **ampliación** agota el tiempo en CPU con cualquier imagen que no sea pequeña. Se necesita GPU para un uso práctico.
- La mejora de rostros con **CodeFormer** es bastante más lenta que GFPGAN (53 s frente a 2 s en GPU). Se recomienda GFPGAN para la mayoría de los casos.

## Volúmenes {#volumes}

| Montaje / Volumen | Propósito | ¿Requerido? |
|---|---|---|
| `/data` (app) | Modelos de IA, venv de Python, archivos de usuario | **Sí**: sin él se pierden archivos |
| `/tmp/workspace` (app) | Archivos temporales de procesamiento (se limpian automáticamente) | Recomendado |
| `SnapOtter-pgdata` (postgres) | Directorio de datos de PostgreSQL (usuarios, ajustes, pipelines, trabajos) | **Sí**: sin él se pierden datos |
| `SnapOtter-redisdata` (redis) | Archivo append-only de Redis para colas de trabajos duraderas | Recomendado |

### Bind mounts frente a volúmenes con nombre {#bind-mounts-vs-named-volumes}

**Volúmenes con nombre** (recomendados): Docker gestiona los permisos automáticamente:
```yaml
volumes:
  - SnapOtter-data:/data
```

**Bind mounts**: usted gestiona los permisos. Configure `PUID`/`PGID` para que coincidan con su usuario del host:
```yaml
volumes:
  - ./SnapOtter-data:/data
environment:
  - PUID=1000    # Your host UID (run: id -u)
  - PGID=1000    # Your host GID (run: id -g)
```

### Permisos de almacenamiento {#storage-permissions}

SnapOtter escribe en dos ubicaciones en tiempo de ejecución: `/data` (archivos de usuario, registros, modelos de IA y el venv de Python) y `/tmp/workspace` (espacio temporal de procesamiento). Ambas deben poder ser escritas por el usuario con el que se ejecuta el contenedor. Si alguna no lo es, el contenedor **falla rápido al iniciar** con un mensaje que indica el directorio, el UID/GID en ejecución y cómo solucionarlo, en lugar de arrancar "saludable" y fallar en la primera subida con un error críptico. El directorio de registros (`LOG_DIR`, `/data/logs` en la imagen) se comprueba de la misma forma, en todos los modos de almacenamiento, ya que los registros permanecen locales aunque los archivos residan en S3.

La gestión de los permisos depende de cómo se inicie el contenedor:

**Predeterminado (inicia como root, pasa a `snapotter`)**: el entrypoint se inicia como root, corrige la propiedad de los volúmenes montados y luego pasa al usuario sin privilegios `snapotter` mediante `gosu`. Los volúmenes con nombre funcionan sin configuración. Con bind mounts, configure `PUID`/`PGID` con su usuario del host (arriba) para que los archivos que escribe le pertenezcan.

**Kubernetes / OpenShift (sin root mediante `runAsUser`)**: al iniciarse directamente como usuario sin root, el contenedor no puede hacer chown de los volúmenes por sí mismo, así que el orquestador debe hacerlos escribibles. Configure `fsGroup`:

```yaml
securityContext:
  runAsUser: 999
  runAsGroup: 999
  fsGroup: 999        # makes mounted volumes writable by the pod
```

Los directorios escribibles de la imagen pertenecen al grupo GID 0 y tienen permiso de escritura para el grupo, de modo que un pod que se ejecuta con un **UID arbitrario** más el grupo suplementario root (el valor predeterminado de OpenShift) puede escribir sin `chown`.

**TrueNAS Scale (y otras configuraciones con "UID ajeno")**: TrueNAS ejecuta las aplicaciones como un usuario sin root (a menudo `568:568`) y monta datasets del host que pertenecen a otro usuario, por lo que ni el entrypoint ni `fsGroup` los hacen escribibles por sí solos. Elija una opción:

- **Ejecutar la aplicación como root** (recomendado): deje sin definir el usuario de la aplicación o establézcalo en `0`, y deje que el entrypoint predeterminado corrija los permisos y pase a `snapotter`.
- **Ejecutar con el UID `999`**: establezca el usuario/grupo de la aplicación en `999:999` (el usuario integrado `snapotter` de SnapOtter) para que coincida con la propiedad de la imagen.
- **`chown` el dataset del host** al UID con el que se ejecuta el contenedor, desde la shell de TrueNAS:

  ```bash
  # Use the UID from the startup error (or run `id` inside the container)
  chown -R 568:568 /mnt/<pool>/<dataset>
  ```

El error de inicio indica el UID exacto que debe usar, así que el camino más rápido es iniciar la aplicación una vez, leer el mensaje y luego `chown` (o ajustar el usuario) en consecuencia.

## Variables de entorno {#environment-variables}

| Variable | Valor predeterminado | Descripción |
|---|---|---|
| `AUTH_ENABLED` | `true` | Habilitar o deshabilitar el requisito de inicio de sesión |
| `DEFAULT_USERNAME` | `admin` | Nombre de usuario del administrador inicial |
| `DEFAULT_PASSWORD` | `admin` | Contraseña del administrador inicial (cambio forzado en el primer inicio de sesión) |
| `MAX_UPLOAD_SIZE_MB` | `0` (sin límite) | Límite de subida por archivo en MB. La imagen incluye `0`; una compilación desde el código fuente empieza en 100 |
| `MAX_BATCH_SIZE` | `0` (sin límite) | Máximo de archivos por solicitud por lotes. La imagen incluye `0`; una compilación desde el código fuente empieza en 100 |
| `RATE_LIMIT_PER_MIN` | `1000` | Solicitudes de API por minuto por IP (establezca 0 para deshabilitar) |
| `MAX_USERS` | `0` (sin límite) | Máximo de cuentas de usuario |
| `TRUST_PROXY` | `loopback,linklocal,uniquelocal` | Qué peers pueden establecer la IP del cliente mediante `X-Forwarded-For`. Por defecto, solo redes privadas |
| `PUID` | `999` | Ejecutar con este UID (para permisos de bind mount) |
| `PGID` | `999` | Ejecutar con este GID (para permisos de bind mount) |
| `LOG_LEVEL` | `info` | Nivel de detalle del registro: fatal, error, warn, info, debug, trace |
| `CONCURRENT_JOBS` | `0` (automático) | Máximo de trabajos de procesamiento de IA en paralelo |
| `SESSION_DURATION_HOURS` | `168` | Duración de la sesión de inicio de sesión (7 días) |
| `CORS_ORIGIN` | (vacío) | Orígenes permitidos separados por comas, o vacío para el mismo origen |

### Proxy saliente y CA privada {#outbound-proxy-and-private-ca}

El contenedor oficial habilita la compatibilidad de Node con proxy por variables de entorno. Si SnapOtter debe llegar al repositorio del entorno de OCR u otros servicios HTTPS a través de un proxy corporativo, configure `HTTPS_PROXY` (y `HTTP_PROXY` cuando haga falta). Configure `NO_PROXY` con una lista separada por comas de los hosts a los que se debe llegar directamente, como Postgres, Redis y el almacenamiento de objetos interno.

Si el proxy o un servicio interno están firmados por una autoridad certificadora privada, monte el certificado de la CA en modo de solo lectura y apunte `NODE_EXTRA_CA_CERTS` a él. El archivo debe existir cuando se inicia el proceso de Node:

```yaml
services:
  app:
    environment:
      HTTPS_PROXY: http://proxy.example.internal:3128
      HTTP_PROXY: http://proxy.example.internal:3128
      NO_PROXY: postgres,redis,minio,localhost,127.0.0.1
      NODE_EXTRA_CA_CERTS: /etc/snapotter/custom-ca.pem
    volumes:
      - ./company-ca.pem:/etc/snapotter/custom-ca.pem:ro
```

Mantenga las credenciales del proxy fuera del archivo de Compose (por ejemplo en un archivo `.env` protegido o en un secreto). No deshabilite la verificación TLS: el índice firmado de OCR autentica los metadatos de la versión, mientras que la validación TLS normal sigue protegiendo el transporte y todas las demás solicitudes salientes.

## Comprobación de estado {#health-check}

El contenedor incluye una comprobación de estado integrada:

```bash
# Check container health status
docker inspect --format='{{.State.Health.Status}}' SnapOtter

# Manual health check
curl http://localhost:1349/api/v1/health
# {"status":"healthy","version":"x.y.z"}
```

## Proxy inverso {#reverse-proxy}

`TRUST_PROXY` tiene como valor predeterminado `loopback,linklocal,uniquelocal`, por lo que SnapOtter solo cree `X-Forwarded-For` cuando proviene de un peer en una red privada. Un proxy inverso en el mismo host, en una red de Docker o en su LAN es de confianza desde el primer momento, lo que significa que la limitación de velocidad, el limitador de fuerza bruta del inicio de sesión, el registro de auditoría y la lista de IP permitidas de la edición enterprise ven la IP real del cliente sin configuración alguna.

Configure `TRUST_PROXY=true` solo cuando el proxy que está delante llegue a SnapOtter desde una dirección **pública**, por ejemplo un balanceador de carga en la nube situado en otra red. En una instancia expuesta directamente, ese valor hace que `request.ip` lo controle un atacante, porque quien rote la cabecera obtiene un nuevo cubo de límite de velocidad por solicitud.

Dos cosas que debe saber antes de medir IPs de clientes. Docker Desktop en macOS y Windows sirve un puerto publicado mediante un proxy en espacio de usuario que reescribe cada dirección de origen a la puerta de enlace de la VM `192.168.65.1`, así que ningún valor de `TRUST_PROXY` recupera allí al cliente real; despliegue en Linux para cualquier servicio expuesto a internet. Y en cualquier plataforma, acceder a un puerto publicado mediante `localhost` se observa como la puerta de enlace del bridge y no como su cliente, así que una prueba en localhost no dice nada sobre cómo se atribuye un cliente real. La tabla completa de valores de `TRUST_PROXY` y la advertencia sobre Docker Desktop están en [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md#client-ip-resolution-trust_proxy).

Dos cosas importan para todos los proxies siguientes: permitir cuerpos de solicitud grandes (subidas) y no almacenar en búfer las respuestas. Un proxy que almacena respuestas en búfer rompe el progreso por SSE y, de forma más visible, hace que la descarga de un archivo grande "empiece pero nunca termine", porque el proxy retiene el archivo completo antes de pasarlo. SnapOtter envía `X-Accel-Buffering: no` en las descargas para que nginx las transmita aunque el almacenamiento en búfer siga activado en otro lugar, pero los proxies distintos de nginx necesitan que el almacenamiento de respuestas en búfer se deshabilite de forma explícita (se muestra en cada configuración más abajo). Si una descarga se detiene a mitad, un proxy con búfer delante es lo primero que debe revisar.

Una nota sobre HSTS: la API envía `Strict-Transport-Security` en cada respuesta por sí misma, así que un proxy que transmite las cabeceras de respuesta (todas las configuraciones de abajo lo hacen) no necesita configurar HSTS por su cuenta. Solo si su proxy está configurado para eliminar o sobrescribir las cabeceras de respuesta del origen debe conservar la cabecera o volver a añadirla en el borde.

### Nginx {#nginx}

```nginx
server {
    # Plain HTTP shown for brevity. Terminate TLS in your own `listen 443 ssl`
    # server block; the Strict-Transport-Security header the API sends passes
    # through with every proxied response, so no add_header is needed there.
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

        # Stream responses instead of buffering: needed for SSE progress
        # (batch, AI, feature installs) and for large file downloads.
        proxy_buffering off;
        proxy_read_timeout 300s;
    }
}
```

### Despliegue bajo una subruta {#subpath}

Para servir `https://example.com/snapotter`, configure `BASE_PATH=/snapotter` en el entorno del
contenedor de SnapOtter y reinícielo. Los archivos Compose oficiales para CPU y GPU
también aceptan `BASE_PATH` desde su shell o desde el archivo `.env` de Compose. La misma
imagen funciona en cualquier ruta; no hace falta recompilar el frontend.

`BASE_PATH` acepta segmentos separados por barras que contengan letras, dígitos, `_` o
`-`, incluidas rutas anidadas como `/apps/snapotter`. La barra final es
opcional. Déjelo vacío (el valor predeterminado), o establezca `/`, para un despliegue en la raíz.

En su bloque de servidor HTTPS de Nginx existente, use:

```nginx
location = /snapotter {
    return 308 /snapotter/$is_args$args;
}
location /snapotter/ {
    proxy_pass http://localhost:1349;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 500M;
    proxy_buffering off;
    proxy_read_timeout 300s;
}
```

Este ejemplo conserva el prefijo. También se admiten los proxies que eliminan `/snapotter` antes de
reenviar. Las comprobaciones de estado internas pueden seguir usando
`/api/v1/health`. Para OIDC o SAML, configure también
`EXTERNAL_URL=https://example.com/snapotter` y actualice las URL de callback del proveedor de identidad para que incluyan `/snapotter/api/auth/oidc/callback` o
`/snapotter/api/auth/saml/callback` respectivamente.

Los scripts de API siguen funcionando sin cambios: las URL de las respuestas de la API, como el
`downloadUrl` de una herramienta, empiezan con `/api/` sea cual sea `BASE_PATH`. Añádalas a la
URL base de su instancia (`https://example.com/snapotter` + `/api/v1/download/...`)
en lugar de resolverlas contra la raíz del dominio.

Abra la interfaz mediante la URL con prefijo (`https://example.com/snapotter`). Un
navegador que llegue sin el prefijo es enviado allí automáticamente; solo se espera que las solicitudes
de API lleguen a la aplicación sin prefijo. Si los registros dicen
`Requests arrive under /snapotter/ but BASE_PATH is empty`, su proxy está
reenviando un prefijo que `BASE_PATH` no declara: establezca `BASE_PATH` con él,
o elimine el prefijo en el proxy.

### Nginx Proxy Manager {#nginx-proxy-manager}

1. Añada un nuevo Proxy Host
2. Establezca Domain Name con su dominio
3. Establezca Scheme en `http`, Forward Hostname en `SnapOtter` (o la IP de su contenedor), Forward Port en `1349`
4. Habilite la compatibilidad con WebSocket
5. En Advanced, añada: `client_max_body_size 500M;` y `proxy_buffering off;`

La cabecera `Strict-Transport-Security` de la API pasa por NPM tal cual; el interruptor de HSTS de la pestaña SSL es opcional además de ella.

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

Traefik reenvía sin cambios las cabeceras de respuesta del origen, por lo que la cabecera `Strict-Transport-Security` de la API llega a los navegadores sin un middleware `headers`. Si ya ejecuta uno que reescribe las cabeceras de respuesta, asegúrese de que deje intacta esa cabecera.

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

`flush_interval -1` deshabilita el almacenamiento de respuestas en búfer, algo necesario para los eventos de progreso SSE (procesamiento por lotes, herramientas de IA, instalaciones de funciones) y para que las descargas de archivos grandes se transmitan en lugar de detenerse. Los tiempos de espera ampliados permiten que las subidas de archivos grandes se completen sin que Caddy cierre la conexión antes de tiempo. Caddy también deja pasar intacta la cabecera `Strict-Transport-Security` de la API, por lo que no se necesita ninguna directiva `header` para HSTS.

### Cloudflare Tunnels {#cloudflare-tunnels}

```bash
cloudflared tunnel --url http://localhost:1349
```

Nota: Cloudflare tiene un límite de subida de 100 MB en los planes gratuitos. Establezca `MAX_UPLOAD_SIZE_MB=100` para que coincida.

El túnel reenvía las cabeceras de respuesta de la API, incluida `Strict-Transport-Security`, por lo que no se requiere ninguna configuración de HSTS en el panel (el ajuste HSTS del propio borde de Cloudflare es opcional además de esto).

## Solución de problemas {#troubleshooting}

### "Postgres not reachable: EAI_AGAIN" justo después de un primer inicio fallido {#eai-again-after-failed-first-start}

Si el primer `docker compose up -d` falla a medias (lo habitual es que un puerto ya esté en uso), un simple reintento con `up -d` puede iniciar el contenedor de la aplicación sin conectarlo a la red de Compose. La aplicación entra entonces en un bucle de fallos con:

```
Postgres not reachable: EAI_AGAIN
```

mientras que `docker ps` muestra postgres saludable. El error es real pero señala al contenedor equivocado: sin la red, el DNS del nombre de host `postgres` no puede resolverse en absoluto, y la política de reinicio repite el mismo fallo indefinidamente.

Corrija lo que rompió el primer inicio (normalmente: liberar el puerto) y luego fuerce la recreación del contenedor de la aplicación para que se vuelva a conectar a la red:

```bash
docker compose up -d --force-recreate SnapOtter
```

### Windows: accesible desde otros dispositivos, pero no desde el propio PC {#windows-wsl2-loopback}

Con Docker ejecutándose dentro de WSL2 (la configuración habitual en Windows), la pila puede ser accesible desde todas las demás máquinas de su red mientras `http://localhost:1349` agota el tiempo de espera en el propio host de Windows, incluso con el modo de red reflejada de WSL habilitado. El puerto nunca aparece en `netstat` de Windows, y los contenedores no tienen ningún problema.

Abra la aplicación desde otro dispositivo, o desde dentro de la distro usando su propia dirección (`hostname -I` en la shell de WSL). Si el reenvío de localhost llega a funcionar en su versión de WSL, considérelo un extra y no algo de lo que depender.

## CI/CD {#ci-cd}

El repositorio de GitHub tiene tres workflows:

- **ci.yml**: se ejecuta automáticamente en cada push y PR. Ejecuta lint, comprobación de tipos, pruebas y compilación, y valida la imagen de Docker (sin publicarla).
- **release.yml**: se activa manualmente mediante `workflow_dispatch`. Ejecuta semantic-release para crear una etiqueta de versión y una versión de GitHub, luego compila una imagen de Docker multiarquitectura (amd64 + arm64) y la publica en Docker Hub (`snapotter/snapotter`) y GitHub Container Registry (`ghcr.io/snapotter-hq/snapotter`).
- **deploy-docs.yml**: compila este sitio de documentación y lo despliega en Cloudflare Pages con cada push a `main`.

Para crear una versión, vaya a **Actions > Release > Run workflow** en la interfaz de GitHub, o ejecute:

```bash
gh workflow run release.yml
```

Semantic-release determina la versión a partir del historial de commits. La etiqueta de Docker `latest` siempre apunta a la versión más reciente.

## Analítica {#analytics}

SnapOtter incluye analítica de producto anónima (patrones de uso de herramientas, informes de errores) para ayudar a detectar errores y mejorar las funciones. Está activada por defecto. Sus archivos, nombres de archivo y datos personales nunca forman parte de ella. SnapOtter funciona con normalidad con la analítica deshabilitada.

### Deshabilitar la analítica {#disabling-analytics}

La desactivación en tiempo de ejecución es un interruptor de administrador de un clic. Abra Configuración > Sistema > Privacidad y desactive Analítica de producto anónima. Se detiene de inmediato para toda la instancia, sin necesidad de recompilar.

Para una imagen que nunca pueda emitir analítica, establezca la desactivación total en tiempo de compilación clonando el repositorio y recompilando:

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker/docker-compose.yml build --build-arg SNAPOTTER_ANALYTICS=off
docker compose -f docker/docker-compose.yml up -d
```

O añada el argumento de compilación a su `docker-compose.yml` existente:

```yaml
services:
  snapotter:
    build:
      context: .
      dockerfile: docker/Dockerfile
      args:
        SNAPOTTER_ANALYTICS: "off"
```
