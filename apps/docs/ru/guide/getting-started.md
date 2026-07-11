---
description: "Установите SnapOtter с помощью Docker одной командой. Включает настройку Docker Compose, сборку из исходников и полный обзор функций."
i18n_source_hash: 4536d4558b8e
i18n_provenance: machine
i18n_output_hash: 92434430b233
---

# Начало работы {#getting-started}

::: tip Попробуйте перед установкой
Изучите весь интерфейс на [demo.snapotter.com](https://demo.snapotter.com), без регистрации и установки.
:::

## Быстрый старт {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

Этот единственный контейнер запускает всё необходимое: без установленной `DATABASE_URL` он запускает собственные PostgreSQL и Redis на loopback-интерфейсе (встроенный режим) и хранит все данные в томе `SnapOtter-data`. Это самый быстрый способ попробовать SnapOtter или развернуть на своём homelab. Для продакшена запустите стек [Docker Compose](#docker-compose) ниже, который держит PostgreSQL и Redis в их собственных контейнерах. Встроенный режим работает от имени root (по умолчанию) и автоматически отключается, как только вы установите `DATABASE_URL`.

При первом входе вам будет предложено сменить пароль.

::: tip Анонимная продуктовая аналитика
SnapOtter по умолчанию включает анонимную продуктовую аналитику. Чтобы отключить её, откройте **Settings → System → Privacy** и выключите **Anonymous Product Analytics**. Она останавливается немедленно для всего экземпляра.

Вы также можете установить переменную окружения `SNAPOTTER_TELEMETRY=0` (`false` и `off` тоже работают), чтобы отключить всю телеметрию для экземпляра без пересборки.

Мониторинг ошибок работает на базе [Sentry](https://sentry.io), который спонсирует SnapOtter через свою программу для открытого исходного кода.

Подробнее о том, что собирается, см. [Что собирает SnapOtter](/ru/guide/telemetry).
:::

::: tip Ускорение NVIDIA CUDA
Добавьте `--gpus all` для ускоренных NVIDIA CUDA удаления фона, апскейлинга, OCR, улучшения лиц и реставрации:

```bash
docker run -d --name SnapOtter -p 1349:1349 --gpus all -v SnapOtter-data:/data snapotter/snapotter:latest
```

Требует [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html). Автоматически переходит на CPU, когда CUDA недоступна. Ускорение через iGPU Intel/AMD посредством VA-API, Quick Sync или OpenCL для ИИ-инференса сегодня не поддерживается. См. [Docker Tags](/ru/guide/docker-tags) для бенчмарков.
:::

::: details Также на GHCR
```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data ghcr.io/snapotter-hq/snapotter:latest
```

Оба реестра публикуют один и тот же образ при каждом релизе.
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

## Сборка из исходников {#build-from-source}

**Предварительные требования:** Node.js 22+, pnpm 9+, Docker (для Postgres + Redis), Python 3.10+ (для функций ИИ), Git.

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker-compose.dev.yml up -d   # start Postgres + Redis
pnpm install
pnpm dev
```

- Фронтенд: [http://localhost:1349](http://localhost:1349)
- Бэкенд: [http://localhost:13490](http://localhost:13490)

## Что вы можете делать {#what-you-can-do}

### Обработка файлов (200+ инструментов) {#file-processing-200-tools}

| Модальность | Количество | Примеры инструментов |
|----------|-------|---------------|
| **Изображения** | 105 | Изменение размера, Обрезка, Сжатие, Конвертация, Удаление фона, Апскейл, OCR, Водяной знак, Коллаж, Раскрашивание, Инструменты GIF, пресеты форматов |
| **Видео** | 57 | Обрезка, Кадрирование, Сжатие, Конвертация, Объединение, Извлечение аудио, Авто-субтитры, Видео в GIF, Изменение размера, Стабилизация, пресеты форматов |
| **Аудио** | 27 | Обрезка, Объединение, Конвертация, Нормализация, Шумоподавление, Транскрипция, Сдвиг высоты тона, Затухание, Создание рингтона, пресеты форматов |
| **PDF / Документы** | 42 | Объединение, Разделение, Сжатие, OCR, Водяной знак, Редактирование, Word в PDF, Excel в PDF, Поворот, Защита, Восстановление |
| **Файлы** | 10 | CSV в JSON, JSON в XML, Объединение CSV, Разделение CSV, Создание ZIP, Извлечение ZIP, Создание диаграмм, YAML/JSON |

### Конвейеры {#pipelines}

Объединяйте инструменты в многошаговые рабочие процессы и применяйте их к одному изображению или целому пакету:

1. Откройте **Pipelines** в боковой панели.
2. Добавьте шаги (любой инструмент, любые настройки).
3. Запустите на одном файле или на целом пакете сразу.
4. Сохраните конвейер для повторного использования.

Конвейеры допускают 20 шагов по умолчанию. Установите `MAX_PIPELINE_STEPS=0`, чтобы сделать лимит неограниченным.

### Библиотека файлов {#file-library}

Каждый обработанный вами файл может быть сохранён в вашу библиотеку **Files**. SnapOtter отслеживает полную историю версий, поэтому вы можете проследить каждый шаг обработки от исходной загрузки до финального результата.

Сохранение явное: результаты, которые вы сохраняете в библиотеку, хранятся, пока вы их не удалите, а результаты, которые вы обрабатываете и оставляете несохранёнными, автоматически очищаются через 72 часа (настраивается через `FILE_MAX_AGE_HOURS`).

### REST API и API-ключи {#rest-api-api-keys}

Каждый инструмент доступен по HTTP:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_<your-api-key>" \
  -F "file=@photo.jpg" \
  -F 'settings={"width":800,"height":600,"fit":"cover"}'
```

Создавайте API-ключи в разделе **Settings → API Keys**. См. [справочник REST API](/ru/api/rest) для всех эндпоинтов или откройте [http://localhost:1349/api/docs](http://localhost:1349/api/docs) для интерактивного справочника.

### Мультипользовательский режим и команды {#multi-user-teams}

Включите несколько пользователей с управлением доступом на основе ролей:

- **Admin**: полный доступ, управление пользователями, командами, настройками, всеми файлами/конвейерами/API-ключами
- **User**: использование инструментов, управление своими файлами/конвейерами/API-ключами

Создавайте команды в разделе **Settings → Teams** для группировки пользователей.

Установите `AUTH_ENABLED=true` (или `false` для однопользовательского/личного использования без входа).
