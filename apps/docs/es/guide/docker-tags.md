---
description: "Etiquetas de la imagen Docker de SnapOtter, benchmarks de GPU, fijado de versiones y compatibilidad multiplataforma para AMD64 y ARM64."
i18n_source_hash: 148b3608e11a
i18n_provenance: human
i18n_output_hash: d1aeb361b929
---

# Imagen Docker {#docker-image}

SnapOtter se distribuye como una única imagen Docker. Al ejecutarla por sí sola, arranca un PostgreSQL 17 y un Redis embebidos en la interfaz de loopback (modo embebido); para producción, ejecútala junto a contenedores separados de PostgreSQL 17 y Redis 8 con Compose. La imagen de la aplicación funciona en todas las plataformas.

## Inicio rápido {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

Sin ningún `DATABASE_URL` definido, esto se ejecuta en modo embebido: PostgreSQL y Redis arrancan dentro del contenedor en loopback, con todos los datos bajo el volumen `SnapOtter-data`. Define `DATABASE_URL` y `REDIS_URL` (como hace la pila de [Compose](#docker-compose)) para usar servicios externos en su lugar. Consulta [Configuración](/es/guide/configuration#embedded-mode).

## Aceleración NVIDIA CUDA {#nvidia-cuda-acceleration}

La imagen incluye compatibilidad con NVIDIA CUDA en amd64. Si tienes una GPU NVIDIA con el [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) instalado, añade `--gpus all`:

```bash
docker run -d --name SnapOtter --gpus all -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

La imagen detecta CUDA automáticamente en tiempo de ejecución. Sin `--gpus all`, o cuando CUDA no está disponible, las herramientas de IA se ejecutan en CPU. La misma imagen en cualquier caso.

La aceleración por iGPU de Intel/AMD mediante VA-API, Quick Sync u OpenCL no es compatible hoy con la inferencia de IA de SnapOtter. Mapear `/dev/dri` dentro del contenedor puede exponer el dispositivo de render, pero el runtime de IA seguirá usando la CPU salvo que CUDA esté disponible.

### Benchmarks {#benchmarks}

Probado en una NVIDIA RTX 4070 (12 GB de VRAM) con un retrato JPEG de 572x1024.

#### Rendimiento en caliente {#warm-performance}

| Herramienta | CPU | GPU | Aceleración |
|------|-----|-----|---------|
| Eliminación de fondo (u2net) | 2.415ms | 879ms | 2,7x |
| Eliminación de fondo (isnet) | 2.457ms | 1.137ms | 2,2x |
| Escalado 2x | 350ms | 309ms | 1,1x |
| Escalado 4x | 910ms | 310ms | 2,9x |
| OCR (PaddleOCR) | 137ms | 94ms | 1,5x |
| Desenfoque de rostros | 139ms | 122ms | 1,1x |

#### Arranque en frío (primera petición tras iniciar el contenedor) {#cold-start-first-request-after-container-start}

| Herramienta | CPU | GPU | Aceleración |
|------|-----|-----|---------|
| Eliminación de fondo | 22.286ms | 4.792ms | 4,7x |
| Escalado 2x | 3.957ms | 2.318ms | 1,7x |
| OCR (PaddleOCR) | 1.469ms | 1.090ms | 1,3x |

### Comprobación de estado de CUDA {#cuda-health-check}

Tras la primera petición de IA, el endpoint de salud de administración informa del estado de la GPU CUDA:

```
GET /api/v1/admin/health
{"ai": {"gpu": true}}
```

## Docker Compose {#docker-compose}

La pila completa de Compose incluye la aplicación, PostgreSQL 17 y Redis 8. Consulta [Despliegue](/es/guide/deployment) para el `docker-compose.yml` completo. Un ejemplo mínimo:

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
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
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

Para la aceleración NVIDIA CUDA mediante Docker Compose, añade la sección deploy al servicio de SnapOtter:

```yaml
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
```

## Fijado de versiones {#version-pinning}

| Etiqueta | Descripción |
|-----|------------|
| `latest` | Última versión |
| `1.11.0` | Versión exacta |
| `1.11` | Último parche en 1.11.x |
| `1` | Última versión menor en 1.x |

## Plataformas {#platforms}

| Arquitectura | Soporte de GPU | Notas |
|---|---|---|
| linux/amd64 | NVIDIA CUDA | Aceleración CUDA completa para herramientas de IA |
| linux/arm64 | Solo CPU | Raspberry Pi 4/5, Apple Silicon mediante Docker Desktop |

## Migración desde etiquetas anteriores {#migration-from-previous-tags}

Si usabas la etiqueta `:cuda`, cambia a `:latest` y conserva `--gpus all`. Mismo soporte de GPU, imagen unificada.

Tus datos y ajustes se conservan en los volúmenes.
