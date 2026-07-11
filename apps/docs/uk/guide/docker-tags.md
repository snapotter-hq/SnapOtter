---
description: "Теги Docker-образу SnapOtter, тести продуктивності GPU, закріплення версій і мультиплатформна підтримка для AMD64 та ARM64."
i18n_source_hash: 148b3608e11a
i18n_provenance: human
i18n_output_hash: 8d481651c9cb
---

# Docker-образ {#docker-image}

SnapOtter постачається як єдиний Docker-образ. Запустіть його окремо, і він запустить вбудовані PostgreSQL 17 та Redis на інтерфейсі loopback (вбудований режим); для промислового використання запускайте його поряд з окремими контейнерами PostgreSQL 17 та Redis 8 за допомогою Compose. Образ застосунку працює на всіх платформах.

## Швидкий старт {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

Без встановленого `DATABASE_URL` це запускається у вбудованому режимі: PostgreSQL та Redis стартують усередині контейнера на loopback, а всі дані зберігаються в томі `SnapOtter-data`. Встановіть `DATABASE_URL` та `REDIS_URL` (як це робить стек [Compose](#docker-compose)), щоб натомість використовувати зовнішні сервіси. Див. [Налаштування](/uk/guide/configuration#embedded-mode).

## Прискорення NVIDIA CUDA {#nvidia-cuda-acceleration}

Образ включає підтримку NVIDIA CUDA на amd64. Якщо у вас є GPU NVIDIA зі встановленим [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html), додайте `--gpus all`:

```bash
docker run -d --name SnapOtter --gpus all -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

Образ автоматично виявляє CUDA під час виконання. Без `--gpus all` або коли CUDA недоступна, інструменти AI працюють на CPU. Образ той самий в обох випадках.

Прискорення iGPU Intel/AMD через VA-API, Quick Sync чи OpenCL наразі не підтримується для AI-інференсу SnapOtter. Прокидання `/dev/dri` у контейнер може відкрити доступ до render-пристрою, але AI-середовище виконання все одно використовуватиме CPU, доки CUDA недоступна.

### Тести продуктивності {#benchmarks}

Протестовано на NVIDIA RTX 4070 (12 ГБ VRAM) з портретним JPEG 572x1024.

#### Продуктивність у прогрітому стані {#warm-performance}

| Інструмент | CPU | GPU | Прискорення |
|------|-----|-----|---------|
| Видалення фону (u2net) | 2415 мс | 879 мс | 2.7x |
| Видалення фону (isnet) | 2457 мс | 1137 мс | 2.2x |
| Збільшення 2x | 350 мс | 309 мс | 1.1x |
| Збільшення 4x | 910 мс | 310 мс | 2.9x |
| OCR (PaddleOCR) | 137 мс | 94 мс | 1.5x |
| Розмиття облич | 139 мс | 122 мс | 1.1x |

#### Холодний старт (перший запит після запуску контейнера) {#cold-start-first-request-after-container-start}

| Інструмент | CPU | GPU | Прискорення |
|------|-----|-----|---------|
| Видалення фону | 22286 мс | 4792 мс | 4.7x |
| Збільшення 2x | 3957 мс | 2318 мс | 1.7x |
| OCR (PaddleOCR) | 1469 мс | 1090 мс | 1.3x |

### Перевірка стану CUDA {#cuda-health-check}

Після першого AI-запиту адміністративний ендпоінт стану звітує про статус GPU CUDA:

```
GET /api/v1/admin/health
{"ai": {"gpu": true}}
```

## Docker Compose {#docker-compose}

Повний стек Compose включає застосунок, PostgreSQL 17 та Redis 8. Див. [Розгортання](/uk/guide/deployment) для повного `docker-compose.yml`. Мінімальний приклад:

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

## Закріплення версій {#version-pinning}

| Тег | Опис |
|-----|------------|
| `latest` | Останній випуск |
| `1.11.0` | Точна версія |
| `1.11` | Останній патч у 1.11.x |
| `1` | Останній мінорний у 1.x |

## Платформи {#platforms}

| Архітектура | Підтримка GPU | Примітки |
|---|---|---|
| linux/amd64 | NVIDIA CUDA | Повне прискорення CUDA для AI-інструментів |
| linux/arm64 | Лише CPU | Raspberry Pi 4/5, Apple Silicon через Docker Desktop |

## Міграція з попередніх тегів {#migration-from-previous-tags}

Якщо ви використовували тег `:cuda`, перейдіть на `:latest` і залиште `--gpus all`. Та сама підтримка GPU, уніфікований образ.

Ваші дані та налаштування зберігаються в томах.
