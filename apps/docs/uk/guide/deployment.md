---
description: "Розгортання SnapOtter у продакшені за допомогою Docker. Вимоги до обладнання, налаштування GPU та конфігурації зворотного проксі для Nginx, Traefik і Cloudflare."
i18n_source_hash: ecc1b528bc4b
i18n_provenance: human
i18n_output_hash: 9edd3a5b2116
---

# Розгортання {#deployment}

SnapOtter розгортається як стек Docker Compose із 3 контейнерів: образ застосунку SnapOtter, PostgreSQL 17 та Redis 8. Образ застосунку підтримує **linux/amd64** (з NVIDIA CUDA для прискорення ШІ) та **linux/arm64** (CPU), тож він працює нативно на серверах Intel/AMD, комп'ютерах Mac з Apple Silicon та ARM-пристроях, як-от Raspberry Pi 4/5. Прискорення iGPU Intel/AMD через VA-API, Quick Sync або OpenCL наразі не підтримується для інференсу ШІ.

Див. [Образ Docker](./docker-tags) для налаштування GPU, прикладів Docker Compose та закріплення версій.

## Швидкий старт (CPU) {#quick-start-cpu}

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

Застосунок тоді доступний за адресою `http://localhost:1349`.

> **Обмеження швидкості Docker Hub?** Замініть `snapotter/snapotter:latest` на `ghcr.io/snapotter-hq/snapotter:latest`, щоб завантажувати з GitHub Container Registry натомість. Обидва реєстри отримують той самий образ під час кожного випуску.

## Швидкий старт (NVIDIA CUDA) {#quick-start-nvidia-cuda}

Для прискорення NVIDIA CUDA на інструментах ШІ (видалення фону, апскейлінг, покращення облич, OCR):

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

Перевірте виявлення CUDA у логах:

```bash
docker logs SnapOtter 2>&1 | head -20
# Look for: [gpu] CUDA available via torch
```

## Вимоги до обладнання {#hardware-requirements}

Ці числа отримані з бенчмарків на низці систем, від сучасної робочої станції amd64 з NVIDIA RTX 4070 до Raspberry Pi, із запуском усього каталогу інструментів на кожній та проходженням лімітів ресурсів Docker для пошуку реальної нижньої межі.

### Швидкий довідник {#quick-reference}

| Рівень | Сценарій використання | CPU | RAM | GPU | Сховище |
|------|----------|-----|-----|-----|---------|
| Мінімум | Інструменти для зображень, файлів та легкі PDF-інструменти; один користувач; малі пакети | 2 ядра | 2 ГБ | Немає | ~7 ГБ |
| Рекомендовано | Усі п'ять модальностей, включно з відео, PDF та ШІ на CPU; пакети; кілька користувачів | 4 ядра | 4 ГБ | Немає | ~25 ГБ |
| Повний | Усе на швидкості, включно з GPU ШІ; великі пакети; багато користувачів | 6-8 ядер | 8 ГБ | NVIDIA 8 ГБ+ VRAM (комфортно 12 ГБ) | ~35 ГБ |

**Архітектура: лише 64-бітна** (`linux/amd64` або `linux/arm64`). SnapOtter працює нативно на серверах Intel/AMD, комп'ютерах Mac з Apple Silicon та 64-бітних ARM-платах, включно з **Raspberry Pi 4 та 5** (4-8 ГБ). Він **не** працює на 32-бітному ARM (`armv7`/`armhf`) — для нього не збирається жодного образу — а також на платах класу 512 МБ, як-от Pi Zero, які нижче межі пам'яті (див. нижче).

### Мінімум (інструменти для зображень, файлів та легкі PDF; без ШІ) {#minimum-image-files-and-light-pdf-tools-no-ai}

| Ресурс | Вимога |
|---|---|
| CPU | 2 ядра |
| RAM | 2 ГБ |
| Диск | ~5.5 ГБ (образ) + том даних |
| GPU | Не потрібен |

Усі 222 не-ШІ інструменти каталогу - зображення (зміна розміру, обрізання, конвертація, стиснення, коригування, водяний знак), відео (обрізання, вимкнення звуку, ремукс), аудіо (конвертація, нормалізація, обрізання), PDF (об'єднання, розділення, стиснення, обертання, захист), конвертації файлів та спеціальні пресети конвертації - працюють на скромному обладнанні. Більшість операцій завершуються значно менше ніж за секунду навіть на великому файлі: зображення розміром 2.7 МБ змінює розмір за ~0.05 с та перекодовується у WebP за ~2 с.

Межа пам'яті реальна, за даними проходження лімітів ресурсів Docker: **512 МБ не можуть запустити стек** (навіть одна зміна розміру зображення завершується вбивством процесу), **1 ГБ** справляється з операціями над одним файлом, але пакет із кількох файлів вичерпує пам'ять, а **2 ГБ / 2 ядра** — це найменша конфігурація, яка комфортно справляється з пакетами.

```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2G
```

**Єдиний виняток, що навантажує CPU, це перекодування відео.** Операції потокового копіювання (обрізання, вимкнення звуку, ремукс контейнера) миттєві, але транскодування до іншого кодека навантажує CPU. Кліп 1080p / 45 секунд, перекодований у VP9 (WebM), займає приблизно **~40 с** на швидкому сучасному CPU, ~45 с на Apple Silicon, ~80 с на старішому мобільному 4-ядерному та **~130 с** на старішому 4-ядерному сервері. Якщо ваше навантаження зосереджене на відео, надайте пріоритет ядрам CPU та тактовій частоті, або підніміть ліміт `cpus:` контейнера — постачений compose обмежує застосунок 4 ядрами за замовчуванням (8 на GPU compose).

### Рекомендовано (інструменти ШІ на CPU) {#recommended-ai-tools-on-cpu}

| Ресурс | Вимога |
|---|---|
| CPU | 4 ядра |
| RAM | 4 ГБ |
| Диск | 3 ГБ (образ) + 24 ГБ (моделі ШІ) + робочий простір |
| GPU | Не потрібен (запасний варіант на CPU) |

**Саме встановлення пакетів ШІ підвищує RAM до 4 ГБ.** Без встановленого ШІ застосунок простоює приблизно на 360 МБ; з усіма сімома встановленими пакетами він утримує ~2.6 ГБ резидентної пам'яті, оскільки Python-сайдкар ШІ попередньо завантажує свої моделі (видалення фону, апскейлінг, OCR, транскрипція, виявлення облич, реставрація) під час запуску. Не-ШІ встановлення залишаються легкими; встановлення ШІ потребують ≥4 ГБ.

Більшість інструментів ШІ цілком придатні до використання на CPU; кілька дійсно потребують GPU. Виміряно на сучасному 4-ядерному CPU:

| Інструмент ШІ | Час на CPU | Придатний на CPU? |
|---|---|---|
| Виявлення облич (blur-faces, smart-crop, red-eye), видалення шуму | менше 1 с | Так |
| OCR, транскрипція, субтитри | 1-3 с | Так |
| Розфарбовування, покращення облич | ~10 с | Так |
| Видалення / заміна / розмиття фону | ~29 с | Так (доведеться зачекати) |
| Апскейлінг ШІ (RealESRGAN) | ~33 с для малих; хвилини на великих зображеннях | Гранично — GPU наполегливо рекомендовано |
| Реставрація фото (повний конвеєр) | кілька хвилин | Ні — потрібен GPU або швидкий багатоядерний CPU |

Розміри завантаження моделей ШІ:

| Пакет | Розмір на диску |
|---|---|
| Видалення фону | 4-5 ГБ |
| Апскейлінг + Покращення облич + Видалення шуму | 5-6 ГБ |
| Виявлення облич | 200-300 МБ |
| Стирач об'єктів + Розфарбовування | 1-2 ГБ |
| OCR | 5-6 ГБ |
| Реставрація фото | 4-5 ГБ |
| **Усі пакети** | **~24 ГБ** |

```yaml
deploy:
  resources:
    limits:
      cpus: '4'
      memory: 4G
```

### Повний (інструменти ШІ на NVIDIA CUDA) {#full-ai-tools-on-nvidia-cuda}

| Ресурс | Вимога |
|---|---|
| CPU | 6-8 ядер (підготовка відео + конкурентність працюють на CPU навіть із GPU ШІ) |
| RAM | 8 ГБ |
| GPU | NVIDIA з 8+ ГБ VRAM (рекомендовано 12 ГБ) |
| Диск | ~35 ГБ загалом |

GPU NVIDIA (CUDA) значно прискорює важкі моделі ШІ. Виміряно на RTX 4070 порівняно із сучасним CPU:

| Інструмент ШІ | Прискорення з GPU | Примітки |
|---|---|---|
| Апскейлінг ШІ (RealESRGAN 2×) | **~47×** | Найбільший виграш — менше секунди проти ~33 с (хвилини на великих зображеннях) |
| Покращення облич (CodeFormer) | **~12×** | ~0.9 с проти ~11 с |
| Транскрипція (Whisper) | ~4.5× | |
| Видалення / заміна / розмиття фону | ~4× | ~7 с на GPU проти ~29 с на CPU |
| Розфарбовування | ~1.8× | |
| OCR, виявлення облич, red-eye, видалення шуму | ~1× | Уже швидко на CPU — GPU не допомагає |
| Реставрація фото | немає | Навантажує CPU навіть на GPU (0% використання GPU); тут швидкий CPU важливіший за GPU |

Інструменти, для яких вартий GPU, це **апскейлінг, покращення облич, транскрипція та видалення фону**. Виявлення облич, OCR та red-eye навантажують CPU і вже швидкі, тож GPU нічого не додає.

Пікове використання VRAM сягає 7.5 ГБ під час апскейлінгу з покращенням облич. GPU NVIDIA на 6 ГБ працює для більшості інструментів ШІ окремо, але зазнає невдачі на апскейлінгу. 8-12 ГБ VRAM справляється з усім.

Прискорення iGPU Intel/AMD через VA-API, Quick Sync або OpenCL наразі не підтримується для інференсу ШІ. Мапування `/dev/dri` у контейнер не вмикає прискорення ШІ на GPU; SnapOtter запускатиме інструменти ШІ на CPU, якщо не доступна NVIDIA CUDA.

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

### Одночасні користувачі {#concurrent-users}

Паралельні запити зміни розміру зображень до контейнера застосунку, обмеженого стандартними 4 ядрами:

| Одночасні запити | Середній час відповіді | Помилки |
|---|---|---|
| 1 | 0.4с | 0 |
| 5 | 1.2с | 0 |
| 10 | 2.1с | 0 |

Час відповіді погіршується сублінійно без помилок у міру насичення пулу воркерів. Підняття ліміту `cpus:` контейнера застосунку (або використання хоста з більшою кількістю ядер) піднімає стелю. Зауважте, що важкі завдання (транскодування відео, ШІ на CPU) утримують воркер на весь час своєї тривалості, тож розраховуйте CPU на очікувану кількість одночасних важких завдань, а не лише на кількість запитів.

### Підтримувані формати зображень {#supported-image-formats}

SnapOtter підтримує **55+ вхідних форматів** та **14 вихідних форматів**, включно з RAW-файлами від 20+ брендів камер, професійними форматами (PSD, EPS, OpenEXR, HDR), сучасними кодеками (JPEG XL, AVIF, HEIC, QOI) та науковими/ігровими форматами (FITS, DDS).

Див. [повний список форматів](/uk/guide/supported-formats) для деталей щодо кожного підтримуваного формату, використаного декодера та доступних елементів керування якістю.

### Відомі обмеження {#known-limitations}

- **Контентно-залежна зміна розміру** аварійно завершується на великих зображеннях (>5 МП) через обмеження у бінарнику caire. Добре працює з меншими зображеннями.
- **Декодування HEIF** займає 13-23 секунди. HEIC (варіант Apple) значно швидший, 0.3-0.9 секунди.
- **OCR японської** зазнає невдачі на CPU через помилку MKLDNN у PaddlePaddle. Працює на GPU.
- **Апскейлінг** перевищує час очікування на CPU для всього, крім малих зображень. Для практичного використання потрібен GPU.
- **Покращення облич CodeFormer** значно повільніше за GFPGAN (53с проти 2с на GPU). Для більшості випадків рекомендовано GFPGAN.

## Томи {#volumes}

| Монтування / Том | Призначення | Обов'язковий? |
|---|---|---|
| `/data` (застосунок) | Моделі ШІ, Python venv, файли користувачів | **Так** - без нього втрата файлів |
| `/tmp/workspace` (застосунок) | Тимчасові файли обробки (автоматично очищаються) | Рекомендовано |
| `SnapOtter-pgdata` (postgres) | Каталог даних PostgreSQL (користувачі, налаштування, конвеєри, завдання) | **Так** - без нього втрата даних |
| `SnapOtter-redisdata` (redis) | Append-only файл Redis для довговічних черг завдань | Рекомендовано |

### Bind-монтування проти іменованих томів {#bind-mounts-vs-named-volumes}

**Іменовані томи** (рекомендовано) — Docker керує дозволами автоматично:
```yaml
volumes:
  - SnapOtter-data:/data
```

**Bind-монтування** — Ви керуєте дозволами. Встановіть `PUID`/`PGID` відповідно до вашого хост-користувача:
```yaml
volumes:
  - ./SnapOtter-data:/data
environment:
  - PUID=1000    # Your host UID (run: id -u)
  - PGID=1000    # Your host GID (run: id -g)
```

### Дозволи сховища {#storage-permissions}

SnapOtter записує у два розташування під час виконання: `/data` (файли користувачів, логи, моделі ШІ та Python venv) та `/tmp/workspace` (тимчасовий чорновий простір обробки). Обидва мають бути доступними для запису користувачем, від імені якого працює контейнер. Якщо будь-яке не є таким, контейнер **швидко завершується під час запуску** з повідомленням, яке називає каталог, UID/GID, що виконується, та як це виправити — замість того, щоб завантажитися "здоровим", а потім зазнати невдачі на першому завантаженні з незрозумілою помилкою.

Спосіб обробки дозволів залежить від того, як запускається контейнер:

**За замовчуванням (стартує як root, переходить до `snapotter`)** — точка входу стартує як root, виправляє власника змонтованих томів, потім переходить до непривілейованого користувача `snapotter` через `gosu`. Іменовані томи працюють без налаштування. Для bind-монтувань встановіть `PUID`/`PGID` на вашого хост-користувача (вище), щоб файли, які він записує, належали вам.

**Kubernetes / OpenShift (не-root через `runAsUser`)** — запущений безпосередньо як не-root користувач, контейнер не може змінити власника томів самостійно, тож оркестратор має зробити їх доступними для запису. Встановіть `fsGroup`:

```yaml
securityContext:
  runAsUser: 999
  runAsGroup: 999
  fsGroup: 999        # makes mounted volumes writable by the pod
```

Доступні для запису каталоги образу мають груповим власником GID 0 та доступні для запису групою, тож под, що працює з **довільним UID** плюс кореневою додатковою групою (за замовчуванням OpenShift), може записувати без `chown`.

**TrueNAS Scale (та інші налаштування з "чужим UID")** — TrueNAS запускає застосунки як не-root користувач (часто `568:568`) та монтує хост-датасети, що належать іншому користувачу, тож ані точка входу, ані `fsGroup` не робить їх доступними для запису самостійно. Оберіть одне:

- **Запустіть застосунок як root** (рекомендовано) — залиште користувача застосунку невстановленим або встановіть його на `0`, і дозвольте стандартній точці входу виправити дозволи та перейти до `snapotter`.
- **Запустіть як UID `999`** — встановіть користувача/групу застосунку на `999:999` (вбудований користувач `snapotter` SnapOtter), щоб він відповідав власності образу.
- **`chown` хост-датасет** на UID, від імені якого працює контейнер, з оболонки TrueNAS:

  ```bash
  # Використайте UID з помилки запуску (або запустіть `id` всередині контейнера)
  chown -R 568:568 /mnt/<pool>/<dataset>
  ```

Помилка запуску називає точний UID для використання, тож найшвидший шлях — запустити застосунок один раз, прочитати повідомлення, потім `chown` (або скоригувати користувача) відповідно.

## Змінні середовища {#environment-variables}

| Змінна | За замовчуванням | Опис |
|---|---|---|
| `AUTH_ENABLED` | `true` | Увімкнути/вимкнути вимогу входу |
| `DEFAULT_USERNAME` | `admin` | Початкове ім'я адміністратора |
| `DEFAULT_PASSWORD` | `admin` | Початковий пароль адміністратора (примусова зміна під час першого входу) |
| `MAX_UPLOAD_SIZE_MB` | `100` | Ліміт завантаження на файл |
| `MAX_BATCH_SIZE` | `100` | Макс. файлів на пакетний запит |
| `RATE_LIMIT_PER_MIN` | `1000` | API-запитів за хвилину на IP (встановіть 0, щоб вимкнути) |
| `MAX_USERS` | `0` (необмежено) | Максимальна кількість облікових записів користувачів |
| `TRUST_PROXY` | `true` | Довіряти заголовкам X-Forwarded-For від зворотного проксі |
| `PUID` | `999` | Запускати від цього UID (для дозволів bind-монтування) |
| `PGID` | `999` | Запускати від цього GID (для дозволів bind-монтування) |
| `LOG_LEVEL` | `info` | Деталізація логів: fatal, error, warn, info, debug, trace |
| `CONCURRENT_JOBS` | `0` (авто) | Макс. паралельних завдань обробки ШІ |
| `SESSION_DURATION_HOURS` | `168` | Час життя сесії входу (7 днів) |
| `CORS_ORIGIN` | (порожньо) | Дозволені джерела через кому, або порожньо для того самого джерела |

## Перевірка стану {#health-check}

Контейнер містить вбудовану перевірку стану:

```bash
# Check container health status
docker inspect --format='{{.State.Health.Status}}' SnapOtter

# Manual health check
curl http://localhost:1349/api/v1/health
# {"status":"healthy","version":"x.y.z"}
```

## Зворотний проксі {#reverse-proxy}

SnapOtter встановлює `TRUST_PROXY=true` за замовчуванням, тож обмеження швидкості та логування використовують реальну IP-адресу клієнта із заголовків `X-Forwarded-For`.

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

1. Додайте новий Proxy Host
2. Встановіть Domain Name на ваш домен
3. Встановіть Scheme на `http`, Forward Hostname на `SnapOtter` (або IP вашого контейнера), Forward Port на `1349`
4. Увімкніть підтримку WebSocket
5. У розділі Advanced додайте: `client_max_body_size 500M;` та `proxy_buffering off;`

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

`flush_interval -1` вимикає буферизацію відповідей, що потрібно для подій прогресу SSE (пакетна обробка, інструменти ШІ, встановлення функцій). Розширені тайм-аути дозволяють завершити завантаження великих файлів без того, щоб Caddy передчасно закрив з'єднання.

### Cloudflare Tunnels {#cloudflare-tunnels}

```bash
cloudflared tunnel --url http://localhost:1349
```

Примітка: Cloudflare має обмеження завантаження в 100 МБ на безкоштовних планах. Встановіть `MAX_UPLOAD_SIZE_MB=100` відповідно.

## CI/CD {#ci-cd}

Репозиторій GitHub має три робочі процеси:

- **ci.yml** - Запускається автоматично під час кожного push та PR. Лінтить, перевіряє типи, тестує, збирає та валідує образ Docker (без пушу).
- **release.yml** - Запускається вручну через `workflow_dispatch`. Запускає semantic-release для створення тегу версії та випуску GitHub, потім збирає мультиархітектурний образ Docker (amd64 + arm64) та пушить у Docker Hub (`snapotter/snapotter`) та GitHub Container Registry (`ghcr.io/snapotter-hq/snapotter`).
- **deploy-docs.yml** - Збирає цей сайт документації та розгортає його на Cloudflare Pages під час push до `main`.

Щоб створити випуск, перейдіть до **Actions > Release > Run workflow** в інтерфейсі GitHub, або запустіть:

```bash
gh workflow run release.yml
```

Semantic-release визначає версію з історії комітів. Тег Docker `latest` завжди вказує на найновіший випуск.

## Аналітика {#analytics}

SnapOtter містить анонімну продуктову аналітику (патерни використання інструментів, звіти про помилки), щоб допомогти виловлювати баги та покращувати функції. Вона увімкнена за замовчуванням. Ваші файли, назви файлів та особисті дані ніколи не є частиною цього. SnapOtter працює нормально з вимкненою аналітикою.

### Вимкнення аналітики {#disabling-analytics}

Відмова під час виконання — це перемикач адміністратора в один клік. Відкрийте Settings > System > Privacy та вимкніть Anonymous Product Analytics. Вона зупиняється негайно для всього екземпляра, без потреби у перезбірці.

Для образу, який ніколи не зможе надсилати аналітику, встановіть жорстке вимкнення під час збірки, клонувавши репозиторій та перезібравши:

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker/docker-compose.yml build --build-arg SNAPOTTER_ANALYTICS=off
docker compose -f docker/docker-compose.yml up -d
```

Або додайте аргумент збірки до вашого наявного `docker-compose.yml`:

```yaml
services:
  snapotter:
    build:
      context: .
      dockerfile: docker/Dockerfile
      args:
        SNAPOTTER_ANALYTICS: "off"
```
