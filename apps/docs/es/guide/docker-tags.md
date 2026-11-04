---
description: "Etiquetas de imagen Docker de SnapOtter, benchmarks de GPU, fijación de versiones y compatibilidad multiplataforma para AMD64 y ARM64."
i18n_source_hash: a5871d76250c
i18n_provenance: machine
i18n_output_hash: 324b104fda78
i18n_hash_version: 2
---

# Etiquetas de imagen Docker {#docker-image}

SnapOtter se distribuye como una única imagen Docker. Si la ejecuta por sí sola, inicia un PostgreSQL 17 y un Redis integrados en la interfaz loopback (modo integrado); para producción, ejecútela junto a contenedores separados de PostgreSQL 17 y Redis 8 con Compose. La imagen de la aplicación funciona en todas las plataformas.

## Inicio rápido {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

Sin `DATABASE_URL` definido, se ejecuta en modo integrado: PostgreSQL y Redis se inician dentro del contenedor en loopback, con todos los datos bajo el volumen `SnapOtter-data`. Defina `DATABASE_URL` y `REDIS_URL` (como hace el stack de [Compose](#docker-compose)) para usar servicios externos. Consulte [Configuración](/es/guide/configuration#embedded-mode).

## Aceleración NVIDIA CUDA {#nvidia-cuda-acceleration}

La imagen incluye compatibilidad con NVIDIA CUDA en amd64. Si dispone de una GPU NVIDIA con el [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) instalado, añada `--gpus all`:

```bash
docker run -d --name SnapOtter --gpus all -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

La imagen detecta CUDA automáticamente en tiempo de ejecución. Sin `--gpus all`, o cuando CUDA no está disponible, las herramientas de IA se ejecutan en la CPU. Es la misma imagen en ambos casos.

La aceleración con iGPU de Intel/AMD mediante VA-API, Quick Sync u OpenCL no es compatible actualmente con la inferencia de IA de SnapOtter. Asignar `/dev/dri` al contenedor puede exponer el dispositivo de renderizado, pero el runtime de IA seguirá usando la CPU salvo que CUDA esté disponible.

### Benchmarks {#benchmarks}

Probado en una NVIDIA RTX 4070 (12 GB de VRAM) con un retrato JPEG de 572x1024.

#### Rendimiento en caliente {#warm-performance}

| Herramienta | CPU | GPU | Aceleración |
|------|-----|-----|---------|
| Eliminación de fondo (u2net) | 2,415ms | 879ms | 2.7x |
| Eliminación de fondo (isnet) | 2,457ms | 1,137ms | 2.2x |
| Ampliación 2x | 350ms | 309ms | 1.1x |
| Ampliación 4x | 910ms | 310ms | 2.9x |
| Desenfoque de rostros | 139ms | 122ms | 1.1x |

#### Arranque en frío (primera solicitud tras iniciar el contenedor) {#cold-start-first-request-after-container-start}

| Herramienta | CPU | GPU | Aceleración |
|------|-----|-----|---------|
| Eliminación de fondo | 22,286ms | 4,792ms | 4.7x |
| Ampliación 2x | 3,957ms | 2,318ms | 1.7x |

El OCR no se incluye en la comparación de CUDA. Tanto el nivel Tesseract integrado como los niveles opcionales RapidOCR/ONNX usan la CPU, incluso cuando el contenedor tiene acceso a la GPU NVIDIA.

### Comprobación de estado de CUDA {#cuda-health-check}

Tras la primera solicitud de IA, el endpoint de estado de administración informa del estado de la GPU CUDA:

```
GET /api/v1/admin/health
{"ai": {"gpu": true}}
```

## Docker Compose {#docker-compose}

El stack completo de Compose incluye la aplicación, PostgreSQL 17 y Redis 8. Consulte [Despliegue](/es/guide/deployment) para ver el `docker-compose.yml` completo. Un ejemplo mínimo:

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
      # Runtime role (rows only), then the boot-only owner connection.
      - DATABASE_URL=postgres://${POSTGRES_APP_USER:-snapotter_app}:${POSTGRES_APP_PASSWORD:-snapotter_app}@postgres:5432/${POSTGRES_DB:-snapotter}
      - DATABASE_MIGRATION_URL=postgres://${POSTGRES_USER:-snapotter}:${POSTGRES_PASSWORD:-snapotter}@postgres:5432/${POSTGRES_DB:-snapotter}
      - REDIS_URL=redis://redis:6379
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

  postgres:
    image: postgres:17-alpine
    environment:
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

Para la aceleración NVIDIA CUDA mediante Docker Compose, añada la sección deploy al servicio de SnapOtter:

```yaml
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
```

## Fijación de versiones {#version-pinning}

| Etiqueta | Descripción |
|-----|------------|
| `latest` | Última versión |
| `2.2.0` | Versión exacta |
| `2.2` | Último parche de 2.2.x |
| `2` | Última versión menor de 2.x |

## Plataformas {#platforms}

| Arquitectura | Compatibilidad con GPU | Notas |
|---|---|---|
| linux/amd64 | NVIDIA CUDA | Aceleración CUDA completa para las herramientas de IA |
| linux/arm64 | Solo CPU | Raspberry Pi 4/5, Apple Silicon mediante Docker Desktop |

## Migración desde etiquetas anteriores {#migration-from-previous-tags}

Si utilizaba la etiqueta `:cuda`, cambie a `:latest` y mantenga `--gpus all`. Misma compatibilidad con GPU, imagen unificada.

Sus datos y ajustes se conservan en los volúmenes.