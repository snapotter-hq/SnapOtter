---
description: "Теги образів Docker для SnapOtter, GPU-бенчмарки, фіксація версій і підтримка кількох платформ для AMD64 та ARM64."
i18n_source_hash: a5871d76250c
i18n_provenance: machine
i18n_output_hash: 584f7fd79fdb
i18n_hash_version: 2
---

# Docker Image {#docker-image}

SnapOtter постачається як єдиний образ Docker. Запущений окремо, він стартує вбудовані PostgreSQL 17 і Redis на інтерфейсі loopback (вбудований режим); для production запускайте його разом з окремими контейнерами PostgreSQL 17 і Redis 8 через Compose. Образ застосунку працює на всіх платформах.

## Швидкий старт {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

Якщо `DATABASE_URL` не задано, застосунок працює у вбудованому режимі: PostgreSQL і Redis стартують всередині контейнера на loopback, а всі дані зберігаються в томі `SnapOtter-data`. Задайте `DATABASE_URL` і `REDIS_URL` (як це робить стек [Compose](#docker-compose)), щоб натомість використовувати зовнішні сервіси. Див. [Конфігурація](/uk/guide/configuration#embedded-mode).

## Прискорення NVIDIA CUDA {#nvidia-cuda-acceleration}

Образ містить підтримку NVIDIA CUDA на amd64. Якщо у вас є GPU NVIDIA і встановлено [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html), додайте `--gpus all`:

```bash
docker run -d --name SnapOtter --gpus all -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

Образ автоматично виявляє CUDA під час роботи. Без `--gpus all` або якщо CUDA недоступна, AI-інструменти працюють на CPU. Образ той самий в обох випадках.

Прискорення на інтегрованих GPU Intel/AMD через VA-API, Quick Sync або OpenCL для AI-інференсу SnapOtter наразі не підтримується. Прокидання `/dev/dri` у контейнер може відкрити пристрій рендерингу, але AI-рантайм усе одно використовуватиме CPU, якщо CUDA недоступна.

### Бенчмарки {#benchmarks}

Тестування на NVIDIA RTX 4070 (12 ГБ VRAM) з портретним JPEG 572x1024.

#### Продуктивність після прогріву {#warm-performance}

| Інструмент | CPU | GPU | Прискорення |
|------|-----|-----|---------|
| Видалення фону (u2net) | 2,415 мс | 879 мс | 2,7x |
| Видалення фону (isnet) | 2,457 мс | 1,137 мс | 2,2x |
| Збільшення 2x | 350 мс | 309 мс | 1,1x |
| Збільшення 4x | 910 мс | 310 мс | 2,9x |
| Розмиття облич | 139 мс | 122 мс | 1,1x |

#### Холодний старт (перший запит після запуску контейнера) {#cold-start-first-request-after-container-start}

| Інструмент | CPU | GPU | Прискорення |
|------|-----|-----|---------|
| Видалення фону | 22,286 мс | 4,792 мс | 4,7x |
| Збільшення 2x | 3,957 мс | 2,318 мс | 1,7x |

OCR не включено до порівняння CUDA. Як вбудований рівень Tesseract, так і необов'язкові рівні RapidOCR/ONNX використовують CPU, зокрема й тоді, коли контейнер має доступ до GPU NVIDIA.

### Перевірка стану CUDA {#cuda-health-check}

Після першого AI-запиту адміністративна кінцева точка перевірки стану повідомляє статус GPU CUDA:

```
GET /api/v1/admin/health
{"ai": {"gpu": true}}
```

## Docker Compose {#docker-compose}

Повний стек Compose містить застосунок, PostgreSQL 17 і Redis 8. Повний `docker-compose.yml` див. у розділі [Розгортання](/uk/guide/deployment). Мінімальний приклад:

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

Для прискорення NVIDIA CUDA через Docker Compose додайте секцію deploy до сервісу SnapOtter:

```yaml
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
```

## Фіксація версій {#version-pinning}

| Тег | Опис |
|-----|------------|
| `latest` | Останній реліз |
| `2.2.0` | Точна версія |
| `2.2` | Останній патч у 2.2.x |
| `2` | Остання мінорна версія в 2.x |

## Платформи {#platforms}

| Архітектура | Підтримка GPU | Примітки |
|---|---|---|
| linux/amd64 | NVIDIA CUDA | Повне прискорення CUDA для AI-інструментів |
| linux/arm64 | Лише CPU | Raspberry Pi 4/5, Apple Silicon через Docker Desktop |

## Міграція з попередніх тегів {#migration-from-previous-tags}

Якщо ви використовували тег `:cuda`, перейдіть на `:latest` і залиште `--gpus all`. Та сама підтримка GPU, єдиний образ.

Ваші дані та налаштування зберігаються в томах.
