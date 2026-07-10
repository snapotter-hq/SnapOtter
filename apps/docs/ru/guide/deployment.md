---
description: "Разверните SnapOtter в продакшене с помощью Docker. Требования к оборудованию, настройка GPU и конфигурации обратного прокси для Nginx, Traefik и Cloudflare."
i18n_source_hash: ecc1b528bc4b
i18n_provenance: human
i18n_output_hash: 9b3eaa947741
---

# Развёртывание {#deployment}

SnapOtter развёртывается как стек Docker Compose из 3 контейнеров: образ приложения SnapOtter, PostgreSQL 17 и Redis 8. Образ приложения поддерживает **linux/amd64** (с NVIDIA CUDA для ускорения AI) и **linux/arm64** (CPU), поэтому он работает нативно на серверах Intel/AMD, компьютерах Mac на Apple Silicon и ARM-устройствах вроде Raspberry Pi 4/5. Ускорение через iGPU Intel/AMD с помощью VA-API, Quick Sync или OpenCL сегодня не поддерживается для AI-инференса.

Подробнее о настройке GPU, примерах Docker Compose и закреплении версий смотрите в [Docker-образе](./docker-tags).

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
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
      - REDIS_URL=redis://redis:6379

      # --- Limits (set 0 for unlimited) ---
      # - MAX_UPLOAD_SIZE_MB=100   # Per-file upload limit in MB
      # - MAX_BATCH_SIZE=100       # Max files per batch request
      # - RATE_LIMIT_PER_MIN=1000  # API rate limit per IP, default shown (0 = disabled)
      # - MAX_USERS=0              # Max user accounts

      # --- Networking ---
      # - TRUST_PROXY=true         # Trust X-Forwarded-For headers (set false if not behind a proxy)

      # --- Bind mount permissions ---
      # - PUID=1000                # Match your host user's UID (run: id -u)
      # - PGID=1000                # Match your host user's GID (run: id -g)
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
      POSTGRES_USER: snapotter
      POSTGRES_PASSWORD: snapotter     # Change this for non-local deployments
      POSTGRES_DB: snapotter
    volumes:
      - SnapOtter-pgdata:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U snapotter"]
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

> **Ограничения по частоте запросов на Docker Hub?** Замените `snapotter/snapotter:latest` на `ghcr.io/snapotter-hq/snapotter:latest`, чтобы загрузить образ из GitHub Container Registry. Оба реестра получают один и тот же образ при каждом релизе.

## Быстрый старт (NVIDIA CUDA) {#quick-start-nvidia-cuda}

Для ускорения AI-инструментов через NVIDIA CUDA (удаление фона, апскейл, улучшение лиц, OCR):

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
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
      - REDIS_URL=redis://redis:6379
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

Проверьте обнаружение CUDA в логах:

```bash
docker logs SnapOtter 2>&1 | head -20
# Look for: [gpu] CUDA available via torch
```

## Требования к оборудованию {#hardware-requirements}

Эти цифры получены из бенчмарков на широком диапазоне систем, от современной amd64-рабочей станции с NVIDIA RTX 4070 до Raspberry Pi, на каждой из которых прогонялся весь каталог инструментов с изменением лимитов ресурсов Docker, чтобы найти реальный нижний порог.

### Краткая справка {#quick-reference}

| Уровень | Сценарий использования | CPU | RAM | GPU | Хранилище |
|------|----------|-----|-----|-----|---------|
| Минимальный | Инструменты для изображений, файлов и лёгкие PDF-инструменты; один пользователь; небольшие пакеты | 2 ядра | 2 ГБ | Нет | ~7 ГБ |
| Рекомендуемый | Все пять модальностей, включая видео, PDF и AI на CPU; пакеты; несколько пользователей | 4 ядра | 4 ГБ | Нет | ~25 ГБ |
| Полный | Всё на высокой скорости, включая GPU AI; большие пакеты; много пользователей | 6-8 ядер | 8 ГБ | NVIDIA 8 ГБ+ VRAM (12 ГБ комфортно) | ~35 ГБ |

**Архитектура: только 64-битная** (`linux/amd64` или `linux/arm64`). SnapOtter работает нативно на серверах Intel/AMD, компьютерах Mac на Apple Silicon и 64-битных ARM-платах, включая **Raspberry Pi 4 и 5** (4-8 ГБ). Он **не** работает на 32-битной ARM (`armv7`/`armhf`) — образ для неё не собирается — а также на платах класса 512 МБ, таких как Pi Zero, которые ниже порога памяти (см. ниже).

### Минимальный (инструменты для изображений, файлов и лёгкие PDF-инструменты; без AI) {#minimum-image-files-and-light-pdf-tools-no-ai}

| Ресурс | Требование |
|---|---|
| CPU | 2 ядра |
| RAM | 2 ГБ |
| Диск | ~5.5 ГБ (образ) + том данных |
| GPU | Не требуется |

Все 222 не-AI инструмента каталога - изображения (изменение размера, обрезка, конвертация, сжатие, коррекция, водяной знак), видео (обрезка, отключение звука, ремукс), аудио (конвертация, нормализация, обрезка), PDF (объединение, разделение, сжатие, поворот, защита), конвертации файлов и специальные пресеты конвертации - работают на скромном оборудовании. Большинство операций завершаются заметно быстрее секунды даже для крупного файла: изображение 2.7 МБ меняет размер за ~0.05 с и перекодируется в WebP за ~2 с.

Порог памяти вполне реален, по данным изменения лимита ресурсов Docker: **512 МБ не могут запустить стек** (даже одно изменение размера изображения завершается принудительно), **1 ГБ** справляется с однофайловыми операциями, но многофайловый пакет исчерпывает память, а **2 ГБ / 2 ядра** — минимальная конфигурация, комфортно справляющаяся с пакетами.

```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2G
```

**Единственное исключение, требовательное к CPU, — перекодирование видео.** Операции с копированием потока (обрезка, отключение звука, ремукс контейнера) выполняются мгновенно, но транскодирование в другой кодек упирается в CPU. Клип 1080p / 45 секунд, перекодированный в VP9 (WebM), занимает примерно **~40 с** на быстром современном CPU, ~45 с на Apple Silicon, ~80 с на старом мобильном 4-ядерном процессоре и **~130 с** на старом 4-ядерном сервере. Если ваша нагрузка ориентирована на видео, отдавайте приоритет числу ядер CPU и тактовой частоте либо поднимите лимит `cpus:` контейнера — поставляемый compose по умолчанию ограничивает приложение 4 ядрами (8 в GPU-compose).

### Рекомендуемый (AI-инструменты на CPU) {#recommended-ai-tools-on-cpu}

| Ресурс | Требование |
|---|---|
| CPU | 4 ядра |
| RAM | 4 ГБ |
| Диск | 3 ГБ (образ) + 24 ГБ (AI-модели) + рабочая область |
| GPU | Не требуется (запасной вариант на CPU) |

**Именно установка AI-бандлов поднимает требования к RAM до 4 ГБ.** Без установленного AI приложение простаивает около 360 МБ; со всеми семью установленными бандлами оно удерживает ~2.6 ГБ резидентной памяти, потому что Python-сайдкар AI предварительно загружает свои модели (удаление фона, апскейл, OCR, транскрипция, детекция лиц, реставрация) при запуске. Установки без AI остаются лёгкими; установки с AI требуют ≥4 ГБ.

Большинство AI-инструментов вполне пригодны для использования на CPU; паре из них действительно нужен GPU. Замерено на современном 4-ядерном CPU:

| AI-инструмент | Время на CPU | Пригоден на CPU? |
|---|---|---|
| Детекция лиц (размытие лиц, умная обрезка, красные глаза), удаление шума | менее 1 с | Да |
| OCR, транскрипция, субтитры | 1-3 с | Да |
| Раскрашивание, улучшение лиц | ~10 с | Да |
| Удаление / замена / размытие фона | ~29 с | Да (придётся подождать) |
| AI-апскейл (RealESRGAN) | ~33 с для малых; минуты для больших изображений | Условно — настоятельно рекомендуется GPU |
| Реставрация фото (полный пайплайн) | несколько минут | Нет — нужен GPU или быстрый многоядерный CPU |

Размеры загрузки AI-моделей:

| Бандл | Размер на диске |
|---|---|
| Удаление фона | 4-5 ГБ |
| Апскейл + улучшение лиц + удаление шума | 5-6 ГБ |
| Детекция лиц | 200-300 МБ |
| Ластик объектов + раскрашивание | 1-2 ГБ |
| OCR | 5-6 ГБ |
| Реставрация фото | 4-5 ГБ |
| **Все бандлы** | **~24 ГБ** |

```yaml
deploy:
  resources:
    limits:
      cpus: '4'
      memory: 4G
```

### Полный (AI-инструменты на NVIDIA CUDA) {#full-ai-tools-on-nvidia-cuda}

| Ресурс | Требование |
|---|---|
| CPU | 6-8 ядер (подготовка видео + конкурентность выполняются на CPU даже с GPU AI) |
| RAM | 8 ГБ |
| GPU | NVIDIA с 8+ ГБ VRAM (рекомендуется 12 ГБ) |
| Диск | ~35 ГБ суммарно |

GPU NVIDIA (CUDA) резко ускоряет тяжёлые AI-модели. Замерено на RTX 4070 против современного CPU:

| AI-инструмент | Ускорение с GPU | Примечания |
|---|---|---|
| AI-апскейл (RealESRGAN 2×) | **~47×** | Самый большой выигрыш — менее секунды против ~33 с (минуты на больших изображениях) |
| Улучшение лиц (CodeFormer) | **~12×** | ~0.9 с против ~11 с |
| Транскрипция (Whisper) | ~4.5× | |
| Удаление / замена / размытие фона | ~4× | ~7 с на GPU против ~29 с на CPU |
| Раскрашивание | ~1.8× | |
| OCR, детекция лиц, красные глаза, удаление шума | ~1× | Уже быстро на CPU — GPU не помогает |
| Реставрация фото | нет | Упирается в CPU даже на GPU (0% загрузки GPU); быстрый CPU здесь важнее GPU |

Инструменты, ради которых стоит завести GPU, — это **апскейл, улучшение лиц, транскрипция и удаление фона**. Детекция лиц, OCR и красные глаза упираются в CPU и уже быстры, так что GPU ничего не даёт.

Пиковое использование VRAM достигает 7.5 ГБ во время апскейла с улучшением лиц. GPU NVIDIA на 6 ГБ подходит для большинства AI-инструментов по отдельности, но не справится с апскейлом. 8-12 ГБ VRAM справляются со всем.

Ускорение через iGPU Intel/AMD с помощью VA-API, Quick Sync или OpenCL сегодня не поддерживается для AI-инференса. Проброс `/dev/dri` в контейнер не включает ускорение AI на GPU; SnapOtter будет выполнять AI-инструменты на CPU, если недоступна NVIDIA CUDA.

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

Параллельные запросы на изменение размера изображений к контейнеру приложения, ограниченному 4 ядрами по умолчанию:

| Одновременных запросов | Среднее время ответа | Ошибки |
|---|---|---|
| 1 | 0.4 с | 0 |
| 5 | 1.2 с | 0 |
| 10 | 2.1 с | 0 |

Время ответа деградирует сублинейно без ошибок по мере насыщения пула воркеров. Повышение лимита `cpus:` контейнера приложения (или использование хоста с большим числом ядер) поднимает потолок. Учтите, что тяжёлые задачи (транскодирование видео, AI на CPU) удерживают воркер на всю свою длительность, поэтому подбирайте CPU под ожидаемое число одновременных тяжёлых задач, а не только под число запросов.

### Поддерживаемые форматы изображений {#supported-image-formats}

SnapOtter поддерживает **55+ входных форматов** и **14 выходных форматов**, включая RAW-файлы от 20+ брендов камер, профессиональные форматы (PSD, EPS, OpenEXR, HDR), современные кодеки (JPEG XL, AVIF, HEIC, QOI) и научные/игровые форматы (FITS, DDS).

Подробности о каждом поддерживаемом формате, используемом декодере и доступных настройках качества смотрите в [полном списке форматов](/ru/guide/supported-formats).

### Известные ограничения {#known-limitations}

- **Контентно-зависимое изменение размера** аварийно завершается на больших изображениях (>5 МП) из-за ограничения в бинарнике caire. С меньшими изображениями работает нормально.
- **Декодирование HEIF** занимает 13-23 секунды. HEIC (вариант от Apple) гораздо быстрее — 0.3-0.9 секунды.
- **OCR для японского** не работает на CPU из-за бага MKLDNN в PaddlePaddle. Работает на GPU.
- **Апскейл** превышает тайм-аут на CPU для всего, что больше маленьких изображений. Для практического использования требуется GPU.
- Улучшение лиц через **CodeFormer** значительно медленнее GFPGAN (53 с против 2 с на GPU). Для большинства случаев рекомендуется GFPGAN.

## Тома {#volumes}

| Монтирование / Том | Назначение | Обязателен? |
|---|---|---|
| `/data` (приложение) | AI-модели, Python venv, пользовательские файлы | **Да** — без него потеря файлов |
| `/tmp/workspace` (приложение) | Временные файлы обработки (очищаются автоматически) | Рекомендуется |
| `SnapOtter-pgdata` (postgres) | Каталог данных PostgreSQL (пользователи, настройки, пайплайны, задачи) | **Да** — без него потеря данных |
| `SnapOtter-redisdata` (redis) | Append-only файл Redis для устойчивых очередей задач | Рекомендуется |

### Bind-монтирования против именованных томов {#bind-mounts-vs-named-volumes}

**Именованные тома** (рекомендуется) — Docker управляет правами доступа автоматически:
```yaml
volumes:
  - SnapOtter-data:/data
```

**Bind-монтирования** — правами доступа управляете вы. Установите `PUID`/`PGID` так, чтобы они соответствовали вашему пользователю на хосте:
```yaml
volumes:
  - ./SnapOtter-data:/data
environment:
  - PUID=1000    # Your host UID (run: id -u)
  - PGID=1000    # Your host GID (run: id -g)
```

### Права доступа к хранилищу {#storage-permissions}

SnapOtter пишет в два места во время выполнения: `/data` (пользовательские файлы, логи, AI-модели и Python venv) и `/tmp/workspace` (временная рабочая область обработки). Оба должны быть доступны для записи пользователю, под которым работает контейнер. Если хотя бы одно недоступно, контейнер **сразу же завершается при запуске** с сообщением, называющим каталог, текущий UID/GID и способ исправления — вместо того чтобы загрузиться «здоровым», а затем упасть на первой же загрузке с непонятной ошибкой.

Как обрабатываются права доступа, зависит от того, как запускается контейнер:

**По умолчанию (запускается от root, сбрасывает права до `snapotter`)** — точка входа стартует от root, исправляет владельца смонтированных томов, затем сбрасывает права до непривилегированного пользователя `snapotter` через `gosu`. Именованные тома работают без настройки. Для bind-монтирований задайте `PUID`/`PGID` в соответствии с вашим пользователем на хосте (выше), чтобы записываемые файлы принадлежали вам.

**Kubernetes / OpenShift (не-root через `runAsUser`)** — запущенный напрямую как не-root пользователь, контейнер не может сам сменить владельца томов, поэтому оркестратор должен сделать их доступными для записи. Задайте `fsGroup`:

```yaml
securityContext:
  runAsUser: 999
  runAsGroup: 999
  fsGroup: 999        # makes mounted volumes writable by the pod
```

Записываемые каталоги образа принадлежат группе GID 0 и доступны для записи группе, так что под, работающий с **произвольным UID** плюс дополнительной группой root (по умолчанию в OpenShift), может писать без `chown`.

**TrueNAS Scale (и другие настройки с «чужим UID»)** — TrueNAS запускает приложения под не-root пользователем (часто `568:568`) и монтирует хостовые датасеты, принадлежащие другому пользователю, поэтому ни точка входа, ни `fsGroup` сами по себе не делают их доступными для записи. Выберите один вариант:

- **Запустить приложение от root** (рекомендуется) — оставьте пользователя приложения не заданным или установите его в `0`, и пусть точка входа по умолчанию исправит права доступа и сбросит их до `snapotter`.
- **Запустить от UID `999`** — установите пользователя/группу приложения в `999:999` (встроенный пользователь `snapotter` SnapOtter), чтобы они соответствовали владельцу образа.
- **`chown` хостовый датасет** на UID, под которым работает контейнер, из shell TrueNAS:

  ```bash
  # Используйте UID из ошибки запуска (или выполните `id` внутри контейнера)
  chown -R 568:568 /mnt/<pool>/<dataset>
  ```

Ошибка запуска называет точный UID для использования, поэтому самый быстрый путь — запустить приложение один раз, прочитать сообщение, а затем `chown` (или скорректировать пользователя) соответствующим образом.

## Переменные окружения {#environment-variables}

| Переменная | По умолчанию | Описание |
|---|---|---|
| `AUTH_ENABLED` | `true` | Включить/отключить требование входа |
| `DEFAULT_USERNAME` | `admin` | Начальное имя пользователя администратора |
| `DEFAULT_PASSWORD` | `admin` | Начальный пароль администратора (принудительная смена при первом входе) |
| `MAX_UPLOAD_SIZE_MB` | `100` | Лимит загрузки на файл |
| `MAX_BATCH_SIZE` | `100` | Максимум файлов на один пакетный запрос |
| `RATE_LIMIT_PER_MIN` | `1000` | Запросов к API в минуту на IP (0 отключает) |
| `MAX_USERS` | `0` (без ограничений) | Максимальное число учётных записей пользователей |
| `TRUST_PROXY` | `true` | Доверять заголовкам X-Forwarded-For от обратного прокси |
| `PUID` | `999` | Запускать под этим UID (для прав доступа bind-монтирований) |
| `PGID` | `999` | Запускать под этим GID (для прав доступа bind-монтирований) |
| `LOG_LEVEL` | `info` | Уровень логирования: fatal, error, warn, info, debug, trace |
| `CONCURRENT_JOBS` | `0` (авто) | Максимум параллельных AI-задач обработки |
| `SESSION_DURATION_HOURS` | `168` | Время жизни сессии входа (7 дней) |
| `CORS_ORIGIN` | (пусто) | Разрешённые источники через запятую или пусто для same-origin |

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

SnapOtter по умолчанию устанавливает `TRUST_PROXY=true`, поэтому ограничение частоты запросов и логирование используют реальный IP клиента из заголовков `X-Forwarded-For`.

### Nginx {#nginx}

```nginx
server {
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

        # SSE support (batch progress, feature install progress)
        proxy_buffering off;
        proxy_read_timeout 300s;
    }
}
```

### Nginx Proxy Manager {#nginx-proxy-manager}

1. Добавьте новый Proxy Host
2. Задайте Domain Name на ваш домен
3. Установите Scheme в `http`, Forward Hostname в `SnapOtter` (или IP вашего контейнера), Forward Port в `1349`
4. Включите поддержку WebSocket
5. В разделе Advanced добавьте: `client_max_body_size 500M;` и `proxy_buffering off;`

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

`flush_interval -1` отключает буферизацию ответов, что необходимо для событий прогресса SSE (пакетная обработка, AI-инструменты, установка функций). Расширенные тайм-ауты позволяют загрузкам крупных файлов завершиться без того, чтобы Caddy закрыл соединение раньше времени.

### Cloudflare Tunnels {#cloudflare-tunnels}

```bash
cloudflared tunnel --url http://localhost:1349
```

Примечание: у Cloudflare на бесплатных тарифах действует лимит загрузки в 100 МБ. Установите `MAX_UPLOAD_SIZE_MB=100` в соответствии с ним.

## CI/CD {#ci-cd}

В репозитории GitHub три пайплайна:

- **ci.yml** — запускается автоматически при каждом push и PR. Линтит, проверяет типы, тестирует, собирает и валидирует Docker-образ (без публикации).
- **release.yml** — запускается вручную через `workflow_dispatch`. Выполняет semantic-release для создания тега версии и релиза на GitHub, затем собирает мультиархитектурный Docker-образ (amd64 + arm64) и публикует его в Docker Hub (`snapotter/snapotter`) и GitHub Container Registry (`ghcr.io/snapotter-hq/snapotter`).
- **deploy-docs.yml** — собирает этот сайт документации и разворачивает его на Cloudflare Pages при push в `main`.

Чтобы создать релиз, перейдите в **Actions > Release > Run workflow** в интерфейсе GitHub или выполните:

```bash
gh workflow run release.yml
```

Semantic-release определяет версию по истории коммитов. Docker-тег `latest` всегда указывает на самый последний релиз.

## Аналитика {#analytics}

SnapOtter включает анонимную продуктовую аналитику (паттерны использования инструментов, отчёты об ошибках), чтобы помогать отлавливать баги и улучшать функции. Она включена по умолчанию. Ваши файлы, имена файлов и персональные данные никогда не являются её частью. SnapOtter работает нормально с отключённой аналитикой.

### Отключение аналитики {#disabling-analytics}

Отказ во время выполнения — это переключатель для администратора в один клик. Откройте Settings > System > Privacy и выключите Anonymous Product Analytics. Она остановится немедленно для всего экземпляра, без пересборки.

Для образа, который никогда не сможет отправлять аналитику, задайте жёсткое отключение на этапе сборки, клонировав репозиторий и пересобрав его:

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker/docker-compose.yml build --build-arg SNAPOTTER_ANALYTICS=off
docker compose -f docker/docker-compose.yml up -d
```

Или добавьте аргумент сборки в ваш существующий `docker-compose.yml`:

```yaml
services:
  snapotter:
    build:
      context: .
      dockerfile: docker/Dockerfile
      args:
        SNAPOTTER_ANALYTICS: "off"
```
