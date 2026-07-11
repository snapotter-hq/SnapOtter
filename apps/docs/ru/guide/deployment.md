---
description: "Разверните SnapOtter в продакшене с помощью Docker. Требования к оборудованию, настройка GPU и конфигурации обратного прокси для Nginx, Traefik и Cloudflare."
i18n_source_hash: 6b6957060fa6
i18n_provenance: machine
i18n_output_hash: 8992ab5d785b
---

# Развёртывание {#deployment}

SnapOtter развёртывается как стек Docker Compose из 3 контейнеров: образ приложения SnapOtter, PostgreSQL 17 и Redis 8. Образ приложения поддерживает **linux/amd64** (с NVIDIA CUDA для ускорения ИИ) и **linux/arm64** (CPU), поэтому он работает нативно на серверах Intel/AMD, компьютерах Mac на Apple Silicon и устройствах ARM, таких как Raspberry Pi 4/5. Ускорение через iGPU Intel/AMD посредством VA-API, Quick Sync или OpenCL для ИИ-инференса сегодня не поддерживается.

См. [Docker Image](./docker-tags) для настройки GPU, примеров Docker Compose и закрепления версий.

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

> **Ограничения по частоте запросов Docker Hub?** Замените `snapotter/snapotter:latest` на `ghcr.io/snapotter-hq/snapotter:latest`, чтобы загружать образ из GitHub Container Registry. Оба реестра получают один и тот же образ при каждом релизе.

## Быстрый старт (NVIDIA CUDA) {#quick-start-nvidia-cuda}

Для ускорения NVIDIA CUDA на ИИ-инструментах (удаление фона, апскейлинг, улучшение лиц, OCR):

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

Эти цифры получены из бенчмарков на разных системах: от современной рабочей станции amd64 с NVIDIA RTX 4070 до Raspberry Pi. На каждой прогонялся весь каталог инструментов, а лимиты ресурсов Docker варьировались, чтобы найти реальный минимум.

### Краткая справка {#quick-reference}

| Уровень | Сценарий использования | CPU | RAM | GPU | Хранилище |
|------|----------|-----|-----|-----|---------|
| Минимум | Инструменты для изображений, файлов и лёгкие PDF-инструменты; один пользователь; небольшие пакеты | 2 ядра | 2 ГБ | Нет | ~7 ГБ |
| Рекомендуется | Все пять модальностей, включая видео, PDF и ИИ на CPU; пакеты; несколько пользователей | 4 ядра | 4 ГБ | Нет | ~25 ГБ |
| Полный | Всё на скорости, включая ИИ на GPU; большие пакеты; много пользователей | 6-8 ядер | 8 ГБ | NVIDIA 8 ГБ+ VRAM (12 ГБ комфортно) | ~35 ГБ |

**Архитектура: только 64-битная** (`linux/amd64` или `linux/arm64`). SnapOtter работает нативно на серверах Intel/AMD, компьютерах Mac на Apple Silicon и 64-битных платах ARM, включая **Raspberry Pi 4 и 5** (4-8 ГБ). Он **не** работает на 32-битном ARM (`armv7`/`armhf`), так как образ для него не собирается, а также на платах класса 512 МБ, таких как Pi Zero, которые ниже минимального объёма памяти (см. ниже).

### Минимум (инструменты для изображений, файлов и лёгкие PDF-инструменты; без ИИ) {#minimum-image-files-and-light-pdf-tools-no-ai}

| Ресурс | Требование |
|---|---|
| CPU | 2 ядра |
| RAM | 2 ГБ |
| Диск | ~5,5 ГБ (образ) + том данных |
| GPU | Не требуется |

Все 222 инструмента каталога без ИИ: изображения (изменение размера, обрезка, конвертация, сжатие, коррекция, водяной знак), видео (обрезка, отключение звука, ремукс), аудио (конвертация, нормализация, обрезка), PDF (объединение, разделение, сжатие, поворот, защита), конвертации файлов и специальные пресеты конвертации, работают на скромном оборудовании. Большинство операций завершаются заметно быстрее секунды даже на большом файле: изображение размером 2,7 МБ изменяется в размере за ~0,05 с и перекодируется в WebP за ~2 с.

Минимальный объём памяти реален, по результатам перебора лимитов ресурсов Docker: **512 МБ не позволяют запустить стек** (даже одно изменение размера изображения завершается принудительно), **1 ГБ** справляется с операциями над одним файлом, но пакет из нескольких файлов исчерпывает память, а **2 ГБ / 2 ядра** это наименьшая конфигурация, которая комфортно обрабатывает пакеты.

```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2G
```

**Единственное исключение, требовательное к CPU, это перекодирование видео.** Операции с копированием потока (обрезка, отключение звука, ремукс контейнера) мгновенны, но транскодирование в другой кодек упирается в CPU. Клип 1080p длительностью 45 секунд, перекодированный в VP9 (WebM), занимает примерно **~40 с** на быстром современном CPU, ~45 с на Apple Silicon, ~80 с на более старом мобильном 4-ядерном процессоре и **~130 с** на более старом 4-ядерном сервере. Если ваша рабочая нагрузка ориентирована на видео, отдавайте приоритет числу и тактовой частоте ядер CPU или повысьте лимит `cpus:` контейнера: поставляемый compose по умолчанию ограничивает приложение 4 ядрами (8 в compose для GPU).

### Рекомендуется (ИИ-инструменты на CPU) {#recommended-ai-tools-on-cpu}

| Ресурс | Требование |
|---|---|
| CPU | 4 ядра |
| RAM | 4 ГБ |
| Диск | 3 ГБ (образ) + 24 ГБ (модели ИИ) + рабочее пространство |
| GPU | Не требуется (запасной вариант на CPU) |

**Именно установка ИИ-пакетов повышает требования к RAM до 4 ГБ.** Без установленного ИИ приложение простаивает примерно на 360 МБ; со всеми семью установленными пакетами оно удерживает ~2,6 ГБ в резиденции, потому что Python-сайдкар ИИ предзагружает свои модели (удаление фона, апскейлинг, OCR, транскрипция, обнаружение лиц, реставрация) при запуске. Установки без ИИ остаются лёгкими; установки с ИИ требуют ≥4 ГБ.

Большинство ИИ-инструментов вполне пригодны на CPU; пара действительно требует GPU. Измерено на современном 4-ядерном CPU:

| ИИ-инструмент | Время на CPU | Пригоден на CPU? |
|---|---|---|
| Обнаружение лиц (размытие лиц, умная обрезка, красные глаза), удаление шума | менее 1 с | Да |
| OCR, транскрипция, субтитры | 1-3 с | Да |
| Раскрашивание, улучшение лиц | ~10 с | Да |
| Удаление / замена / размытие фона | ~29 с | Да (придётся подождать) |
| ИИ-апскейл (RealESRGAN) | ~33 с для малых; минуты для больших изображений | Условно, настоятельно рекомендуется GPU |
| Реставрация фото (полный конвейер) | несколько минут | Нет, требуется GPU или быстрый многоядерный CPU |

SnapOtter намеренно не встраивает загрузки этих моделей в образ Docker. ИИ-пакеты загружаются только тогда, когда администратор включает соответствующий инструмент, хранятся в постоянном томе `/data/ai` и совместно используются каждым инструментом, зависящим от одного и того же набора моделей. Это сохраняет итоговый образ контейнера небольшим и в то же время позволяет полной установке ИИ достичь бо́льших цифр по хранилищу, указанных ниже.

Некоторые инструменты зависят от более чем одного общего пакета. Например, для инструмента Passport Photo требуются оба пакета `background-removal` и `face-detection`; если `background-removal` уже установлен, включение Passport Photo загружает только недостающий пакет `face-detection`. То же повторное использование применяется ко всем ИИ-инструментам.

Размеры загрузок моделей ИИ:

| Пакет | Размер на диске |
|---|---|
| Удаление фона | 4-5 ГБ |
| Апскейл + Улучшение лиц + Удаление шума | 5-6 ГБ |
| Обнаружение лиц | 200-300 МБ |
| Ластик объектов + Раскрашивание | 1-2 ГБ |
| OCR | 5-6 ГБ |
| Реставрация фото | 4-5 ГБ |
| **Все пакеты** | **~24 ГБ** |

```yaml
deploy:
  resources:
    limits:
      cpus: '4'
      memory: 4G
```

### Полный (ИИ-инструменты на NVIDIA CUDA) {#full-ai-tools-on-nvidia-cuda}

| Ресурс | Требование |
|---|---|
| CPU | 6-8 ядер (подготовка видео + параллелизм выполняются на CPU даже при ИИ на GPU) |
| RAM | 8 ГБ |
| GPU | NVIDIA с 8+ ГБ VRAM (рекомендуется 12 ГБ) |
| Диск | ~35 ГБ всего |

GPU NVIDIA (CUDA) резко ускоряет тяжёлые модели ИИ. Измерено на RTX 4070 в сравнении с современным CPU:

| ИИ-инструмент | Ускорение с GPU | Примечания |
|---|---|---|
| ИИ-апскейл (RealESRGAN 2×) | **~47×** | Самый большой выигрыш: менее секунды против ~33 с (минуты для больших изображений) |
| Улучшение лиц (CodeFormer) | **~12×** | ~0,9 с против ~11 с |
| Транскрипция (Whisper) | ~4,5× | |
| Удаление / замена / размытие фона | ~4× | ~7 с на GPU против ~29 с на CPU |
| Раскрашивание | ~1,8× | |
| OCR, обнаружение лиц, красные глаза, удаление шума | ~1× | Уже быстро на CPU, GPU не помогает |
| Реставрация фото | нет | Упирается в CPU даже на GPU (0% загрузки GPU); быстрый CPU здесь важнее GPU |

Инструменты, которым стоит выделить GPU, это **апскейл, улучшение лиц, транскрипция и удаление фона**. Обнаружение лиц, OCR и красные глаза упираются в CPU и уже быстры, поэтому GPU ничего не добавляет.

Пиковое использование VRAM достигает 7,5 ГБ во время апскейла с улучшением лиц. GPU NVIDIA на 6 ГБ работает для большинства ИИ-инструментов по отдельности, но не справится с апскейлом. 8-12 ГБ VRAM справляются со всем.

Ускорение через iGPU Intel/AMD посредством VA-API, Quick Sync или OpenCL для ИИ-инференса сегодня не поддерживается. Проброс `/dev/dri` в контейнер не включает ускорение ИИ на GPU; SnapOtter будет запускать ИИ-инструменты на CPU, если недоступна NVIDIA CUDA.

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

Время ответа ухудшается сублинейно без ошибок по мере насыщения пула воркеров. Повышение лимита `cpus:` контейнера приложения (или использование хоста с бо́льшим числом ядер) поднимает потолок. Обратите внимание, что тяжёлые задания (транскодирование видео, ИИ на CPU) удерживают воркер на всю свою продолжительность, поэтому подбирайте CPU под ожидаемое число одновременных тяжёлых заданий, а не только под число запросов.

### Поддерживаемые форматы изображений {#supported-image-formats}

SnapOtter поддерживает **55+ входных форматов** и **14 выходных форматов**, включая RAW-файлы от 20+ марок камер, профессиональные форматы (PSD, EPS, OpenEXR, HDR), современные кодеки (JPEG XL, AVIF, HEIC, QOI) и научные/игровые форматы (FITS, DDS).

Подробности о каждом поддерживаемом формате, используемом декодере и доступных настройках качества см. в [полном списке форматов](/ru/guide/supported-formats).

### Известные ограничения {#known-limitations}

- **Изменение размера с учётом содержимого** аварийно завершается на больших изображениях (>5 Мп) из-за ограничения в бинарнике caire. Нормально работает с изображениями меньшего размера.
- **Декодирование HEIF** занимает 13-23 секунды. HEIC (вариант Apple) намного быстрее: 0,3-0,9 секунды.
- **OCR для японского** не работает на CPU из-за ошибки MKLDNN в PaddlePaddle. Работает на GPU.
- **Апскейл** превышает тайм-аут на CPU для всего, кроме малых изображений. Для практического использования требуется GPU.
- Улучшение лиц **CodeFormer** значительно медленнее, чем GFPGAN (53 с против 2 с на GPU). Для большинства случаев рекомендуется GFPGAN.

## Тома {#volumes}

| Монтирование / Том | Назначение | Обязательно? |
|---|---|---|
| `/data` (app) | Модели ИИ, Python venv, пользовательские файлы | **Да**, без него потеря файлов |
| `/tmp/workspace` (app) | Временные файлы обработки (очищаются автоматически) | Рекомендуется |
| `SnapOtter-pgdata` (postgres) | Каталог данных PostgreSQL (пользователи, настройки, конвейеры, задания) | **Да**, без него потеря данных |
| `SnapOtter-redisdata` (redis) | Append-only файл Redis для устойчивых очередей заданий | Рекомендуется |

### Bind-монтирования против именованных томов {#bind-mounts-vs-named-volumes}

**Именованные тома** (рекомендуется): Docker управляет правами доступа автоматически:
```yaml
volumes:
  - SnapOtter-data:/data
```

**Bind-монтирования**: правами управляете вы. Установите `PUID`/`PGID` в соответствии с вашим пользователем на хосте:
```yaml
volumes:
  - ./SnapOtter-data:/data
environment:
  - PUID=1000    # Your host UID (run: id -u)
  - PGID=1000    # Your host GID (run: id -g)
```

### Права доступа к хранилищу {#storage-permissions}

SnapOtter записывает в два места во время работы: `/data` (пользовательские файлы, логи, модели ИИ и Python venv) и `/tmp/workspace` (временная рабочая область обработки). Оба должны быть доступны для записи пользователю, от имени которого запущен контейнер. Если это не так, контейнер **быстро завершается с ошибкой при запуске**, выводя сообщение с именем каталога, текущим UID/GID и способом устранения, вместо того чтобы стартовать «здоровым» и затем упасть на первой же загрузке с непонятной ошибкой.

Способ обработки прав доступа зависит от того, как запускается контейнер:

**По умолчанию (запускается как root, понижается до `snapotter`):** точка входа запускается как root, исправляет владение смонтированными томами, затем понижается до непривилегированного пользователя `snapotter` через `gosu`. Именованные тома работают без настройки. Для bind-монтирований установите `PUID`/`PGID` на вашего пользователя на хосте (выше), чтобы записываемые файлы принадлежали вам.

**Kubernetes / OpenShift (не-root через `runAsUser`):** запускаясь напрямую от имени не-root пользователя, контейнер не может сам сменить владельца томов, поэтому оркестратор должен сделать их доступными для записи. Установите `fsGroup`:

```yaml
securityContext:
  runAsUser: 999
  runAsGroup: 999
  fsGroup: 999        # makes mounted volumes writable by the pod
```

Записываемые каталоги образа принадлежат группе GID 0 и доступны для записи группе, поэтому под, работающий с **произвольным UID** плюс дополнительной корневой группой (по умолчанию в OpenShift), может записывать без `chown`.

**TrueNAS Scale (и другие настройки с «чужим UID»):** TrueNAS запускает приложения от имени не-root пользователя (часто `568:568`) и монтирует наборы данных хоста, принадлежащие другому пользователю, поэтому ни точка входа, ни `fsGroup` не делают их доступными для записи самостоятельно. Выберите один вариант:

- **Запустить приложение как root** (рекомендуется): оставьте пользователя приложения не заданным или установите его в `0` и позвольте точке входа по умолчанию исправить права и понизиться до `snapotter`.
- **Запустить как UID `999`**: установите пользователя/группу приложения в `999:999` (встроенный пользователь `snapotter` SnapOtter), чтобы он соответствовал владению образа.
- **`chown` набор данных хоста** на UID, от имени которого работает контейнер, из оболочки TrueNAS:

  ```bash
  # Используйте UID из ошибки при запуске (или выполните `id` внутри контейнера)
  chown -R 568:568 /mnt/<pool>/<dataset>
  ```

Ошибка при запуске называет точный UID для использования, поэтому самый быстрый путь такой: запустить приложение один раз, прочитать сообщение, затем выполнить `chown` (или изменить пользователя) соответственно.

## Переменные окружения {#environment-variables}

| Переменная | По умолчанию | Описание |
|---|---|---|
| `AUTH_ENABLED` | `true` | Включить/отключить требование входа |
| `DEFAULT_USERNAME` | `admin` | Начальное имя администратора |
| `DEFAULT_PASSWORD` | `admin` | Начальный пароль администратора (принудительная смена при первом входе) |
| `MAX_UPLOAD_SIZE_MB` | `100` | Лимит загрузки на файл |
| `MAX_BATCH_SIZE` | `100` | Макс. число файлов на пакетный запрос |
| `RATE_LIMIT_PER_MIN` | `1000` | Запросов API в минуту на IP (установите 0 для отключения) |
| `MAX_USERS` | `0` (без ограничений) | Максимальное число учётных записей пользователей |
| `TRUST_PROXY` | `true` | Доверять заголовкам X-Forwarded-For от обратного прокси |
| `PUID` | `999` | Запускать с этим UID (для прав bind-монтирований) |
| `PGID` | `999` | Запускать с этим GID (для прав bind-монтирований) |
| `LOG_LEVEL` | `info` | Уровень логирования: fatal, error, warn, info, debug, trace |
| `CONCURRENT_JOBS` | `0` (авто) | Макс. число параллельных ИИ-заданий обработки |
| `SESSION_DURATION_HOURS` | `168` | Время жизни сессии входа (7 дней) |
| `CORS_ORIGIN` | (пусто) | Разрешённые источники через запятую, или пусто для same-origin |

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

SnapOtter устанавливает `TRUST_PROXY=true` по умолчанию, чтобы ограничение частоты запросов и логирование использовали реальный IP клиента из заголовков `X-Forwarded-For`.

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
2. Установите Domain Name на ваш домен
3. Установите Scheme на `http`, Forward Hostname на `SnapOtter` (или IP вашего контейнера), Forward Port на `1349`
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

`flush_interval -1` отключает буферизацию ответа, что необходимо для событий прогресса SSE (пакетная обработка, ИИ-инструменты, установка функций). Увеличенные тайм-ауты позволяют завершать загрузки больших файлов без того, чтобы Caddy закрывал соединение раньше времени.

### Cloudflare Tunnels {#cloudflare-tunnels}

```bash
cloudflared tunnel --url http://localhost:1349
```

Примечание: у Cloudflare лимит загрузки 100 МБ на бесплатных тарифах. Установите `MAX_UPLOAD_SIZE_MB=100` в соответствии с этим.

## CI/CD {#ci-cd}

В репозитории GitHub есть три рабочих процесса:

- **ci.yml**: запускается автоматически при каждом push и PR. Линтит, проверяет типы, тестирует, собирает и валидирует образ Docker (без push).
- **release.yml**: запускается вручную через `workflow_dispatch`. Выполняет semantic-release для создания тега версии и релиза GitHub, затем собирает мультиархитектурный образ Docker (amd64 + arm64) и отправляет его в Docker Hub (`snapotter/snapotter`) и GitHub Container Registry (`ghcr.io/snapotter-hq/snapotter`).
- **deploy-docs.yml**: собирает этот сайт документации и разворачивает его на Cloudflare Pages при push в `main`.

Чтобы создать релиз, перейдите в **Actions > Release > Run workflow** в интерфейсе GitHub или выполните:

```bash
gh workflow run release.yml
```

Semantic-release определяет версию по истории коммитов. Тег Docker `latest` всегда указывает на самый последний релиз.

## Аналитика {#analytics}

SnapOtter включает анонимную продуктовую аналитику (паттерны использования инструментов, отчёты об ошибках), чтобы помогать отлавливать баги и улучшать функции. Она включена по умолчанию. Ваши файлы, имена файлов и персональные данные никогда не являются её частью. SnapOtter работает нормально с отключённой аналитикой.

### Отключение аналитики {#disabling-analytics}

Отказ во время работы делается переключателем для администратора в один клик. Откройте Settings > System > Privacy и отключите Anonymous Product Analytics. Она останавливается немедленно для всего экземпляра, пересборка не требуется.

Для образа, который никогда не сможет отправлять аналитику, задайте жёсткое отключение на этапе сборки, клонировав репозиторий и пересобрав его:

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker/docker-compose.yml build --build-arg SNAPOTTER_ANALYTICS=off
docker compose -f docker/docker-compose.yml up -d
```

Либо добавьте аргумент сборки в существующий `docker-compose.yml`:

```yaml
services:
  snapotter:
    build:
      context: .
      dockerfile: docker/Dockerfile
      args:
        SNAPOTTER_ANALYTICS: "off"
```
