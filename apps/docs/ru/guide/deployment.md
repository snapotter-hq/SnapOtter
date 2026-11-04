---
description: "Развёртывание SnapOtter в продакшене с Docker. Требования к оборудованию, настройка GPU и конфигурации обратного прокси для Nginx, Traefik и Cloudflare."
i18n_source_hash: b8c4ed2cc086
i18n_provenance: machine
i18n_output_hash: e20b58795324
i18n_hash_version: 2
---

# Развёртывание {#deployment}

SnapOtter развёртывается как стек Docker Compose из трёх контейнеров: образ приложения SnapOtter, PostgreSQL 17 и Redis 8. Образ приложения поддерживает **linux/amd64** (с NVIDIA CUDA для ускорения ИИ) и **linux/arm64** (CPU), поэтому он работает нативно на серверах Intel/AMD, компьютерах Mac с Apple Silicon и устройствах ARM, таких как Raspberry Pi 4/5. Ускорение на встроенных GPU Intel/AMD через VA-API, Quick Sync или OpenCL для ИИ-вывода сейчас не поддерживается.

Настройку GPU, примеры Docker Compose и фиксацию версий см. в разделе [Образ Docker](./docker-tags).

## Быстрый старт (CPU) {#quick-start-cpu}

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

После этого приложение доступно по адресу `http://localhost:1349`.

Приведённый выше стек подключается как владелец базы данных. Начиная с SnapOtter 2.3.0 запросы можно обслуживать от роли, которая только читает и записывает строки; см. [Роли с минимальными привилегиями](./database#least-privilege-roles).

> **Ограничения Docker Hub?** Замените `snapotter/snapotter:latest` на `ghcr.io/snapotter-hq/snapotter:latest`, чтобы загружать образ из GitHub Container Registry. Оба реестра получают один и тот же образ при каждом выпуске.

## Быстрый старт (NVIDIA CUDA) {#quick-start-nvidia-cuda}

Для ускорения NVIDIA CUDA в поддерживаемых инструментах ИИ (удаление фона, увеличение, улучшение лиц):

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

### Проверка ускорения GPU {#verify-gpu-acceleration}

Проверьте определение CUDA в журналах:

```bash
docker logs SnapOtter 2>&1 | head -20
# Look for: [gpu] CUDA available via torch
```

Если инструменты ИИ работают на CPU, хотя `--gpus all` и NVIDIA Container Toolkit настроены правильно, переустановите затронутый пакет (например, «Удаление фона») в разделе **Настройки → Функции ИИ**. Установщик восстанавливает GPU-сборку ONNX Runtime, которую иначе может затенять CPU-сборка, подтянутая другим пакетом (например, транскрибацией) в общем окружении ИИ. Если переустановка через интерфейс не восстанавливает GPU на более старом образе, см. ручное исправление в [issue #490](https://github.com/snapotter-hq/SnapOtter/issues/490).

## Требования к оборудованию {#hardware-requirements}

Эти цифры получены в тестах на разных системах, от современной рабочей станции amd64 с NVIDIA RTX 4070 до Raspberry Pi: на каждой запускался весь каталог инструментов, а ограничения ресурсов Docker перебирались, чтобы найти реальный нижний предел.

Работаете на нижней границе этих уровней (Pi, старый ноутбук, VPS с 2 ГБ)? В разделе [Настройки для слабого оборудования](/ru/guide/low-resource) эти цифры превращены в конкретное руководство с настроенными ограничениями.

### Краткая справка {#quick-reference}

| Уровень | Сценарий | CPU | ОЗУ | GPU | Хранилище |
|------|----------|-----|-----|-----|---------|
| Минимальный | Инструменты без ИИ (изображения, файлы, лёгкие операции с PDF), а также встроенный быстрый OCR и распознавание лиц; один пользователь; небольшие пакеты | 2 ядра | 2 ГБ | Нет | ~7 ГБ |
| Рекомендуемый | Все пять модальностей, включая видео, PDF и стандартные пакеты ИИ на CPU; пакетная обработка; несколько пользователей | 4 ядра | 4 ГБ (8 ГБ для HQ-дорисовки) | Нет | ~25 ГБ |
| Полный | Всё на полной скорости, включая ИИ на GPU; крупные пакеты; много пользователей | 6-8 ядер | 8 ГБ | NVIDIA с 8+ ГБ VRAM (комфортно 12 ГБ) | ~35 ГБ |

**Архитектура: только 64-разрядная** (`linux/amd64` или `linux/arm64`). SnapOtter работает нативно на серверах Intel/AMD, компьютерах Mac с Apple Silicon и 64-разрядных платах ARM, включая **Raspberry Pi 4 и 5** (4-8 ГБ). Он **не** работает на 32-разрядной ARM (`armv7`/`armhf`), поскольку образ для неё не собирается, а также на платах класса 512 МБ, таких как Pi Zero, которым не хватает минимального объёма памяти (см. ниже).

### Минимальный (изображения, файлы и лёгкие инструменты PDF; без ИИ) {#minimum-image-files-and-light-pdf-tools-no-ai}

| Ресурс | Требование |
|---|---|
| CPU | 2 ядра |
| ОЗУ | 2 ГБ |
| Диск | ~5.5 ГБ (образ) + том данных |
| GPU | Не требуется |

Все 222 инструмента каталога без ИИ: изображения (изменение размера, обрезка, конвертация, сжатие, коррекция, водяной знак), видео (обрезка, отключение звука, смена контейнера), аудио (конвертация, нормализация, обрезка), PDF (объединение, разделение, сжатие, поворот, защита), конвертации файлов и специальные пресеты конвертации, работают на скромном оборудовании. Большинство операций завершается значительно быстрее секунды даже на крупном файле: изображение 2.7 МБ масштабируется за ~0.05 с и перекодируется в WebP за ~2 с.

Нижний предел памяти реален, это подтверждает перебор ограничений ресурсов Docker: **512 МБ недостаточно для запуска стека** (даже одно изменение размера изображения завершается принудительно), **1 ГБ** справляется с операциями над одним файлом, но пакет из нескольких файлов исчерпывает память, а **2 ГБ / 2 ядра**: наименьшая конфигурация, которая комфортно обрабатывает пакеты без ИИ. Встроенный быстрый OCR и пакет `face-detection` тоже помещаются в 2 ГБ, тогда как более крупным пакетам ИИ (Whisper, LaMa/DDColor, rembg, RealESRGAN, восстановление фотографий и HQ-дорисовка SD1.5) нужно от 4 до 8 ГБ ОЗУ, и их запуск отклоняется заранее, если свободной памяти меньше нижнего предела пакета.

```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2G
```

**Единственное исключение с высокой нагрузкой на CPU: перекодирование видео.** Операции без перекодирования (обрезка, отключение звука, смена контейнера) мгновенны, но транскодирование в другой кодек упирается в CPU. Клип 1080p длительностью 45 секунд, перекодированный в VP9 (WebM), занимает примерно **~40 с** на быстром современном CPU, ~45 с на Apple Silicon, ~80 с на старом мобильном 4-ядерном процессоре и **~130 с** на старом 4-ядерном сервере. Если ваша нагрузка в основном связана с видео, отдавайте приоритет ядрам CPU и тактовой частоте или увеличьте предел `cpus:` контейнера: поставляемый compose по умолчанию ограничивает приложение 4 ядрами (8 в compose для GPU).

### Рекомендуемый (инструменты ИИ на CPU) {#recommended-ai-tools-on-cpu}

| Ресурс | Требование |
|---|---|
| CPU | 4 ядра |
| ОЗУ | 4 ГБ |
| Диск | 3 ГБ (образ) + около 20 ГБ (все необязательные пакеты ИИ) + рабочее пространство |
| GPU | Не требуется (откат на CPU) |

**Установка и запуск более крупных пакетов ИИ и есть причина рекомендации в 4 ГБ ОЗУ.** Без установленных необязательных пакетов приложение в простое занимает около 360 МБ. Устаревшие инструменты Python делят один сайдкар, а точный OCR использует отдельный долгоживущий диспетчер, привязанный к активному неизменяемому поколению. Перед активацией установщик запускает смоук-тест кандидата. Затем он атомарно переключается на новый диспетчер и освобождает предыдущий диспетчер перед сборкой мусора. Каждый официальный артефакт точного OCR обязан пройти свой набор проверок для худшего случая в cgroup на 4 ГиБ, а рекомендация в 4 ГБ для хоста оставляет запас для приложения Node.js, Postgres, Redis, очередей и параллельной работы.

Большинство инструментов ИИ вполне пригодны на CPU; паре из них действительно нужен GPU. Измерения на современном 4-ядерном CPU:

| Инструмент ИИ | Время на CPU | Пригоден на CPU? |
|---|---|---|
| Распознавание лиц (blur-faces, smart-crop, red-eye), noise-removal | менее 1 с | Да |
| OCR, транскрибация, субтитры | 1-3 с | Да |
| Раскрашивание, улучшение лиц | ~10 с | Да |
| Удаление, замена и размытие фона | ~29 с | Да (придётся подождать) |
| Увеличение ИИ (RealESRGAN) | ~33 с для небольших; минуты для крупных изображений | Условно: настоятельно рекомендуется GPU |
| Восстановление фотографий (полный конвейер) | несколько минут | Нет: нужен GPU или быстрый многоядерный CPU |

SnapOtter намеренно не включает эти загрузки моделей в образ Docker. Пакеты ИИ загружаются только тогда, когда администратор включает соответствующий инструмент, хранятся в постоянном томе `/data/ai` и используются всеми инструментами, зависящими от одного и того же набора моделей. Благодаря этому итоговый образ контейнера остаётся небольшим, но полная установка ИИ всё равно достигает больших объёмов хранилища, указанных ниже.

Некоторые инструменты зависят более чем от одного общего пакета. Например, для «Фото на документы» нужны и `background-removal`, и `face-detection`; если `background-removal` уже установлен, при включении «Фото на документы» загружается только недостающий пакет `face-detection`. То же повторное использование действует для всех инструментов ИИ.

Объём хранилища и нижние пределы памяти CPU для необязательных пакетов ИИ (SnapOtter проверяет доступную память перед передачей задачи в Python-сайдкар и сразу отклоняет запуски ниже предела свободной памяти пакета):

| Пакет | Размер на диске | Нижний предел памяти CPU |
|---|---|---|
| Распознавание лиц | 200-300 МБ | 2 ГБ ОЗУ хоста (~0.5 ГБ свободно) |
| Транскрибация | ~600 МБ | 4 ГБ ОЗУ хоста (~2 ГБ свободно) |
| Удаление объектов + раскрашивание | 1-2 ГБ | 4 ГБ ОЗУ хоста (~2 ГБ свободно) |
| Точный OCR (`balanced`/`best`) | ~208-234 МиБ загрузка / ~409-488 МиБ после установки | 4 ГиБ настроенной эффективной памяти (`fast` работает на 2 ГБ) |
| Удаление фона | 4-5 ГБ | 4 ГБ ОЗУ хоста (~2.5 ГБ свободно) |
| Увеличение + улучшение лиц + шумоподавление | 5-6 ГБ | 4 ГБ ОЗУ хоста (~2.5 ГБ свободно) |
| Восстановление фотографий | 4-5 ГБ | 4 ГБ ОЗУ хоста (~3 ГБ свободно) |
| Высококачественная дорисовка (`inpaint-hq`) | 5-7 ГБ | 8 ГБ ОЗУ хоста (~6 ГБ свободно) |
| **Все пакеты** | **~25 ГБ после установки** | **4 ГБ (8 ГБ с `inpaint-hq`)** |

Быстрый OCR встроен в образ через Tesseract, добавляет около 25 МиБ и не требует необязательного пакета OCR и его 4 ГиБ памяти. Быстрый режим поддерживает `auto`, `en`, `de`, `es`, `fr`, `zh` и `ja`, но не корейский (`ko`) и не арабский (`ar`). Оба используют `balanced` или `best`, поэтому требуют точного пакета. Точный пакет доступен в официальных контейнерах Linux amd64 и arm64 и запускает ONNX Runtime на CPU. Хосты NVIDIA используют ту же среду выполнения OCR на CPU, поэтому OCR не зависит от версии CUDA или архитектуры GPU. Точной среде выполнения требуется не менее 4 ГиБ эффективной памяти: настроенный предел cgroup контейнера, а при его отсутствии память хоста. SnapOtter отклоняет системы ниже этого подписанного минимума совместимости до загрузки пакета. Установка точного пакета также отклоняется на bare-metal и готовых архивах, для которых нельзя гарантировать libc и ABI Python. На этих неподдерживаемых хостах OCR для корейского и арабского возвращает явную ошибку несовместимости и никогда незаметно не переключается на быстрый режим.

Реплики, использующие один и тот же `DATA_DIR`, должны иметь одинаковую архитектуру CPU; для развёртываний с несколькими репликами используйте node affinity. Смешанным репликам amd64/arm64 нужны отдельные тома данных и независимые развёртывания SnapOtter.

Точная среда выполнения хранит одно активное поколение и очищает кэш загрузки после активации. Для этого выпуска первой установке временно требуется примерно 620-720 МиБ для архива и промежуточных файлов, а при обновлении пик может приближаться к 1.2 ГиБ, пока старое поколение остаётся активным. Установщик вычисляет точное требование по подписанному индексу и текущим поколениям до загрузки или распаковки и завершается раньше, если том данных слишком мал.

```yaml
deploy:
  resources:
    limits:
      cpus: '4'
      memory: 4G
```

### Полный (инструменты ИИ на NVIDIA CUDA) {#full-ai-tools-on-nvidia-cuda}

| Ресурс | Требование |
|---|---|
| CPU | 6-8 ядер (подготовка видео и параллелизм выполняются на CPU даже при ИИ на GPU) |
| ОЗУ | 8 ГБ |
| GPU | NVIDIA с 8+ ГБ VRAM (рекомендуется 12 ГБ) |
| Диск | ~35 ГБ всего |

GPU NVIDIA (CUDA) резко ускоряет тяжёлые модели ИИ. Измерения на RTX 4070 в сравнении с современным CPU:

| Инструмент ИИ | Ускорение на GPU | Примечания |
|---|---|---|
| Увеличение ИИ (RealESRGAN 2×) | **~47×** | Самый большой выигрыш: менее секунды против ~33 с (минуты на крупных изображениях) |
| Улучшение лиц (CodeFormer) | **~12×** | ~0.9 с против ~11 с |
| Транскрибация (Whisper) | ~4.5× | |
| Удаление, замена и размытие фона | ~4× | ~7 с на GPU против ~29 с на CPU |
| Раскрашивание | ~1.8× | |
| OCR, распознавание лиц, красные глаза, шумоподавление | ~1× | Уже быстро на CPU, GPU не помогает |
| Восстановление фотографий | нет | Упирается в CPU даже на GPU (0% загрузки GPU); быстрый CPU важнее GPU |

GPU оправдан для **увеличения, улучшения лиц, транскрибации и удаления фона**. Распознавание лиц, OCR и удаление красных глаз упираются в CPU и уже работают быстро, поэтому GPU ничего не добавляет.

Пиковое использование VRAM достигает 7.5 ГБ при увеличении с улучшением лиц. GPU NVIDIA на 6 ГБ подходит для большинства инструментов ИИ по отдельности, но не справится с увеличением. 8-12 ГБ VRAM справляются со всем.

Ускорение на встроенных GPU Intel/AMD через VA-API, Quick Sync или OpenCL для ИИ-вывода сейчас не поддерживается. Проброс `/dev/dri` в контейнер не включает ускорение ИИ на GPU; SnapOtter будет запускать инструменты ИИ на CPU, пока недоступна NVIDIA CUDA.

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

### Параллельные пользователи {#concurrent-users}

Параллельные запросы на изменение размера изображений к контейнеру приложения с ограничением по умолчанию в 4 ядра:

| Параллельных запросов | Среднее время ответа | Ошибок |
|---|---|---|
| 1 | 0.4s | 0 |
| 5 | 1.2s | 0 |
| 10 | 2.1s | 0 |

Время ответа растёт сублинейно, без ошибок, по мере насыщения пула воркеров. Увеличение предела `cpus:` контейнера приложения (или использование хоста с большим числом ядер) поднимает потолок. Учтите, что тяжёлые задачи (транскодирование видео, ИИ на CPU) занимают воркер на всё время выполнения, поэтому рассчитывайте CPU по ожидаемому числу параллельных тяжёлых задач, а не только по числу запросов.

### Поддерживаемые форматы изображений {#supported-image-formats}

SnapOtter поддерживает **55+ входных форматов** и **14 выходных форматов**, включая файлы RAW от 20+ производителей камер, профессиональные форматы (PSD, EPS, OpenEXR, HDR), современные кодеки (JPEG XL, AVIF, HEIC, QOI) и научные и игровые форматы (FITS, DDS).

Подробности о каждом поддерживаемом формате, используемом декодере и доступных параметрах качества см. в [полном списке форматов](/ru/guide/supported-formats).

### Известные ограничения {#known-limitations}

- **Масштабирование с учётом содержимого** аварийно завершается на больших изображениях (>5 Мпикс) из-за ограничения бинарного файла caire. С изображениями меньшего размера работает нормально.
- **Декодирование HEIF** занимает 13-23 секунды. HEIC (вариант Apple) заметно быстрее: 0.3-0.9 секунды.
- **Увеличение** на CPU завершается по тайм-ауту для всего, кроме небольших изображений. Для практического использования нужен GPU.
- Улучшение лиц **CodeFormer** заметно медленнее GFPGAN (53 с против 2 с на GPU). Для большинства случаев рекомендуется GFPGAN.

## Тома {#volumes}

| Точка монтирования / том | Назначение | Обязательно? |
|---|---|---|
| `/data` (app) | Модели ИИ, виртуальное окружение Python, файлы пользователей | **Да**, без него файлы будут потеряны |
| `/tmp/workspace` (app) | Временные файлы обработки (очищаются автоматически) | Рекомендуется |
| `SnapOtter-pgdata` (postgres) | Каталог данных PostgreSQL (пользователи, настройки, конвейеры, задачи) | **Да**, без него данные будут потеряны |
| `SnapOtter-redisdata` (redis) | Файл Redis append-only для устойчивых очередей задач | Рекомендуется |

### Монтирование каталогов и именованные тома {#bind-mounts-vs-named-volumes}

**Именованные тома** (рекомендуется): Docker управляет правами доступа автоматически:
```yaml
volumes:
  - SnapOtter-data:/data
```

**Монтирование каталогов хоста**: права доступа вы настраиваете сами. Задайте `PUID`/`PGID` в соответствии с пользователем вашего хоста:
```yaml
volumes:
  - ./SnapOtter-data:/data
environment:
  - PUID=1000    # Your host UID (run: id -u)
  - PGID=1000    # Your host GID (run: id -g)
```

### Права доступа к хранилищу {#storage-permissions}

Во время работы SnapOtter записывает данные в два места: `/data` (файлы пользователей, журналы, модели ИИ и виртуальное окружение Python) и `/tmp/workspace` (временное рабочее пространство обработки). Оба должны быть доступны для записи пользователю, от имени которого работает контейнер. Если это не так, контейнер **завершается сразу при запуске** с сообщением, где указан каталог, текущие UID/GID и способ исправления, вместо того чтобы стартовать «здоровым», а затем падать при первой загрузке с неясной ошибкой. Каталог журналов (`LOG_DIR`, `/data/logs` в образе) проверяется так же, в любом режиме хранения, поскольку журналы остаются локальными, даже когда файлы лежат в S3.

Как обрабатываются права доступа, зависит от способа запуска контейнера:

**По умолчанию (стартует от root, затем переходит к `snapotter`)**: точка входа стартует от root, исправляет владельца смонтированных томов, затем переходит к непривилегированному пользователю `snapotter` через `gosu`. Именованные тома работают без настройки. Для монтирования каталогов хоста задайте `PUID`/`PGID` в соответствии с пользователем вашего хоста (см. выше), чтобы записываемые файлы принадлежали вам.

**Kubernetes / OpenShift (без root через `runAsUser`)**: контейнер запускается сразу от пользователя без прав root и не может сам выполнить chown для томов, поэтому оркестратор должен сделать их доступными для записи. Задайте `fsGroup`:

```yaml
securityContext:
  runAsUser: 999
  runAsGroup: 999
  fsGroup: 999        # makes mounted volumes writable by the pod
```

Записываемые каталоги образа принадлежат группе с GID 0 и доступны группе для записи, поэтому под, работающий с **произвольным UID** и дополнительной группой root (по умолчанию в OpenShift), может записывать без `chown`.

**TrueNAS Scale (и другие конфигурации с «чужим UID»)**: TrueNAS запускает приложения от пользователя без прав root (часто `568:568`) и монтирует наборы данных хоста, принадлежащие другому пользователю, поэтому ни точка входа, ни `fsGroup` сами по себе не делают их доступными для записи. Выберите один из вариантов:

- **Запустить приложение от root** (рекомендуется): оставьте пользователя приложения незаданным или задайте `0`, и пусть стандартная точка входа исправит права и перейдёт к `snapotter`.
- **Запустить с UID `999`**: задайте пользователя и группу приложения `999:999` (встроенный пользователь SnapOtter `snapotter`), чтобы они совпадали с владельцем в образе.
- **`chown` набора данных хоста** на UID, от которого запускается контейнер, из оболочки TrueNAS:

  ```bash
  # Use the UID from the startup error (or run `id` inside the container)
  chown -R 568:568 /mnt/<pool>/<dataset>
  ```

Ошибка при запуске называет точный UID, который нужно использовать, поэтому быстрее всего один раз запустить приложение, прочитать сообщение, а затем `chown` (или изменить пользователя) соответственно.

## Переменные окружения {#environment-variables}

| Переменная | По умолчанию | Описание |
|---|---|---|
| `AUTH_ENABLED` | `true` | Включить или отключить обязательный вход |
| `DEFAULT_USERNAME` | `admin` | Имя начального администратора |
| `DEFAULT_PASSWORD` | `admin` | Пароль начального администратора (при первом входе требуется смена) |
| `MAX_UPLOAD_SIZE_MB` | `0` (без ограничений) | Ограничение загрузки на файл в МБ. Образ поставляется с `0`; при сборке из исходников начинается со 100 |
| `MAX_BATCH_SIZE` | `0` (без ограничений) | Максимум файлов в одном пакетном запросе. Образ поставляется с `0`; при сборке из исходников начинается со 100 |
| `RATE_LIMIT_PER_MIN` | `1000` | Запросов API в минуту с одного IP (0 отключает) |
| `MAX_USERS` | `0` (без ограничений) | Максимальное число учётных записей |
| `TRUST_PROXY` | `loopback,linklocal,uniquelocal` | Какие узлы могут задавать IP клиента через `X-Forwarded-For`. По умолчанию только частные сети |
| `PUID` | `999` | Запускать от этого UID (для прав доступа при монтировании каталогов) |
| `PGID` | `999` | Запускать от этого GID (для прав доступа при монтировании каталогов) |
| `LOG_LEVEL` | `info` | Подробность журналов: fatal, error, warn, info, debug, trace |
| `CONCURRENT_JOBS` | `0` (авто) | Максимум параллельных задач обработки ИИ |
| `SESSION_DURATION_HOURS` | `168` | Время жизни сессии входа (7 дней) |
| `CORS_ORIGIN` | (пусто) | Разрешённые источники через запятую или пусто для того же источника |

### Исходящий прокси и частный центр сертификации {#outbound-proxy-and-private-ca}

Официальный контейнер включает поддержку прокси из окружения в Node. Если SnapOtter должен обращаться к репозиторию среды выполнения OCR или другим сервисам HTTPS через корпоративный прокси, задайте `HTTPS_PROXY` (и `HTTP_PROXY` при необходимости). Задайте `NO_PROXY` как список хостов через запятую, к которым нужно обращаться напрямую, например Postgres, Redis и внутреннее объектное хранилище.

Если прокси или внутренний сервис подписан частным центром сертификации, смонтируйте сертификат ЦС только для чтения и укажите на него `NODE_EXTRA_CA_CERTS`. Файл должен существовать к моменту запуска процесса Node:

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

Храните учётные данные прокси вне файла Compose (например, в защищённом файле `.env` или секрете). Не отключайте проверку TLS: подписанный индекс OCR аутентифицирует метаданные выпуска, а обычная проверка TLS по-прежнему защищает транспорт и все остальные исходящие запросы.

## Проверка состояния {#health-check}

Контейнер включает встроенную проверку состояния:

```bash
# Check container health status
docker inspect --format='{{.State.Health.Status}}' SnapOtter

# Manual health check
curl http://localhost:1349/api/v1/health
# {"status":"healthy","version":"x.y.z"}
```

## Обратный прокси {#reverse-proxy}

`TRUST_PROXY` по умолчанию равен `loopback,linklocal,uniquelocal`, поэтому SnapOtter доверяет `X-Forwarded-For` только от узла из частной сети. Обратный прокси на том же хосте, в сети Docker или в вашей локальной сети доверяется сразу, а значит ограничение частоты запросов, ограничитель подбора пароля при входе, журнал аудита и корпоративный список разрешённых IP видят реальный IP клиента без какой-либо настройки.

Задавайте `TRUST_PROXY=true` только тогда, когда прокси перед приложением обращается к SnapOtter с **публичного** адреса, например облачный балансировщик нагрузки в другой сети. В экземпляре, доступном напрямую, это значение делает `request.ip` управляемым злоумышленником, потому что вызывающий, меняя заголовок, получает новую корзину ограничения частоты на каждый запрос.

Два замечания, прежде чем измерять IP клиентов. Docker Desktop на macOS и Windows обслуживает опубликованный порт через пользовательский прокси, который подменяет каждый исходный адрес адресом шлюза виртуальной машины `192.168.65.1`, поэтому никакое значение `TRUST_PROXY` не восстановит там реального клиента; для всего, что открыто в интернет, развёртывайте на Linux. И на любой платформе обращение к опубликованному порту через `localhost` воспринимается как обращение от шлюза моста, а не от вашего клиента, поэтому проверка через localhost ничего не говорит о том, как определяется настоящий клиент. Полная таблица значений `TRUST_PROXY` и оговорка про Docker Desktop приведены в [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md#client-ip-resolution-trust_proxy).

Для каждого из прокси ниже важны две вещи: разрешите большие тела запросов (загрузки) и не буферизуйте ответы. Прокси с буферизацией ответов ломает прогресс SSE и, что заметнее, приводит к тому, что скачивание большого файла «начинается, но никогда не заканчивается», потому что прокси удерживает весь файл, прежде чем передать его дальше. SnapOtter отправляет `X-Accel-Buffering: no` при скачивании, чтобы nginx передавал их потоком, даже если буферизация включена в другом месте, но для прокси, отличных от nginx, буферизацию ответов нужно отключать явно (показано в каждой конфигурации ниже). Если скачивание останавливается на полпути, в первую очередь проверьте, нет ли перед приложением прокси с буферизацией.

Замечание про HSTS: API само отправляет `Strict-Transport-Security` в каждом ответе, поэтому прокси, который пропускает заголовки ответа (все конфигурации ниже так и делают), не требует собственной настройки HSTS. Сохранять заголовок или добавлять его заново на границе нужно, только если ваш прокси настроен удалять или переопределять заголовки ответа вышестоящего сервера.

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

### Развёртывание по подпути {#subpath}

Чтобы обслуживать `https://example.com/snapotter`, задайте `BASE_PATH=/snapotter` в окружении контейнера
SnapOtter и перезапустите его. Официальные файлы Compose для CPU и GPU
также принимают `BASE_PATH` из вашей оболочки или файла Compose `.env`. Один и тот же
образ работает по любому пути; пересборка фронтенда не нужна.

`BASE_PATH` принимает сегменты, разделённые косой чертой, состоящие из букв, цифр, `_` или
`-`, включая вложенные пути, например `/apps/snapotter`. Завершающая косая черта
необязательна. Для развёртывания в корне оставьте значение пустым (по умолчанию) или задайте `/`.

В существующем серверном блоке Nginx HTTPS используйте:

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

Этот пример сохраняет префикс. Прокси, удаляющие `/snapotter` перед
пересылкой, тоже поддерживаются. Внутренние проверки состояния могут по-прежнему использовать
`/api/v1/health`. Для OIDC или SAML также задайте
`EXTERNAL_URL=https://example.com/snapotter` и обновите адреса обратного вызова
поставщика удостоверений, включив в них `/snapotter/api/auth/oidc/callback` или
`/snapotter/api/auth/saml/callback` соответственно.

Скрипты API продолжают работать без изменений: URL в ответах API, например
`downloadUrl` инструмента, начинаются с `/api/` независимо от `BASE_PATH`. Добавляйте их к
базовому URL вашего экземпляра (`https://example.com/snapotter` + `/api/v1/download/...`),
а не разрешайте относительно корня домена.

Открывайте интерфейс по URL с префиксом (`https://example.com/snapotter`). Браузер,
пришедший без префикса, автоматически перенаправляется туда; без префикса ожидаются только запросы
API. Если в журналах написано
`Requests arrive under /snapotter/ but BASE_PATH is empty`, ваш прокси
пересылает префикс, который `BASE_PATH` не объявляет: задайте его в `BASE_PATH`
или удаляйте префикс на прокси.

### Nginx Proxy Manager {#nginx-proxy-manager}

1. Добавьте новый Proxy Host
2. Укажите в поле Domain Name ваш домен
3. Задайте Scheme `http`, Forward Hostname `SnapOtter` (или IP вашего контейнера), Forward Port `1349`
4. Включите поддержку WebSocket
5. В разделе Advanced добавьте: `client_max_body_size 500M;` и `proxy_buffering off;`

Заголовок `Strict-Transport-Security` из API проходит через NPM без изменений; переключатель HSTS на вкладке SSL необязателен.

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

Traefik пересылает заголовки ответа вышестоящего сервера без изменений, поэтому заголовок `Strict-Transport-Security` из API доходит до браузеров без промежуточного слоя `headers`. Если вы уже используете такой, который переписывает заголовки ответа, убедитесь, что он не затрагивает этот заголовок.

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

`flush_interval -1` отключает буферизацию ответов, что необходимо для событий прогресса SSE (пакетная обработка, инструменты ИИ, установка функций) и для того, чтобы скачивание больших файлов шло потоком, а не зависало. Увеличенные тайм-ауты позволяют завершить загрузку больших файлов, не давая Caddy раньше времени закрыть соединение. Caddy также пропускает заголовок `Strict-Transport-Security` из API без изменений, поэтому директива `header` для HSTS не нужна.

### Cloudflare Tunnels {#cloudflare-tunnels}

```bash
cloudflared tunnel --url http://localhost:1349
```

Примечание: в бесплатных тарифах Cloudflare действует ограничение загрузки в 100 МБ. Задайте `MAX_UPLOAD_SIZE_MB=100` соответственно.

Туннель пересылает заголовки ответа API, включая `Strict-Transport-Security`, поэтому настройка HSTS на панели не требуется (собственная настройка HSTS на границе Cloudflare необязательна).

## Устранение неполадок {#troubleshooting}

### «Postgres not reachable: EAI_AGAIN» сразу после неудачного первого запуска {#eai-again-after-failed-first-start}

Если самый первый `docker compose up -d` завершается неудачей на полпути (обычная причина: порт уже занят), обычный повтор `up -d` может запустить контейнер приложения, не подключив его к сети compose. Тогда приложение уходит в цикл сбоев с ошибкой:

```
Postgres not reachable: EAI_AGAIN
```

при этом `docker ps` показывает, что postgres в порядке. Ошибка настоящая, но указывает не на тот контейнер: без сети DNS для имени хоста `postgres` вообще не разрешается, а политика перезапуска бесконечно повторяет один и тот же сбой.

Устраните причину неудачного первого запуска (обычно: освободите порт), затем принудительно пересоздайте контейнер приложения, чтобы он снова подключился к сети:

```bash
docker compose up -d --force-recreate SnapOtter
```

### Windows: доступно с других устройств, но не с самого ПК {#windows-wsl2-loopback}

Когда Docker работает внутри WSL2 (обычная настройка Windows), стек может быть доступен со всех других машин в вашей сети, тогда как `http://localhost:1349` на самом хосте Windows завершается тайм-аутом, даже при включённом зеркальном сетевом режиме WSL. Порт не появляется в Windows `netstat`, и с контейнерами всё в порядке.

Откройте приложение с другого устройства или изнутри дистрибутива по его собственному адресу (`hostname -I` в оболочке WSL). Если пробрасывание localhost случайно работает в вашей версии WSL, считайте это приятным дополнением, а не тем, на что можно полагаться.

## CI/CD {#ci-cd}

В репозитории GitHub есть три рабочих процесса:

- **ci.yml**: запускается автоматически при каждом push и PR. Выполняет линтинг, проверку типов, тесты, сборку и проверку образа Docker (без публикации).
- **release.yml**: запускается вручную через `workflow_dispatch`. Запускает semantic-release для создания тега версии и выпуска GitHub, затем собирает образ Docker для нескольких архитектур (amd64 + arm64) и публикует его в Docker Hub (`snapotter/snapotter`) и GitHub Container Registry (`ghcr.io/snapotter-hq/snapotter`).
- **deploy-docs.yml**: собирает этот сайт документации и развёртывает его в Cloudflare Pages при push в `main`.

Чтобы создать выпуск, перейдите в интерфейсе GitHub в **Actions > Release > Run workflow** или выполните:

```bash
gh workflow run release.yml
```

Semantic-release определяет версию по истории коммитов. Тег Docker `latest` всегда указывает на самый свежий выпуск.

## Аналитика {#analytics}

SnapOtter включает анонимную продуктовую аналитику (шаблоны использования инструментов, отчёты об ошибках), которая помогает находить ошибки и улучшать функции. По умолчанию она включена. Ваши файлы, имена файлов и персональные данные в неё никогда не попадают. SnapOtter работает нормально и с отключённой аналитикой.

### Отключение аналитики {#disabling-analytics}

Отказ во время работы выполняется одним щелчком администратора. Откройте Настройки > Система > Конфиденциальность и выключите «Анонимную продуктовую аналитику». Она сразу прекращается для всего экземпляра, пересборка не требуется.

Чтобы получить образ, который никогда не отправляет аналитику, задайте жёсткое отключение на этапе сборки, клонировав репозиторий и пересобрав его:

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker/docker-compose.yml build --build-arg SNAPOTTER_ANALYTICS=off
docker compose -f docker/docker-compose.yml up -d
```

Или добавьте аргумент сборки в существующий `docker-compose.yml`:

```yaml
services:
  snapotter:
    build:
      context: .
      dockerfile: docker/Dockerfile
      args:
        SNAPOTTER_ANALYTICS: "off"
```