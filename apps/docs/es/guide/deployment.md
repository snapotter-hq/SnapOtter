---
description: "Despliega SnapOtter en producción con Docker. Requisitos de hardware, configuración de GPU y configuraciones de proxy inverso para Nginx, Traefik y Cloudflare."
i18n_output_hash: 8d748bf9af34
i18n_source_hash: 98172965118b
i18n_provenance: human
---

# Despliegue {#deployment}

SnapOtter se despliega como una pila de Docker Compose de 3 contenedores: la imagen de la aplicación SnapOtter, PostgreSQL 17 y Redis 8. La imagen de la aplicación admite **linux/amd64** (con NVIDIA CUDA para aceleración de IA) y **linux/arm64** (CPU), así que se ejecuta de forma nativa en servidores Intel/AMD, Macs con Apple Silicon y dispositivos ARM como la Raspberry Pi 4/5. La aceleración por iGPU de Intel/AMD mediante VA-API, Quick Sync u OpenCL no es compatible con la inferencia de IA por ahora.

Consulta [Imagen de Docker](./docker-tags) para la configuración de GPU, ejemplos de Docker Compose y fijación de versiones.


<!-- korean-ocr-contract:start -->
::: info Compatibilidad del OCR coreano
OCR rápido admite `auto`, `en`, `de`, `es`, `fr`, `zh` y `ja`, pero no coreano (`ko`). El coreano requiere el paquete OCR preciso y `balanced` o `best`. El paquete funciona en los contenedores oficiales Linux amd64 y arm64, incluidos hosts NVIDIA, donde el OCR sigue usando la CPU. Los sistemas no compatibles reciben un error explícito y nunca vuelven silenciosamente a `fast`. Coreano con `fast` o el alias heredado `tesseract` se rechaza antes de encolarse con `FEATURE_INCOMPATIBLE` y `fast-korean-unsupported`.
:::
<!-- korean-ocr-contract:end -->
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

La aplicación queda entonces disponible en `http://localhost:1349`.

> **¿Límites de tasa de Docker Hub?** Reemplaza `snapotter/snapotter:latest` por `ghcr.io/snapotter-hq/snapotter:latest` para descargar desde GitHub Container Registry en su lugar. Ambos registros reciben la misma imagen en cada versión.

## Inicio rápido (NVIDIA CUDA) {#quick-start-nvidia-cuda}

Para la aceleración de NVIDIA CUDA en herramientas de IA compatibles (eliminación de fondo, ampliación de escala, mejora de rostros):

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

Comprueba la detección de CUDA en los registros:

```bash
docker logs SnapOtter 2>&1 | head -20
# Look for: [gpu] CUDA available via torch
```

## Requisitos de hardware {#hardware-requirements}

Estos números provienen de pruebas de rendimiento en una variedad de sistemas, desde una estación de trabajo amd64 moderna con una NVIDIA RTX 4070 hasta una Raspberry Pi, ejecutando todo el catálogo de herramientas en cada uno y ajustando los límites de recursos de Docker para encontrar el mínimo real.

¿Estás en el extremo bajo de estos niveles (una Pi, un portátil viejo, un VPS de 2 GB)? [Configuraciones con recursos limitados](/es/guide/low-resource) convierte estos números en una guía paso a paso concreta con topes ajustados.

### Referencia rápida {#quick-reference}

| Nivel | Caso de uso | CPU | RAM | GPU | Almacenamiento |
|------|----------|-----|-----|-----|---------|
| Mínimo | Herramientas de imagen, archivos y PDF ligeras; un solo usuario; lotes pequeños | 2 núcleos | 2 GB | Ninguna | ~7 GB |
| Recomendado | Las cinco modalidades incl. vídeo, PDF e IA en CPU; lotes; algunos usuarios | 4 núcleos | 4 GB | Ninguna | ~25 GB |
| Completo | Todo a velocidad incl. IA por GPU; lotes grandes; muchos usuarios | 6-8 núcleos | 8 GB | NVIDIA 8 GB+ VRAM (12 GB cómodo) | ~35 GB |

**Arquitectura: solo 64 bits** (`linux/amd64` o `linux/arm64`). SnapOtter se ejecuta de forma nativa en servidores Intel/AMD, Macs con Apple Silicon y placas ARM de 64 bits, incluidas las **Raspberry Pi 4 y 5** (4-8 GB). **No** se ejecuta en ARM de 32 bits (`armv7`/`armhf`), no se compila ninguna imagen para ello, ni en placas de clase 512 MB como la Pi Zero, que quedan por debajo del mínimo de memoria (ver más abajo).

### Mínimo (herramientas de imagen, archivos y PDF ligeras; sin IA) {#minimum-image-files-and-light-pdf-tools-no-ai}

| Recurso | Requisito |
|---|---|
| CPU | 2 núcleos |
| RAM | 2 GB |
| Disco | ~5,5 GB (imagen) + volumen de datos |
| GPU | No requerida |

Las 222 herramientas del catálogo sin IA (imagen: redimensionar, recortar, convertir, comprimir, ajustar, marca de agua; vídeo: recortar, silenciar, remultiplexar; audio: convertir, normalizar, recortar; PDF: combinar, dividir, comprimir, rotar, proteger; conversiones de archivos y ajustes de conversión predefinidos) se ejecutan en hardware modesto. La mayoría de las operaciones terminan en bastante menos de un segundo incluso con un archivo grande: una imagen de 2,7 MB se redimensiona en ~0,05 s y se recodifica a WebP en ~2 s.

El mínimo de memoria es real, según un barrido de límites de recursos de Docker: **512 MB no pueden arrancar la pila** (incluso un solo redimensionamiento de imagen se cancela), **1 GB** maneja operaciones de un solo archivo pero un lote de varios archivos se queda sin memoria, y **2 GB / 2 núcleos** es la configuración más pequeña que maneja lotes con comodidad.

```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2G
```

**La única excepción que exige mucha CPU es la recodificación de vídeo.** Las operaciones de copia de flujo (recortar, silenciar, remultiplexado de contenedor) son instantáneas, pero transcodificar a un códec diferente depende de la CPU. Un clip de 1080p / 45 segundos recodificado a VP9 (WebM) tarda aproximadamente **~40 s** en una CPU moderna rápida, ~45 s en Apple Silicon, ~80 s en un móvil de 4 núcleos más antiguo y **~130 s** en un servidor de 4 núcleos más antiguo. Si tu carga de trabajo es intensiva en vídeo, prioriza los núcleos de CPU y la frecuencia de reloj, o eleva el límite de `cpus:` del contenedor; el compose incluido limita la aplicación a 4 núcleos por defecto (8 en el compose de GPU).

### Recomendado (herramientas de IA en CPU) {#recommended-ai-tools-on-cpu}

| Recurso | Requisito |
|---|---|
| CPU | 4 núcleos |
| RAM | 4 GB |
| Disk | 3 GB (imagen) + aproximadamente 20 GB (todos los paquetes AI opcionales) + espacio de trabajo |
| GPU | No requerida (respaldo en CPU) |

**La instalación y ejecución de los paquetes de IA más grandes es lo que eleva la recomendación a 4 GB de RAM.** Sin paquetes opcionales instalados, la aplicación ocupa alrededor de 360 ​​MB. Las herramientas Python heredadas comparten un sidecar, mientras que el OCR preciso utiliza un dispatcher dedicado de larga duración anclado a la generación activa inmutable. Antes de la activación, el instalador ejecuta un smoke test en el candidato. Luego cambia atómicamente al nuevo dispatcher y drena el dispatcher anterior antes de garbage collection. Cada artefacto oficial de OCR preciso debe pasar su release suite del peor de los casos dentro de un cgroup de 4 GiB, mientras que la recomendación de host de 4 GB deja espacio para la aplicación Node.js, Postgres, Redis, colas y trabajo simultáneo.

La mayoría de las herramientas de IA son perfectamente utilizables en CPU; un par realmente quieren una GPU. Medido en una CPU moderna de 4 núcleos:

| Herramienta de IA | Tiempo en CPU | ¿Utilizable en CPU? |
|---|---|---|
| Detección de rostros (difuminar rostros, recorte inteligente, ojos rojos), eliminación de ruido | menos de 1 s | Sí |
| OCR, transcripción, subtítulos | 1-3 s | Sí |
| Colorizar, mejora de rostros | ~10 s | Sí |
| Eliminación / reemplazo / difuminado de fondo | ~29 s | Sí (tendrás que esperar) |
| Escalado con IA (RealESRGAN) | ~33 s en pequeñas; minutos en imágenes grandes | Marginal, se recomienda encarecidamente GPU |
| Restauración de fotos (canalización completa) | varios minutos | No, necesita una GPU o una CPU rápida de muchos núcleos |

SnapOtter intencionadamente no integra estas descargas de modelos en la imagen de Docker. Los paquetes de IA se descargan solo cuando un administrador habilita la herramienta relacionada, se almacenan en el volumen persistente `/data/ai` y son compartidos por cada herramienta que depende de la misma pila de modelos. Esto mantiene pequeña la imagen final del contenedor y a la vez permite que una instalación completa de IA alcance las cifras de almacenamiento mayores que aparecen a continuación.

Algunas herramientas dependen de más de un paquete compartido. Por ejemplo, Foto de Pasaporte necesita tanto `background-removal` como `face-detection`; si `background-removal` ya está instalado, habilitar Foto de Pasaporte solo descarga el paquete `face-detection` que falta. La misma reutilización se aplica a todas las herramientas de IA.

Estimaciones de almacenamiento de paquetes de IA opcionales:

| Paquete | Tamaño en disco |
|---|---|
| Eliminación de fondo | 4-5 GB |
| Escalado + Mejora de rostros + Eliminación de ruido | 5-6 GB |
| Detección de rostros | 200-300 MB |
| Borrador de objetos + Colorizar | 1-2 GB |
| Preciso OCR (`balanced`/`best`) | ~208-234 MiB descargar / ~409-488 MiB instalado |
| Restauración de fotos | 4-5 GB |
| Transcripción | ~600MB |
| **Todos los paquetes** | **~20 GB instalados** |

Fast OCR está integrado en la imagen a través de Tesseract, agrega alrededor de 25 MiB y no requiere el paquete OCR opcional ni sus 4 GiB de memoria. El paquete exacto está disponible en los contenedores oficiales Linux amd64 y arm64 y ejecuta ONNX Runtime en CPU. Los hosts NVIDIA utilizan el mismo tiempo de ejecución CPU OCR, por lo que OCR no depende de la versión de CUDA ni de la arquitectura de GPU. El tiempo de ejecución preciso requiere al menos 4 GiB de memoria efectiva: el límite cgroup del contenedor configurado; de lo contrario, la memoria del host. SnapOtter rechaza los sistemas por debajo del mínimo de compatibilidad firmado antes de descargar el paquete. La instalación precisa del paquete también se rechaza en bare-metal/archivos prediseñados cuyos libc y Python ABI no se pueden garantizar.

Las réplicas que compartan el mismo `DATA_DIR` deben usar la misma arquitectura de CPU; fije los despliegues con varias réplicas a nodos compatibles mediante afinidad de nodos. Las réplicas mixtas amd64/arm64 necesitan volúmenes de datos separados y despliegues independientes de SnapOtter.

El tiempo de ejecución preciso mantiene una generación activa y purga su caché de descarga después de la activación. Para esta versión, una primera instalación necesita temporalmente aproximadamente 620-720 MiB para el archivo más la preparación, y una actualización puede alcanzar un máximo cercano a 1.2 GiB mientras la generación anterior permanece activa. El instalador calcula el requisito exacto a partir del índice firmado y las generaciones actuales antes de descargarlo o extraerlo, y falla antes de tiempo si el volumen de datos es demasiado pequeño.

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
| CPU | 6-8 núcleos (la preparación de vídeo + concurrencia se ejecutan en CPU incluso con IA por GPU) |
| RAM | 8 GB |
| GPU | NVIDIA con 8+ GB VRAM (12 GB recomendado) |
| Disco | ~35 GB en total |

Una GPU NVIDIA (CUDA) acelera drásticamente los modelos de IA pesados. Medido en una RTX 4070 frente a una CPU moderna:

| Herramienta de IA | Aceleración con GPU | Notas |
|---|---|---|
| Escalado con IA (RealESRGAN 2×) | **~47×** | La mayor ganancia, menos de un segundo frente a ~33 s (minutos en imágenes grandes) |
| Mejora de rostros (CodeFormer) | **~12×** | ~0,9 s frente a ~11 s |
| Transcripción (Whisper) | ~4,5× | |
| Eliminación / reemplazo / difuminado de fondo | ~4× | ~7 s en GPU frente a ~29 s en CPU |
| Colorizar | ~1,8× | |
| OCR, detección de rostros, ojos rojos, eliminación de ruido | ~1× | Ya rápidas en CPU, una GPU no ayuda |
| Restauración de fotos | ninguna | Dependiente de CPU incluso en una GPU (0 % de uso de GPU); aquí importa más una CPU rápida que una GPU |

Las herramientas que merecen una GPU son **escalado, mejora de rostros, transcripción y eliminación de fondo**. La detección de rostros, el OCR y los ojos rojos dependen de la CPU y ya son rápidos, así que una GPU no aporta nada.

El uso máximo de VRAM alcanza 7,5 GB durante el escalado con mejora de rostros. Una GPU NVIDIA de 6 GB funciona para la mayoría de las herramientas de IA de forma individual, pero fallará en el escalado. 8-12 GB de VRAM manejan todo.

La aceleración por iGPU de Intel/AMD mediante VA-API, Quick Sync u OpenCL no es compatible con la inferencia de IA por ahora. Mapear `/dev/dri` en el contenedor no habilita la aceleración de IA por GPU; SnapOtter ejecutará las herramientas de IA en CPU a menos que NVIDIA CUDA esté disponible.

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

Solicitudes de redimensionamiento de imagen en paralelo contra el contenedor de la aplicación limitado a 4 núcleos por defecto:

| Solicitudes concurrentes | Tiempo de respuesta medio | Errores |
|---|---|---|
| 1 | 0,4 s | 0 |
| 5 | 1,2 s | 0 |
| 10 | 2,1 s | 0 |

El tiempo de respuesta se degrada de forma sublineal sin errores a medida que se satura el grupo de trabajadores. Elevar el límite de `cpus:` del contenedor de la aplicación (o usar un host con más núcleos) sube el techo. Ten en cuenta que los trabajos pesados (transcodificación de vídeo, IA en CPU) retienen un trabajador durante toda su duración, así que dimensiona la CPU según tu número esperado de trabajos pesados concurrentes, no solo según el recuento de solicitudes.

### Formatos de imagen admitidos {#supported-image-formats}

SnapOtter admite **55+ formatos de entrada** y **14 formatos de salida**, incluidos archivos RAW de más de 20 marcas de cámara, formatos profesionales (PSD, EPS, OpenEXR, HDR), códecs modernos (JPEG XL, AVIF, HEIC, QOI) y formatos científicos/de videojuegos (FITS, DDS).

Consulta la [lista completa de formatos](/es/guide/supported-formats) para más detalles sobre cada formato admitido, el decodificador utilizado y los controles de calidad disponibles.

### Limitaciones conocidas {#known-limitations}

- **El redimensionamiento con reconocimiento de contenido** se bloquea en imágenes grandes (>5 MP) debido a una limitación en el binario caire. Funciona bien con imágenes más pequeñas.
- **La decodificación HEIF** tarda entre 13 y 23 segundos. HEIC (la variante de Apple) es mucho más rápida, entre 0,3 y 0,9 segundos.
- **El escalado** agota el tiempo en CPU para cualquier cosa que no sean imágenes pequeñas. Se requiere GPU para un uso práctico.
- **La mejora de rostros con CodeFormer** es considerablemente más lenta que GFPGAN (53 s frente a 2 s en GPU). Se recomienda GFPGAN para la mayoría de los casos de uso.

## Volúmenes {#volumes}

| Montaje / Volumen | Propósito | ¿Requerido? |
|---|---|---|
| `/data` (app) | Modelos de IA, venv de Python, archivos de usuario | **Sí**, pérdida de archivos sin él |
| `/tmp/workspace` (app) | Archivos temporales de procesamiento (limpiados automáticamente) | Recomendado |
| `SnapOtter-pgdata` (postgres) | Directorio de datos de PostgreSQL (usuarios, ajustes, canalizaciones, trabajos) | **Sí**, pérdida de datos sin él |
| `SnapOtter-redisdata` (redis) | Archivo de solo anexión de Redis para colas de trabajos duraderas | Recomendado |

### Montajes de enlace frente a volúmenes con nombre {#bind-mounts-vs-named-volumes}

**Volúmenes con nombre** (recomendado): Docker gestiona los permisos automáticamente:
```yaml
volumes:
  - SnapOtter-data:/data
```

**Montajes de enlace**: Tú gestionas los permisos. Configura `PUID`/`PGID` para que coincidan con tu usuario del host:
```yaml
volumes:
  - ./SnapOtter-data:/data
environment:
  - PUID=1000    # Your host UID (run: id -u)
  - PGID=1000    # Your host GID (run: id -g)
```

### Permisos de almacenamiento {#storage-permissions}

SnapOtter escribe en dos ubicaciones en tiempo de ejecución: `/data` (archivos de usuario, registros, modelos de IA y el venv de Python) y `/tmp/workspace` (espacio temporal de procesamiento). Ambas deben ser escribibles por el usuario con el que se ejecuta el contenedor. Si alguna no lo es, el contenedor **falla rápido en el arranque** con un mensaje que nombra el directorio, el UID/GID en ejecución y cómo solucionarlo, en lugar de arrancar "sano" y luego fallar en la primera subida con un error críptico.

Cómo se gestionan los permisos depende de cómo se lance el contenedor:

**Por defecto (arranca como root, cae a `snapotter`)**: el punto de entrada arranca como root, corrige la propiedad de los volúmenes montados y luego cae al usuario sin privilegios `snapotter` mediante `gosu`. Los volúmenes con nombre funcionan sin configuración. Para los montajes de enlace, configura `PUID`/`PGID` con tu usuario del host (arriba) para que los archivos que escribe sean de tu propiedad.

**Kubernetes / OpenShift (sin root mediante `runAsUser`)**: lanzado directamente como un usuario sin root, el contenedor no puede hacer chown de los volúmenes por sí mismo, así que el orquestador debe hacerlos escribibles. Configura `fsGroup`:

```yaml
securityContext:
  runAsUser: 999
  runAsGroup: 999
  fsGroup: 999        # makes mounted volumes writable by the pod
```

Los directorios escribibles de la imagen tienen como grupo propietario el GID 0 y son escribibles por el grupo, así que un pod que se ejecute con un **UID arbitrario** más el grupo suplementario root (el valor predeterminado de OpenShift) puede escribir sin `chown`.

**TrueNAS Scale (y otras configuraciones de "UID ajeno")**: TrueNAS ejecuta las apps como un usuario sin root (a menudo `568:568`) y monta conjuntos de datos del host propiedad de un usuario diferente, así que ni el punto de entrada ni `fsGroup` los hacen escribibles por sí solos. Elige una opción:

- **Ejecuta la app como root** (recomendado): deja el usuario de la app sin definir o configúralo como `0`, y deja que el punto de entrada por defecto corrija los permisos y caiga a `snapotter`.
- **Ejecuta como UID `999`**: configura el usuario/grupo de la app como `999:999` (el usuario integrado `snapotter` de SnapOtter) para que coincida con la propiedad de la imagen.
- **`chown` el conjunto de datos del host** al UID con el que se ejecuta el contenedor, desde el shell de TrueNAS:

  ```bash
  # Usa el UID del error de arranque (o ejecuta `id` dentro del contenedor)
  chown -R 568:568 /mnt/<pool>/<dataset>
  ```

El error de arranque nombra el UID exacto que hay que usar, así que la vía más rápida es arrancar la app una vez, leer el mensaje y luego `chown` (o ajustar el usuario) en consecuencia.

## Variables de entorno {#environment-variables}

| Variable | Predeterminado | Descripción |
|---|---|---|
| `AUTH_ENABLED` | `true` | Habilita/deshabilita el requisito de inicio de sesión |
| `DEFAULT_USERNAME` | `admin` | Nombre de usuario inicial del administrador |
| `DEFAULT_PASSWORD` | `admin` | Contraseña inicial del administrador (cambio forzado en el primer inicio de sesión) |
| `MAX_UPLOAD_SIZE_MB` | `100` | Límite de subida por archivo |
| `MAX_BATCH_SIZE` | `100` | Máximo de archivos por solicitud de lote |
| `RATE_LIMIT_PER_MIN` | `1000` | Solicitudes de API por minuto por IP (configura 0 para deshabilitar) |
| `MAX_USERS` | `0` (ilimitado) | Máximo de cuentas de usuario |
| `TRUST_PROXY` | `true` | Confiar en las cabeceras X-Forwarded-For del proxy inverso |
| `PUID` | `999` | Ejecutar como este UID (para permisos de montajes de enlace) |
| `PGID` | `999` | Ejecutar como este GID (para permisos de montajes de enlace) |
| `LOG_LEVEL` | `info` | Verbosidad del registro: fatal, error, warn, info, debug, trace |
| `CONCURRENT_JOBS` | `0` (auto) | Máximo de trabajos de procesamiento de IA en paralelo |
| `SESSION_DURATION_HOURS` | `168` | Duración de la sesión de inicio de sesión (7 días) |
| `CORS_ORIGIN` | (vacío) | Orígenes permitidos separados por comas, o vacío para el mismo origen |

### Proxy saliente y CA privada {#outbound-proxy-and-private-ca}

El contenedor oficial habilita el soporte de proxy de entorno de Node. Si SnapOtter debe llegar al repositorio de tiempo de ejecución de OCR u otros servicios HTTPS a través de un proxy corporativo, configure `HTTPS_PROXY` (y `HTTP_PROXY` cuando sea necesario). Configure `NO_PROXY` en una lista de hosts separados por comas a los que se debe acceder directamente, como Postgres, Redis y almacenamiento de objetos internos.

Si el proxy o un servicio interno está firmado por una autoridad de certificación privada, monte el certificado de CA de solo lectura y apunte `NODE_EXTRA_CA_CERTS` hacia él. El archivo debe existir cuando se inicia el proceso del Nodo:

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

Mantenga las credenciales del proxy fuera del archivo Compose (por ejemplo, en un archivo `.env` protegido o secreto). No deshabilite la verificación TLS: el índice OCR firmado autentica los metadatos de la versión, mientras que la validación TLS normal aún protege el transporte y cualquier otra solicitud saliente.

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

SnapOtter establece `TRUST_PROXY=true` por defecto para que la limitación de tasa y el registro usen la IP real del cliente de las cabeceras `X-Forwarded-For`.

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
2. Establece el Domain Name a tu dominio
3. Establece el Scheme a `http`, el Forward Hostname a `SnapOtter` (o la IP de tu contenedor), y el Forward Port a `1349`
4. Habilita el soporte de WebSocket
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

`flush_interval -1` deshabilita el almacenamiento en búfer de la respuesta, que es necesario para los eventos de progreso SSE (procesamiento por lotes, herramientas de IA, instalaciones de funciones). Los tiempos de espera extendidos permiten que las subidas de archivos grandes se completen sin que Caddy cierre la conexión antes de tiempo.

### Túneles de Cloudflare {#cloudflare-tunnels}

```bash
cloudflared tunnel --url http://localhost:1349
```

Nota: Cloudflare tiene un límite de subida de 100 MB en los planes gratuitos. Configura `MAX_UPLOAD_SIZE_MB=100` para que coincida.

## CI/CD {#ci-cd}

El repositorio de GitHub tiene tres flujos de trabajo:

- **ci.yml**: se ejecuta automáticamente en cada push y PR. Analiza el código, comprueba tipos, prueba, compila y valida la imagen de Docker (sin publicarla).
- **release.yml**: se activa manualmente mediante `workflow_dispatch`. Ejecuta semantic-release para crear una etiqueta de versión y una versión de GitHub, luego compila una imagen de Docker multiarquitectura (amd64 + arm64) y la publica en Docker Hub (`snapotter/snapotter`) y GitHub Container Registry (`ghcr.io/snapotter-hq/snapotter`).
- **deploy-docs.yml**: compila este sitio de documentación y lo despliega en Cloudflare Pages al hacer push a `main`.

Para crear una versión, ve a **Actions > Release > Run workflow** en la interfaz de GitHub, o ejecuta:

```bash
gh workflow run release.yml
```

Semantic-release determina la versión a partir del historial de commits. La etiqueta de Docker `latest` siempre apunta a la versión más reciente.

## Analítica {#analytics}

SnapOtter incluye analítica de producto anónima (patrones de uso de herramientas, informes de errores) para ayudar a detectar fallos y mejorar funciones. Está activada por defecto. Tus archivos, nombres de archivo y datos personales nunca forman parte de esto. SnapOtter funciona con normalidad con la analítica deshabilitada.

### Deshabilitar la analítica {#disabling-analytics}

La exclusión en tiempo de ejecución es un interruptor de administrador de un solo clic. Abre Ajustes > Sistema > Privacidad y desactiva Analítica Anónima de Producto. Se detiene de inmediato para toda la instancia, sin necesidad de recompilar.

Para una imagen que nunca pueda emitir analítica, establece la desactivación total en tiempo de compilación clonando el repositorio y recompilando:

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
