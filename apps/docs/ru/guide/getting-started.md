---
description: "Установите SnapOtter с помощью Docker одной командой. Включает настройку Docker Compose, сборку из исходного кода и полный обзор возможностей."
i18n_source_hash: d2366a2e051c
i18n_provenance: human
i18n_output_hash: 33c9f2492b7b
---

# Начало работы {#getting-started}

::: tip Попробуйте перед установкой
Изучите полный интерфейс на [demo.snapotter.com](https://demo.snapotter.com) - без регистрации и установки.
:::

## Быстрый старт {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

Этот единый контейнер запускает всё необходимое: без заданного `DATABASE_URL` он запускает собственные PostgreSQL и Redis на интерфейсе loopback (встроенный режим) и хранит все данные в томе `SnapOtter-data`. Это самый быстрый способ попробовать SnapOtter или развернуть его самостоятельно на домашнем сервере. Для продакшена используйте стек [Docker Compose](#docker-compose) ниже, который держит PostgreSQL и Redis в собственных контейнерах. Встроенный режим работает от root (по умолчанию) и автоматически отключается, как только вы задаёте `DATABASE_URL`.

При первом входе вам будет предложено сменить пароль.

::: tip Анонимная продуктовая аналитика
SnapOtter по умолчанию включает анонимную продуктовую аналитику. Чтобы отключить её, откройте **Settings → System → Privacy** и выключите **Anonymous Product Analytics**. Сбор данных немедленно прекратится для всего экземпляра.

Подробнее о том, что собирается, см. [Что собирает SnapOtter](/ru/guide/telemetry).
:::

::: tip Ускорение NVIDIA CUDA
Добавьте `--gpus all` для ускоренного через NVIDIA CUDA удаления фона, увеличения, OCR, улучшения лиц и восстановления:

```bash
docker run -d --name SnapOtter -p 1349:1349 --gpus all -v SnapOtter-data:/data snapotter/snapotter:latest
```

Требуется [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html). Автоматически переходит на CPU, когда CUDA недоступна. Ускорение через интегрированные GPU Intel/AMD посредством VA-API, Quick Sync или OpenCL сегодня не поддерживается для инференса ИИ. См. [Теги Docker](/ru/guide/docker-tags) для тестов производительности.
:::

::: details Также на GHCR
```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data ghcr.io/snapotter-hq/snapotter:latest
```

Обе реестра публикуют один и тот же образ при каждом релизе.
:::

## Docker Compose {#docker-compose}

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest  # or ghcr.io/snapotter-hq/snapotter:latest
    ports:
      - "1349:1349"
    volumes:
      - SnapOtter-data:/data
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
  SnapOtter-pgdata:
  SnapOtter-redisdata:
```

См. [Конфигурация](/ru/guide/configuration) для всех переменных окружения.

## Сборка из исходного кода {#build-from-source}

**Требования:** Node.js 22+, pnpm 9+, Docker (для Postgres + Redis), Python 3.10+ (для функций ИИ), Git.

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker-compose.dev.yml up -d   # start Postgres + Redis
pnpm install
pnpm dev
```

- Frontend: [http://localhost:1349](http://localhost:1349)
- Backend: [http://localhost:13490](http://localhost:13490)

## Что вы можете делать {#what-you-can-do}

### Обработка файлов (241 инструмент) {#file-processing-241-tools}

| Модальность | Количество | Примеры инструментов |
|----------|-------|---------------|
| **Image** | 105 | Изменение размера, обрезка, сжатие, конвертация, удаление фона, увеличение, OCR, водяные знаки, коллаж, раскрашивание, инструменты GIF, пресеты форматов |
| **Video** | 57 | Обрезка по времени, кадрирование, сжатие, конвертация, объединение, извлечение аудио, автосубтитры, видео в GIF, изменение размера, стабилизация, пресеты форматов |
| **Audio** | 27 | Обрезка, объединение, конвертация, нормализация, шумоподавление, транскрипция, изменение высоты тона, затухание, создание рингтонов, пресеты форматов |
| **PDF / Document** | 42 | Объединение, разделение, сжатие, OCR, водяные знаки, редактирование, Word в PDF, Excel в PDF, поворот, защита, восстановление |
| **Files** | 10 | CSV в JSON, JSON в XML, объединение CSV, разделение CSV, создание ZIP, извлечение ZIP, создание диаграмм, YAML/JSON |

### Конвейеры {#pipelines}

Объединяйте инструменты в многошаговые рабочие процессы и применяйте их к одному изображению или целому пакету:

1. Откройте **Pipelines** в боковой панели.
2. Добавьте шаги (любой инструмент, любые настройки).
3. Запустите для одного файла - или для целого пакета сразу.
4. Сохраните конвейер для повторного использования позже.

Конвейеры по умолчанию допускают 20 шагов. Задайте `MAX_PIPELINE_STEPS=0`, чтобы сделать лимит неограниченным.

### Библиотека файлов {#file-library}

Каждый обработанный вами файл можно сохранить в вашу библиотеку **Files**. SnapOtter отслеживает полную историю версий, поэтому вы можете проследить каждый шаг обработки от исходной загрузки до финального результата.

Сохранение выполняется явно: результаты, которые вы сохраняете в библиотеку, хранятся до тех пор, пока вы их не удалите, а результаты, которые вы обработали и оставили несохранёнными, автоматически очищаются через 72 часа (настраивается через `FILE_MAX_AGE_HOURS`).

### REST API и ключи API {#rest-api-api-keys}

Каждый инструмент доступен через HTTP:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_<your-api-key>" \
  -F "file=@photo.jpg" \
  -F 'settings={"width":800,"height":600,"fit":"cover"}'
```

Создавайте ключи API в **Settings → API Keys**. См. [справочник REST API](/ru/api/rest) для всех конечных точек или посетите [http://localhost:1349/api/docs](http://localhost:1349/api/docs) для интерактивного справочника.

### Многопользовательский режим и команды {#multi-user-teams}

Включите несколько пользователей с управлением доступом на основе ролей:

- **Admin**: полный доступ - управление пользователями, командами, настройками, всеми файлами/конвейерами/ключами API
- **User**: использование инструментов, управление собственными файлами/конвейерами/ключами API

Создавайте команды в **Settings → Teams**, чтобы группировать пользователей.

Задайте `AUTH_ENABLED=true` (или `false` для однопользовательского/личного использования без входа).
