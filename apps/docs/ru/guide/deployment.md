---
description: "Развёртывание SnapOtter в продакшене с Docker. Требования к оборудованию, настройка GPU и конфигурации обратного прокси для Nginx, Traefik и Cloudflare."
i18n_source_hash: 0c8f078ebe75
i18n_provenance: machine
i18n_output_hash: 259ee1cc7903
i18n_hash_version: 2
---

# Развёртывание {#deployment}

SnapOtter разворачивается как стек Docker Compose из 3 контейнеров: образ приложения SnapOtter, PostgreSQL 17 и Redis 8. Образ приложения поддерживает **linux/amd64** (с NVIDIA CUDA для ускорения ИИ) и **linux/arm64** (CPU), поэтому он работает нативно на серверах Intel/AMD, компьютерах Mac с Apple Silicon и ARM-устройствах вроде Raspberry Pi 4/5. Ускорение на встроенной графике Intel/AMD через VA-API, Quick Sync или OpenCL для ИИ-инференса сейчас не поддерживается.

Настройку GPU, примеры Docker Compose и закрепление версий см. в разделе [Образ Docker](./docker-tags).

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

Стек выше подключается как владелец базы данных. Начиная с SnapOtter 2.3.0 запросы можно обслуживать от роли, которая только читает и записывает строки; см. [Роли с минимальными привилегиями](./database#least-privilege-roles).

> **Лимиты Docker Hub?** Замените `snapotter/snapotter:latest` на `ghcr.io/snapotter-hq/snapotter:latest`, чтобы загружать образ из GitHub Container Registry. Оба реестра получают один и тот же образ при каждом релизе.

## Быстрый старт (NVIDIA CUDA) {#quick-start-nvidia-cuda}

Для ускорения NVIDIA CUDA в поддерживаемых ИИ-инструментах (удаление фона, увеличение, улучшение лиц):

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

Проверьте обнаружение CUDA в логах:

```bash
docker logs SnapOtter 2>&1 | head -20
# Look for: [gpu] CUDA available via torch
```

Если ИИ-инструменты работают на CPU, хотя `--gpus all` и NVIDIA Container Toolkit настроены правильно, переустановите затронутый пакет (например, Background Removal) в разделе **Settings → AI Features**. Установщик восстановит GPU-сборку ONNX Runtime, которую в общем окружении ИИ может заслонять CPU-сборка, подтянутая другим пакетом (например, транскрибацией). Если переустановка из интерфейса не восстанавливает GPU в более старом образе, см. ручное исправление в [issue #490](https://github.com/snapotter-hq/SnapOtter/issues/490).

## Требования к оборудованию {#hardware-requirements}

Эти цифры получены в тестах на разных системах, от современной рабочей станции amd64 с NVIDIA RTX 4070 до Raspberry Pi: на каждой запускался весь каталог инструментов, а лимиты ресурсов Docker перебирались, чтобы найти реальный минимум.

Работаете на нижней границе этих уровней (Pi, старый ноутбук, VPS с 2 ГБ)? Раздел [Настройка для малых ресурсов](/ru/guide/low-resource) превращает эти цифры в пошаговое руководство с настроенными лимитами.

### Краткая справка {#quick-reference}

| Уровень | Сценарий | CPU | RAM | GPU | Хранилище |
|------|----------|-----|-----|-----|---------|
| Минимальный | Инструменты без ИИ (изображения, файлы, лёгкий PDF) плюс встроенные Fast OCR и обнаружение лиц; один пользователь; небольшие пакеты | 2 ядра | 2 ГБ | Нет | ~7 ГБ |
| Рекомендуемый | Все пять модальностей, включая видео, PDF и стандартные пакеты ИИ на CPU; пакетная обработка; несколько пользователей | 4 ядра | 4 ГБ (8 ГБ для HQ-инпейнтинга) | Нет | ~25 ГБ |
| Полный | Всё на полной скорости, включая ИИ на GPU; большие пакеты; много пользователей | 6-8 ядер | 8 ГБ | NVIDIA с 8 ГБ+ VRAM (комфортно 12 ГБ) | ~35 ГБ |

**Архитектура: только 64-бит** (`linux/amd64` или `linux/arm64`). SnapOtter работает нативно на серверах Intel/AMD, компьютерах Mac с Apple Silicon и 64-битных ARM-платах, включая **Raspberry Pi 4 и 5** (4-8 ГБ). Он **не** работает на 32-битном ARM (`armv7`/`armhf`), так как образ для него не собирается, а также на платах класса 512 МБ, таких как Pi Zero, которые ниже порога памяти (см. ниже).

### Минимальный (инструменты для изображений, файлов и лёгкого PDF; без ИИ) {#minimum-image-files-and-light-pdf-tools-no-ai}

| Ресурс | Требование |
|---|---|
| CPU | 2 ядра |
| RAM | 2 ГБ |
| Диск | ~5,5 ГБ (образ) + том данных |
| GPU | Не требуется |

Все 222 инструмента каталога без ИИ работают на скромном оборудовании: изображения (изменение размера, обрезка, конвертация, сжатие, коррекция, водяные знаки), видео (обрезка, отключение звука, ремукс), аудио (конвертация, нормализация, обрезка), PDF (объединение, разделение, сжатие, поворот, защита), конвертации файлов и специальные пресеты конвертации. Большинство операций выполняется менее чем за секунду даже на большом файле: изображение размером 2,7 МБ масштабируется примерно за 0,05 с и перекодируется в WebP примерно за 2 с.

Порог памяти реален, это показал перебор лимитов ресурсов Docker: **512 МБ не хватает для запуска стека** (даже одно изменение размера изображения приводит к завершению процесса), **1 ГБ** справляется с операциями над одним файлом, но пакет из нескольких файлов упирается в нехватку памяти, а **2 ГБ / 2 ядра** это наименьшая конфигурация, которая комфортно обрабатывает пакеты без ИИ. Встроенный Fast OCR и пакет `face-detection` тоже помещаются в 2 ГБ, тогда как более крупные пакеты ИИ (Whisper, LaMa/DDColor, rembg, RealESRGAN, восстановление фотографий и инпейнтинг HQ на SD1.5) требуют от 4 до 8 ГБ RAM и сразу отклоняются, если свободной памяти меньше порога конкретного пакета.

```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2G
```

**Единственное исключение с высокой нагрузкой на CPU это перекодирование видео.** Операции с копированием потоков (обрезка, отключение звука, смена контейнера) выполняются мгновенно, но перекодирование в другой кодек упирается в CPU. Клип 1080p длительностью 45 секунд, перекодированный в VP9 (WebM), занимает примерно **~40 с** на быстром современном CPU, ~45 с на Apple Silicon, ~80 с на старом мобильном 4-ядерном процессоре и **~130 с** на старом 4-ядерном сервере. Если ваша нагрузка в основном видео, отдавайте приоритет числу ядер и тактовой частоте или увеличьте лимит `cpus:` контейнера: поставляемый compose ограничивает приложение 4 ядрами по умолчанию (8 в GPU-версии compose).

### Рекомендуемый (инструменты ИИ на CPU) {#recommended-ai-tools-on-cpu}

| Ресурс | Требование |
|---|---|
| CPU | 4 ядра |
| RAM | 4 ГБ |
| Диск | 3 ГБ (образ) + около 20 ГБ (все необязательные пакеты ИИ) + рабочая область |
| GPU | Не требуется (откат на CPU) |

**Установка и запуск более крупных пакетов ИИ это то, что поднимает рекомендацию до 4 ГБ RAM.** Без установленных необязательных пакетов приложение в простое занимает около 360 МБ. Устаревшие инструменты Python используют общий sidecar, а точный OCR использует отдельный долгоживущий диспетчер, привязанный к активному неизменяемому поколению. Перед активацией установщик запускает дымовой тест кандидата. Затем он атомарно переключается на новый диспетчер и освобождает предыдущий диспетчер до сборки мусора. Каждый официальный артефакт точного OCR должен пройти свой набор тестов для худшего случая в cgroup на 4 ГиБ, а рекомендация в 4 ГБ для хоста оставляет запас для приложения Node.js, Postgres, Redis, очередей и параллельной работы.

Большинство инструментов ИИ вполне пригодны для работы на CPU; пара из них действительно требует GPU. Измерения на современном 4-ядерном CPU:

| Инструмент ИИ | Время на CPU | Пригоден на CPU? |
|---|---|---|
| Обнаружение лиц (blur-faces, smart-crop, red-eye), noise-removal | менее 1 с | Да |
| OCR, транскрибация, субтитры | 1-3 с | Да |
| Раскрашивание, улучшение лиц | ~10 с | Да |
| Удаление / замена / размытие фона | ~29 с | Да (придётся подождать) |
| ИИ-увеличение (RealESRGAN) | ~33 с для малых; минуты для больших изображений | Условно: настоятельно рекомендуется GPU |
| Восстановление фотографий (полный конвейер) | несколько минут | Нет: нужен GPU или быстрый многоядерный CPU |

SnapOtter намеренно не включает загрузки этих моделей в образ Docker. Пакеты ИИ загружаются только тогда, когда администратор включает соответствующий инструмент, хранятся в постоянном томе `/data/ai` и используются всеми инструментами, которые зависят от одного и того же стека моделей. Это сохраняет итоговый образ контейнера небольшим, при этом полная установка ИИ всё равно может достичь больших объёмов хранилища, указанных ниже.

Некоторые инструменты зависят более чем от одного общего пакета. Например, Passport Photo требует и `background-removal`, и `face-detection`; если `background-removal` уже установлен, включение Passport Photo загрузит только недостающий пакет `face-detection`. То же повторное использование действует для всех инструментов ИИ.

Объём хранилища необязательных пакетов ИИ и пороги памяти CPU (SnapOtter проверяет доступную память перед отправкой в sidecar Python и сразу отклоняет запуски, если свободной памяти меньше порога пакета):

| Пакет | Размер на диске | Порог памяти CPU |
|---|---|---|
| Обнаружение лиц | 200-300 МБ | 2 ГБ RAM хоста (~0,5 ГБ свободно) |
| Транскрибация | ~600 МБ | 4 ГБ RAM хоста (~2 ГБ свободно) |
| Ластик объектов + раскрашивание | 1-2 ГБ | 4 ГБ RAM хоста (~2 ГБ свободно) |
| Точный OCR (`balanced`/`best`) | ~208-234 МиБ загрузка / ~409-488 МиБ после установки | 4 ГиБ настроенной эффективной памяти (`fast` работает на 2 ГБ) |
| Удаление фона | 4-5 ГБ | 4 ГБ RAM хоста (~2,5 ГБ свободно) |
| Увеличение + улучшение лиц + удаление шума | 5-6 ГБ | 4 ГБ RAM хоста (~2,5 ГБ свободно) |
| Восстановление фотографий | 4-5 ГБ | 4 ГБ RAM хоста (~3 ГБ свободно) |
| Инпейнтинг высокого качества (`inpaint-hq`) | 5-7 ГБ | 8 ГБ RAM хоста (~6 ГБ свободно) |
| **Все пакеты** | **~25 ГБ после установки** | **4 ГБ (8 ГБ с `inpaint-hq`)** |

Fast OCR встроен в образ через Tesseract, добавляет около 25 МиБ и не требует необязательного пакета OCR или его 4 ГиБ памяти. Fast поддерживает `auto`, `en`, `de`, `es`, `fr`, `zh` и `ja`, но не корейский (`ko`) и не арабский (`ar`). Оба используют `balanced` или `best`, поэтому требуют точного пакета. Точный пакет доступен в официальных контейнерах Linux amd64 и arm64 и запускает ONNX Runtime на CPU. Хосты NVIDIA используют ту же среду выполнения OCR на CPU, поэтому OCR не зависит от версии CUDA или архитектуры GPU. Точной среде выполнения нужно не менее 4 ГиБ эффективной памяти: настроенный лимит cgroup контейнера, а при его отсутствии память хоста. SnapOtter отклоняет системы ниже этого подписанного минимума совместимости до загрузки пакета. Установка точного пакета также отклоняется на bare-metal и предсобранных архивах, для которых нельзя гарантировать libc и ABI Python. На таких неподдерживаемых хостах OCR для корейского и арабского возвращает явную ошибку несовместимости и никогда не откатывается молча на Fast. Явный запрос Fast для корейского возвращает `FEATURE_INCOMPATIBLE` с причиной `fast-korean-unsupported` до постановки задания в очередь.

Реплики, которые используют один и тот же `DATA_DIR`, должны иметь одну и ту же архитектуру CPU; закрепляйте развёртывания с несколькими репликами через node affinity. Смешанным репликам amd64/arm64 нужны отдельные тома данных и независимые развёртывания SnapOtter.

Точная среда выполнения хранит одно активное поколение и очищает кэш загрузки после активации. Для этого релиза первая установка временно требует примерно 620-720 МиБ на архив и промежуточную область, а при обновлении пик может приближаться к 1,2 ГиБ, пока старое поколение остаётся активным. Установщик вычисляет точное требование по подписанному индексу и текущим поколениям до загрузки или распаковки и завершается с ошибкой заранее, если том данных слишком мал.

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
| CPU | 6-8 ядер (подготовка видео и параллелизм работают на CPU даже при ИИ на GPU) |
| RAM | 8 ГБ |
| GPU | NVIDIA с 8+ ГБ VRAM (рекомендуется 12 ГБ) |
| Диск | ~35 ГБ всего |

GPU NVIDIA (CUDA) резко ускоряет тяжёлые модели ИИ. Измерения на RTX 4070 в сравнении с современным CPU:

| Инструмент ИИ | Ускорение на GPU | Примечания |
|---|---|---|
| ИИ-увеличение (RealESRGAN 2×) | **~47×** | Самый большой выигрыш: менее секунды против ~33 с (минуты на больших изображениях) |
| Улучшение лиц (CodeFormer) | **~12×** | ~0,9 с против ~11 с |
| Транскрибация (Whisper) | ~4,5× | |
| Удаление / замена / размытие фона | ~4× | ~7 с на GPU против ~29 с на CPU |
| Раскрашивание | ~1,8× | |
| OCR, обнаружение лиц, red-eye, noise-removal | ~1× | Уже быстро на CPU: GPU не помогает |
| Восстановление фотографий | нет | Упирается в CPU даже на GPU (0% загрузки GPU); быстрый CPU здесь важнее GPU |

GPU стоит иметь для **увеличения, улучшения лиц, транскрибации и удаления фона**. Обнаружение лиц, OCR и red-eye упираются в CPU и уже работают быстро, поэтому GPU ничего не добавляет.

Пиковое использование VRAM достигает 7,5 ГБ при увеличении с улучшением лиц. GPU NVIDIA на 6 ГБ подходит для большинства инструментов ИИ по отдельности, но не справится с увеличением. 8-12 ГБ VRAM хватает для всего.

Ускорение на встроенной графике Intel/AMD через VA-API, Quick Sync или OpenCL для ИИ-инференса сейчас не поддерживается. Проброс `/dev/dri` в контейнер не включает ускорение ИИ на GPU; SnapOtter будет запускать инструменты ИИ на CPU, если NVIDIA CUDA недоступна.

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

### Одновременные пользователи {#concurrent-users}

Параллельные запросы на изменение размера изображения к контейнеру приложения с ограничением по умолчанию в 4 ядра:

| Одновременные запросы | Среднее время ответа | Ошибки |
|---|---|---|
| 1 | 0,4 с | 0 |
| 5 | 1,2 с | 0 |
| 10 | 2,1 с | 0 |

Время ответа растёт сублинейно и без ошибок по мере насыщения пула воркеров. Увеличение лимита `cpus:` контейнера приложения (или использование хоста с большим числом ядер) поднимает потолок. Учтите, что тяжёлые задания (перекодирование видео, ИИ на CPU) занимают воркер на всё время выполнения, поэтому подбирайте CPU под ожидаемое число одновременных тяжёлых заданий, а не только под число запросов.

### Поддерживаемые форматы изображений {#supported-image-formats}

SnapOtter поддерживает **55+ входных форматов** и **14 выходных форматов**, включая файлы RAW от 20+ производителей камер, профессиональные форматы (PSD, EPS, OpenEXR, HDR), современные кодеки (JPEG XL, AVIF, HEIC, QOI) и научные и игровые форматы (FITS, DDS).

Подробности о каждом поддерживаемом формате, используемом декодере и доступных настройках качества см. в [полном списке форматов](/ru/guide/supported-formats).

### Известные ограничения {#known-limitations}

- **Контентно-зависимое изменение размера** аварийно завершается на больших изображениях (>5 МП) из-за ограничения в бинарном файле caire. С меньшими изображениями работает нормально.
- **Декодирование HEIF** занимает 13-23 секунды. HEIC (вариант Apple) намного быстрее: 0,3-0,9 секунды.
- **Увеличение** на CPU завершается по тайм-ауту для всего, кроме небольших изображений. Для практического использования нужен GPU.
- **Улучшение лиц CodeFormer** заметно медленнее GFPGAN (53 с против 2 с на GPU). Для большинства случаев рекомендуется GFPGAN.

## Тома {#volumes}

| Монтирование / том | Назначение | Обязательно? |
|---|---|---|
| `/data` (app) | Модели ИИ, venv Python, пользовательские файлы | **Да**: без него файлы будут потеряны |
| `/tmp/workspace` (app) | Временные файлы обработки (очищаются автоматически) | Рекомендуется |
| `SnapOtter-pgdata` (postgres) | Каталог данных PostgreSQL (пользователи, настройки, конвейеры, задания) | **Да**: без него данные будут потеряны |
| `SnapOtter-redisdata` (redis) | Файл append-only Redis для долговечных очередей заданий | Рекомендуется |

### Монтирование каталогов и именованные тома {#bind-mounts-vs-named-volumes}

**Именованные тома** (рекомендуется): Docker управляет правами автоматически:
```yaml
volumes:
  - SnapOtter-data:/data
```

**Монтирование каталогов**: вы управляете правами сами. Задайте `PUID`/`PGID` в соответствии с пользователем хоста:
```yaml
volumes:
  - ./SnapOtter-data:/data
environment:
  - PUID=1000    # Your host UID (run: id -u)
  - PGID=1000    # Your host GID (run: id -g)
```

### Права на хранилище {#storage-permissions}

Во время работы SnapOtter пишет в два места: `/data` (пользовательские файлы, логи, модели ИИ и venv Python) и `/tmp/workspace` (временная область обработки). Оба должны быть доступны для записи пользователю, от имени которого работает контейнер. Если это не так, контейнер **завершается с ошибкой сразу при запуске** и выводит сообщение с именем каталога, текущими UID/GID и способом исправления, вместо того чтобы стартовать «здоровым» и затем упасть при первой загрузке с непонятной ошибкой. Каталог логов (`LOG_DIR`, `/data/logs` в образе) проверяется так же, в любом режиме хранения, поскольку логи остаются локальными, даже если файлы лежат в S3.

Как обрабатываются права, зависит от способа запуска контейнера:

**По умолчанию (запуск от root, затем переход на `snapotter`)**: точка входа стартует от root, исправляет владельца смонтированных томов, затем переходит на непривилегированного пользователя `snapotter` через `gosu`. Именованные тома работают без настройки. Для монтирования каталогов задайте `PUID`/`PGID` в соответствии с вашим пользователем на хосте (см. выше), чтобы создаваемые файлы принадлежали вам.

**Kubernetes / OpenShift (не от root через `runAsUser`)**: контейнер запускается сразу от обычного пользователя и не может сам выполнить chown для томов, поэтому оркестратор должен сделать их доступными для записи. Задайте `fsGroup`:

```yaml
securityContext:
  runAsUser: 999
  runAsGroup: 999
  fsGroup: 999        # makes mounted volumes writable by the pod
```

Записываемые каталоги образа принадлежат группе с GID 0 и доступны группе для записи, поэтому под, работающий с **произвольным UID** и дополнительной группой root (поведение OpenShift по умолчанию), может писать без `chown`.

**TrueNAS Scale (и другие конфигурации с «чужим UID»)**: TrueNAS запускает приложения от обычного пользователя (часто `568:568`) и монтирует наборы данных хоста, принадлежащие другому пользователю, поэтому ни точка входа, ни `fsGroup` сами по себе не делают их доступными для записи. Выберите один из вариантов:

- **Запустить приложение от root** (рекомендуется): оставьте пользователя приложения незаданным или задайте `0`, и пусть стандартная точка входа исправит права и перейдёт на `snapotter`.
- **Запустить с UID `999`**: задайте пользователя/группу приложения `999:999` (встроенный пользователь SnapOtter `snapotter`), чтобы он совпадал с владельцем в образе.
- **`chown` набор данных хоста** на UID, от имени которого работает контейнер, из оболочки TrueNAS:

  ```bash
  # Use the UID from the startup error (or run `id` inside the container)
  chown -R 568:568 /mnt/<pool>/<dataset>
  ```

Ошибка при запуске называет точный UID, который нужно использовать, поэтому самый быстрый путь: запустить приложение один раз, прочитать сообщение, затем `chown` (или изменить пользователя) соответствующим образом.

## Переменные окружения {#environment-variables}

| Переменная | По умолчанию | Описание |
|---|---|---|
| `AUTH_ENABLED` | `true` | Включить/отключить требование входа |
| `DEFAULT_USERNAME` | `admin` | Имя начального администратора |
| `DEFAULT_PASSWORD` | `admin` | Начальный пароль администратора (принудительная смена при первом входе) |
| `MAX_UPLOAD_SIZE_MB` | `0` (без ограничений) | Лимит загрузки на файл в МБ. Образ поставляется с `0`; сборка из исходников начинается со 100 |
| `MAX_BATCH_SIZE` | `0` (без ограничений) | Максимум файлов в одном пакетном запросе. Образ поставляется с `0`; сборка из исходников начинается со 100 |
| `RATE_LIMIT_PER_MIN` | `1000` | Запросов API в минуту на IP (0 отключает ограничение) |
| `MAX_USERS` | `0` (без ограничений) | Максимальное число учётных записей |
| `TRUST_PROXY` | `loopback,linklocal,uniquelocal` | Каким пирам разрешено задавать IP клиента через `X-Forwarded-For`. По умолчанию только частные сети |
| `PUID` | `999` | Запускать от этого UID (для прав на смонтированные каталоги) |
| `PGID` | `999` | Запускать от этого GID (для прав на смонтированные каталоги) |
| `LOG_LEVEL` | `info` | Подробность логов: fatal, error, warn, info, debug, trace |
| `CONCURRENT_JOBS` | `0` (авто) | Максимум параллельных заданий обработки ИИ |
| `SESSION_DURATION_HOURS` | `168` | Время жизни сессии входа (7 дней) |
| `CORS_ORIGIN` | (пусто) | Разрешённые источники через запятую или пусто для того же источника |

### Исходящий прокси и частный CA {#outbound-proxy-and-private-ca}

Официальный контейнер включает поддержку прокси из окружения в Node. Если SnapOtter должен обращаться к репозиторию среды выполнения OCR или другим сервисам HTTPS через корпоративный прокси, задайте `HTTPS_PROXY` (и `HTTP_PROXY` при необходимости). Задайте `NO_PROXY` как список хостов через запятую, к которым нужно обращаться напрямую, например Postgres, Redis и внутреннее объектное хранилище.

Если прокси или внутренний сервис подписан частным центром сертификации, смонтируйте сертификат CA только для чтения и укажите на него `NODE_EXTRA_CA_CERTS`. Файл должен существовать к моменту запуска процесса Node:

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

Храните учётные данные прокси вне файла Compose (например, в защищённом файле `.env` или секрете). Не отключайте проверку TLS: подписанный индекс OCR аутентифицирует метаданные релиза, а обычная проверка TLS по-прежнему защищает транспорт и все остальные исходящие запросы.

## Проверка работоспособности {#health-check}

Контейнер включает встроенную проверку работоспособности:

```bash
# Check container health status
docker inspect --format='{{.State.Health.Status}}' SnapOtter

# Manual health check
curl http://localhost:1349/api/v1/health
# {"status":"healthy","version":"x.y.z"}
```

## Обратный прокси {#reverse-proxy}

`TRUST_PROXY` по умолчанию имеет значение `loopback,linklocal,uniquelocal`, поэтому SnapOtter доверяет `X-Forwarded-For` только от пира в частной сети. Обратный прокси на том же хосте, в сети Docker или в вашей локальной сети считается доверенным из коробки, а значит ограничение частоты запросов, ограничитель перебора паролей при входе, журнал аудита и корпоративный список разрешённых IP видят реальный IP клиента без какой-либо настройки.

Задавайте `TRUST_PROXY=true`, только если прокси перед приложением обращается к SnapOtter с **публичного** адреса, например облачный балансировщик нагрузки в другой сети. На напрямую доступном экземпляре это значение делает `request.ip` подконтрольным атакующему, потому что вызывающий, меняющий заголовок, получает новую корзину ограничения частоты на каждый запрос.

Два момента, которые стоит знать, прежде чем измерять IP клиентов. Docker Desktop на macOS и Windows обслуживает опубликованный порт через пользовательский прокси, который переписывает адрес источника каждого запроса на шлюз ВМ `192.168.65.1`, поэтому никакое значение `TRUST_PROXY` не восстановит реального клиента; для всего, что смотрит в интернет, разворачивайте на Linux. И на любой платформе обращение к опубликованному порту через `localhost` воспринимается как шлюз моста, а не как ваш клиент, поэтому тест через localhost ничего не говорит о том, как определяется реальный клиент. Полная таблица значений `TRUST_PROXY` и оговорка про Docker Desktop приведены в [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md#client-ip-resolution-trust_proxy).

Для любого из прокси ниже важны две вещи: разрешите большие тела запросов (загрузки) и не буферизуйте ответы. Прокси с буферизацией ответов ломает прогресс SSE и, что заметнее, приводит к тому, что скачивание большого файла «начинается, но не заканчивается», потому что прокси удерживает файл целиком, прежде чем передать его дальше. SnapOtter отправляет `X-Accel-Buffering: no` при скачивании, поэтому nginx передаёт файлы потоком, даже если в другом месте буферизация оставлена включённой, но для прокси, отличных от nginx, буферизацию ответов нужно отключать явно (показано в каждой конфигурации ниже). Если скачивание останавливается на полпути, первым делом проверьте, нет ли перед приложением прокси с буферизацией.

Замечание про HSTS: API само отправляет `Strict-Transport-Security` в каждом ответе, поэтому прокси, который пропускает заголовки ответа (все конфигурации ниже так и делают), не требует собственной настройки HSTS. Сохранять заголовок или добавлять его заново на границе нужно, только если ваш прокси настроен удалять или переопределять заголовки ответа от вышестоящего сервера.

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

Чтобы обслуживать приложение по адресу `https://example.com/snapotter`, задайте `BASE_PATH=/snapotter` в окружении
контейнера SnapOtter и перезапустите его. Официальные файлы Compose для CPU и GPU
также принимают `BASE_PATH` из вашей оболочки или файла Compose `.env`. Один и тот же
образ работает по любому пути; пересборка фронтенда не нужна.

`BASE_PATH` принимает сегменты, разделённые косой чертой, с буквами, цифрами, `_` или
`-`, включая вложенные пути, например `/apps/snapotter`. Завершающая косая черта
необязательна. Для развёртывания в корне оставьте значение пустым (по умолчанию) или задайте `/`.

В существующий серверный блок Nginx для HTTPS добавьте:

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

Этот пример сохраняет префикс. Прокси, которые удаляют `/snapotter` перед
пересылкой, тоже поддерживаются. Внутренние проверки работоспособности могут продолжать использовать
`/api/v1/health`. Для OIDC или SAML также задайте
`EXTERNAL_URL=https://example.com/snapotter` и обновите URL обратного вызова
у поставщика удостоверений, добавив `/snapotter/api/auth/oidc/callback` или
`/snapotter/api/auth/saml/callback` соответственно.

Скрипты API продолжают работать без изменений: URL в ответах API, например
`downloadUrl` инструмента, начинаются с `/api/` независимо от значения `BASE_PATH`. Добавляйте их к
базовому URL вашего экземпляра (`https://example.com/snapotter` + `/api/v1/download/...`),
а не разрешайте относительно корня домена.

Открывайте интерфейс по URL с префиксом (`https://example.com/snapotter`). Браузер,
пришедший без префикса, автоматически перенаправляется туда; без префикса к приложению должны
обращаться только запросы API. Если в логах написано
`Requests arrive under /snapotter/ but BASE_PATH is empty`, ваш прокси
пересылает префикс, который `BASE_PATH` не объявляет: задайте в `BASE_PATH` этот префикс
или удаляйте его на прокси.

### Nginx Proxy Manager {#nginx-proxy-manager}

1. Добавьте новый Proxy Host
2. Укажите в Domain Name ваш домен
3. Задайте Scheme `http`, Forward Hostname `SnapOtter` (или IP вашего контейнера), Forward Port `1349`
4. Включите поддержку WebSocket
5. В разделе Advanced добавьте: `client_max_body_size 500M;` и `proxy_buffering off;`

Заголовок `Strict-Transport-Security` от API проходит через NPM как есть; переключатель HSTS на вкладке SSL необязателен поверх него.

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

Traefik пересылает заголовки ответа вышестоящего сервера без изменений, поэтому заголовок `Strict-Transport-Security` от API доходит до браузеров без промежуточного слоя `headers`. Если у вас уже работает такой, который переписывает заголовки ответа, убедитесь, что он не трогает этот заголовок.

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

`flush_interval -1` отключает буферизацию ответов, что необходимо для событий прогресса SSE (пакетная обработка, инструменты ИИ, установка функций) и для того, чтобы скачивание больших файлов шло потоком, а не зависало. Увеличенные тайм-ауты позволяют завершить загрузку больших файлов, не давая Caddy преждевременно закрыть соединение. Caddy также пропускает заголовок `Strict-Transport-Security` от API без изменений, поэтому директива `header` для HSTS не нужна.

### Cloudflare Tunnels {#cloudflare-tunnels}

```bash
cloudflared tunnel --url http://localhost:1349
```

Примечание: у Cloudflare лимит загрузки 100 МБ на бесплатных тарифах. Задайте `MAX_UPLOAD_SIZE_MB=100` в соответствии с этим.

Туннель пересылает заголовки ответа API, включая `Strict-Transport-Security`, поэтому настройка HSTS на панели управления не требуется (собственная настройка HSTS на границе Cloudflare необязательна поверх этого).

## Устранение неполадок {#troubleshooting}

### «Postgres not reachable: EAI_AGAIN» сразу после неудачного первого запуска {#eai-again-after-failed-first-start}

Если самый первый `docker compose up -d` завершается ошибкой на полпути (обычная причина: порт уже занят), простой повторный `up -d` может запустить контейнер приложения, не подключив его к сети compose. Тогда приложение уходит в цикл аварийных перезапусков с ошибкой:

```
Postgres not reachable: EAI_AGAIN
```

при этом `docker ps` показывает, что postgres работает исправно. Ошибка настоящая, но указывает не на тот контейнер: без сети DNS для имени хоста `postgres` вообще не разрешается, а политика перезапуска бесконечно повторяет один и тот же сбой.

Устраните то, что сломало первый запуск (обычно: освободите порт), затем принудительно пересоздайте контейнер приложения, чтобы он заново подключился к сети:

```bash
docker compose up -d --force-recreate SnapOtter
```

### Windows: доступно с других устройств, но не с самого ПК {#windows-wsl2-loopback}

Если Docker работает внутри WSL2 (обычная настройка на Windows), стек может быть доступен со всех остальных машин в вашей сети, тогда как `http://localhost:1349` на самом хосте Windows завершается тайм-аутом, даже при включённом зеркальном сетевом режиме WSL. Порт не появляется в `netstat` на Windows, и с контейнерами всё в порядке.

Откройте приложение с другого устройства или изнутри дистрибутива по его собственному адресу (`hostname -I` в оболочке WSL). Если проброс localhost в вашей версии WSL всё же работает, считайте это приятным бонусом, а не тем, на что стоит полагаться.

## CI/CD {#ci-cd}

В репозитории GitHub три workflow:

- **ci.yml** - Запускается автоматически при каждом push и PR. Выполняет линтинг, проверку типов, тесты, сборку и проверку образа Docker (без публикации).
- **release.yml** - Запускается вручную через `workflow_dispatch`. Запускает semantic-release для создания тега версии и релиза GitHub, затем собирает мультиархитектурный образ Docker (amd64 + arm64) и публикует его в Docker Hub (`snapotter/snapotter`) и GitHub Container Registry (`ghcr.io/snapotter-hq/snapotter`).
- **deploy-docs.yml** - Собирает этот сайт документации и развёртывает его в Cloudflare Pages при push в `main`.

Чтобы создать релиз, откройте **Actions > Release > Run workflow** в интерфейсе GitHub или выполните:

```bash
gh workflow run release.yml
```

Semantic-release определяет версию по истории коммитов. Тег Docker `latest` всегда указывает на самый последний релиз.

## Аналитика {#analytics}

SnapOtter включает анонимную продуктовую аналитику (шаблоны использования инструментов, отчёты об ошибках), которая помогает находить баги и улучшать функции. По умолчанию она включена. Ваши файлы, имена файлов и персональные данные в неё никогда не попадают. SnapOtter нормально работает с отключённой аналитикой.

### Отключение аналитики {#disabling-analytics}

Отключение во время работы выполняется одним переключателем администратора. Откройте Settings > System > Privacy и выключите Anonymous Product Analytics. Отправка прекращается немедленно для всего экземпляра, пересборка не нужна.

Чтобы получить образ, который никогда не сможет отправлять аналитику, задайте жёсткое отключение на этапе сборки, клонировав репозиторий и пересобрав его:

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker/docker-compose.yml build --build-arg SNAPOTTER_ANALYTICS=off
docker compose -f docker/docker-compose.yml up -d
```

Либо добавьте аргумент сборки в ваш существующий `docker-compose.yml`:

```yaml
services:
  snapotter:
    build:
      context: .
      dockerfile: docker/Dockerfile
      args:
        SNAPOTTER_ANALYTICS: "off"
```

