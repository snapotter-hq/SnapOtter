---
description: "Теги Docker-образа SnapOtter, тесты производительности GPU, закрепление версий и поддержка нескольких платформ для AMD64 и ARM64."
i18n_output_hash: 4aa9a90eb109
i18n_source_hash: fda322e78b4b
i18n_provenance: human
---

# Docker-образ {#docker-image}

SnapOtter поставляется в виде единого Docker-образа. Запустите его самостоятельно, и он запустит встроенные PostgreSQL 17 и Redis на интерфейсе loopback (встроенный режим); для продакшена запускайте его рядом с отдельными контейнерами PostgreSQL 17 и Redis 8 через Compose. Образ приложения работает на всех платформах.

## Быстрый старт {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

Без заданного `DATABASE_URL` он работает во встроенном режиме: PostgreSQL и Redis запускаются внутри контейнера на loopback, а все данные хранятся в томе `SnapOtter-data`. Задайте `DATABASE_URL` и `REDIS_URL` (как это делает стек [Compose](#docker-compose)), чтобы вместо этого использовать внешние сервисы. См. [Конфигурация](/ru/guide/configuration#embedded-mode).

## Ускорение NVIDIA CUDA {#nvidia-cuda-acceleration}

Образ включает поддержку NVIDIA CUDA на amd64. Если у вас есть GPU NVIDIA с установленным [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html), добавьте `--gpus all`:

```bash
docker run -d --name SnapOtter --gpus all -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

Образ автоматически обнаруживает CUDA во время выполнения. Без `--gpus all` или когда CUDA недоступна, инструменты ИИ работают на CPU. В обоих случаях образ один и тот же.

Ускорение через интегрированные GPU Intel/AMD посредством VA-API, Quick Sync или OpenCL сегодня не поддерживается для инференса ИИ в SnapOtter. Проброс `/dev/dri` в контейнер может открыть render-устройство, но среда выполнения ИИ всё равно будет использовать CPU, если CUDA недоступна.

### Тесты производительности {#benchmarks}

Протестировано на NVIDIA RTX 4070 (12 ГБ VRAM) с портретным JPEG 572x1024.

#### Производительность в прогретом состоянии {#warm-performance}

| Инструмент | CPU | GPU | Ускорение |
|------|-----|-----|---------|
| Удаление фона (u2net) | 2 415 мс | 879 мс | 2.7x |
| Удаление фона (isnet) | 2 457 мс | 1 137 мс | 2.2x |
| Увеличение 2x | 350 мс | 309 мс | 1.1x |
| Увеличение 4x | 910 мс | 310 мс | 2.9x |
| Размытие лиц | 139 мс | 122 мс | 1.1x |

#### Холодный старт (первый запрос после запуска контейнера) {#cold-start-first-request-after-container-start}

| Инструмент | CPU | GPU | Ускорение |
|------|-----|-----|---------|
| Удаление фона | 22 286 мс | 4 792 мс | 4.7x |
| Увеличение 2x | 3 957 мс | 2 318 мс | 1.7x |

OCR не включен в сравнение CUDA. Как встроенный уровень Tesseract, так и дополнительные уровни RapidOCR/ONNX используют CPU, в том числе, когда контейнер имеет доступ NVIDIA GPU.

### Проверка состояния CUDA {#cuda-health-check}

После первого запроса к ИИ административная конечная точка health сообщает о статусе GPU CUDA:

```
GET /api/v1/admin/health
{"ai": {"gpu": true}}
```

## Docker Compose {#docker-compose}

Полный стек Compose включает приложение, PostgreSQL 17 и Redis 8. См. [Развёртывание](/ru/guide/deployment) для полного `docker-compose.yml`. Минимальный пример:

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

Для ускорения NVIDIA CUDA через Docker Compose добавьте секцию deploy к сервису SnapOtter:

```yaml
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
```

## Закрепление версии {#version-pinning}

| Тег | Описание |
|-----|------------|
| `latest` | Последний релиз |
| `1.11.0` | Точная версия |
| `1.11` | Последний патч в 1.11.x |
| `1` | Последний минорный в 1.x |

## Платформы {#platforms}

| Архитектура | Поддержка GPU | Примечания |
|---|---|---|
| linux/amd64 | NVIDIA CUDA | Полное ускорение CUDA для инструментов ИИ |
| linux/arm64 | Только CPU | Raspberry Pi 4/5, Apple Silicon через Docker Desktop |

## Миграция с предыдущих тегов {#migration-from-previous-tags}

Если вы использовали тег `:cuda`, переключитесь на `:latest` и сохраните `--gpus all`. Та же поддержка GPU, единый образ.

Ваши данные и настройки сохраняются в томах.
