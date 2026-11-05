---
description: "Образы SnapOtter Docker: теги, тесты производительности GPU, фиксация версий и поддержка нескольких платформ (AMD64 и ARM64)."
i18n_source_hash: a5871d76250c
i18n_provenance: machine
i18n_output_hash: 7ae4c7da634b
i18n_hash_version: 2
---

# Теги образа Docker {#docker-image}

SnapOtter поставляется как один образ Docker. Если запустить его отдельно, он поднимает встроенные PostgreSQL 17 и Redis на loopback-интерфейсе (встроенный режим); в продакшене запускайте его вместе с отдельными контейнерами PostgreSQL 17 и Redis 8 через Compose. Образ приложения работает на всех платформах.

## Быстрый старт {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

Если `DATABASE_URL` не задан, образ работает во встроенном режиме: PostgreSQL и Redis запускаются внутри контейнера на loopback, а все данные хранятся в томе `SnapOtter-data`. Задайте `DATABASE_URL` и `REDIS_URL` (как это делает стек [Compose](#docker-compose)), чтобы использовать внешние сервисы. См. [Конфигурация](/ru/guide/configuration#embedded-mode).

## Ускорение NVIDIA CUDA {#nvidia-cuda-acceleration}

Образ включает поддержку NVIDIA CUDA на amd64. Если у вас есть GPU NVIDIA и установлен [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html), добавьте `--gpus all`:

```bash
docker run -d --name SnapOtter --gpus all -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

Образ автоматически определяет CUDA во время работы. Без `--gpus all` или если CUDA недоступна, инструменты ИИ работают на CPU. Образ в обоих случаях один и тот же.

Ускорение на встроенных GPU Intel/AMD через VA-API, Quick Sync или OpenCL для ИИ-вывода SnapOtter сейчас не поддерживается. Проброс `/dev/dri` в контейнер может открыть доступ к устройству рендеринга, но среда выполнения ИИ всё равно будет использовать CPU, пока недоступна CUDA.

### Тесты производительности {#benchmarks}

Проверено на NVIDIA RTX 4070 (12 ГБ VRAM) с портретным JPEG 572x1024.

#### Производительность в прогретом состоянии {#warm-performance}

| Инструмент | CPU | GPU | Ускорение |
|------|-----|-----|---------|
| Удаление фона (u2net) | 2,415ms | 879ms | 2.7x |
| Удаление фона (isnet) | 2,457ms | 1,137ms | 2.2x |
| Увеличение 2x | 350ms | 309ms | 1.1x |
| Увеличение 4x | 910ms | 310ms | 2.9x |
| Размытие лиц | 139ms | 122ms | 1.1x |

#### Холодный старт (первый запрос после запуска контейнера) {#cold-start-first-request-after-container-start}

| Инструмент | CPU | GPU | Ускорение |
|------|-----|-----|---------|
| Удаление фона | 22,286ms | 4,792ms | 4.7x |
| Увеличение 2x | 3,957ms | 2,318ms | 1.7x |

OCR не входит в сравнение CUDA. Как встроенный уровень Tesseract, так и необязательные уровни RapidOCR/ONNX используют CPU, в том числе когда у контейнера есть доступ к GPU NVIDIA.

### Проверка работоспособности CUDA {#cuda-health-check}

После первого запроса к ИИ административная конечная точка проверки состояния сообщает статус GPU CUDA:

```
GET /api/v1/admin/health
{"ai": {"gpu": true}}
```

## Docker Compose {#docker-compose}

Полный стек Compose включает приложение, PostgreSQL 17 и Redis 8. Полный `docker-compose.yml` см. в разделе [Развёртывание](/ru/guide/deployment). Минимальный пример:

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

Чтобы включить ускорение NVIDIA CUDA через Docker Compose, добавьте секцию deploy в сервис SnapOtter:

```yaml
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
```

## Фиксация версий {#version-pinning}

| Тег | Описание |
|-----|------------|
| `latest` | Последний выпуск |
| `2.2.0` | Точная версия |
| `2.2` | Последний патч в 2.2.x |
| `2` | Последний минорный выпуск в 2.x |

## Платформы {#platforms}

| Архитектура | Поддержка GPU | Примечания |
|---|---|---|
| linux/amd64 | NVIDIA CUDA | Полное ускорение CUDA для инструментов ИИ |
| linux/arm64 | Только CPU | Raspberry Pi 4/5, Apple Silicon через Docker Desktop |

## Переход со старых тегов {#migration-from-previous-tags}

Если вы использовали тег `:cuda`, переключитесь на `:latest` и оставьте `--gpus all`. Поддержка GPU та же, образ единый.

Ваши данные и настройки сохраняются в томах.