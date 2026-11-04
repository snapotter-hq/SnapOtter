---
description: "Розгортання SnapOtter у продакшені з Docker. Вимоги до апаратного забезпечення, налаштування GPU та конфігурації зворотного проксі для Nginx, Traefik і Cloudflare."
i18n_source_hash: 0c8f078ebe75
i18n_provenance: machine
i18n_output_hash: 3405a3f31dd9
i18n_hash_version: 2
---

# Розгортання {#deployment}

SnapOtter розгортається як стек Docker Compose із 3 контейнерів: образ застосунку SnapOtter, PostgreSQL 17 і Redis 8. Образ застосунку підтримує **linux/amd64** (з NVIDIA CUDA для AI-прискорення) та **linux/arm64** (CPU), тому працює нативно на серверах Intel/AMD, Mac на Apple Silicon і ARM-пристроях, як-от Raspberry Pi 4/5. Прискорення через інтегрований GPU Intel/AMD (VA-API, Quick Sync або OpenCL) для AI-інференсу наразі не підтримується.

Налаштування GPU, приклади Docker Compose і фіксацію версій див. у розділі [Образ Docker](./docker-tags).

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

Після цього застосунок доступний за адресою `http://localhost:1349`.

Наведений вище стек підключається від імені власника бази даних. Починаючи з SnapOtter 2.3.0, запити можна обслуговувати з роллю, яка лише читає й записує рядки; див. [Ролі з мінімальними привілеями](./database#least-privilege-roles).

> **Ліміти Docker Hub?** Замініть `snapotter/snapotter:latest` на `ghcr.io/snapotter-hq/snapotter:latest`, щоб завантажувати образ із GitHub Container Registry. Обидва реєстри отримують однаковий образ під час кожного релізу.

## Швидкий старт (NVIDIA CUDA) {#quick-start-nvidia-cuda}

Для прискорення NVIDIA CUDA в підтримуваних AI-інструментах (видалення фону, збільшення роздільної здатності, покращення облич):

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

### Перевірка GPU-прискорення {#verify-gpu-acceleration}

Перевірте виявлення CUDA в журналах:

```bash
docker logs SnapOtter 2>&1 | head -20
# Look for: [gpu] CUDA available via torch
```

Якщо AI-інструменти працюють на CPU, хоча `--gpus all` і NVIDIA Container Toolkit налаштовано правильно, перевстановіть відповідний пакет (наприклад, Background Removal) у розділі **Settings → AI Features**. Інсталятор відновлює GPU-збірку ONNX Runtime, яку може перекривати CPU-збірка, підтягнута іншим пакетом (наприклад, транскрибуванням) у спільному AI-середовищі. Якщо перевстановлення через інтерфейс не відновлює GPU на старішому образі, див. ручне виправлення в [issue #490](https://github.com/snapotter-hq/SnapOtter/issues/490).

## Вимоги до апаратного забезпечення {#hardware-requirements}

Ці цифри отримано з тестів на різних системах, від сучасної робочої станції amd64 з NVIDIA RTX 4070 до Raspberry Pi: на кожній запускали весь каталог інструментів і змінювали обмеження ресурсів Docker, щоб знайти реальну нижню межу.

Працюєте на нижньому краї цих рівнів (Pi, старий ноутбук, VPS на 2 ГБ)? [Налаштування з обмеженими ресурсами](/uk/guide/low-resource) перетворює ці цифри на конкретний покроковий посібник із підібраними обмеженнями.

### Коротка довідка {#quick-reference}

| Рівень | Сценарій використання | CPU | RAM | GPU | Сховище |
|------|----------|-----|-----|-----|---------|
| Мінімальний | Інструменти без AI (зображення, файли, легкий PDF), а також вбудований Fast OCR і виявлення облич; один користувач; малі пакети | 2 ядра | 2 ГБ | Немає | ~7 ГБ |
| Рекомендований | Усі п'ять модальностей, зокрема відео, PDF і стандартні AI-пакети на CPU; пакетна обробка; кілька користувачів | 4 ядра | 4 ГБ (8 ГБ для HQ-інпейнтингу) | Немає | ~25 ГБ |
| Повний | Усе на повній швидкості, зокрема GPU AI; великі пакети; багато користувачів | 6-8 ядер | 8 ГБ | NVIDIA від 8 ГБ VRAM (комфортно 12 ГБ) | ~35 ГБ |

**Архітектура: лише 64-бітна** (`linux/amd64` або `linux/arm64`). SnapOtter працює нативно на серверах Intel/AMD, Mac на Apple Silicon і 64-бітних ARM-платах, зокрема **Raspberry Pi 4 і 5** (4-8 ГБ). Він **не** працює на 32-бітному ARM (`armv7`/`armhf`), бо образ для нього не збирається, а також на платах класу 512 МБ, як-от Pi Zero, які нижчі за поріг пам'яті (див. нижче).

### Мінімальний (інструменти для зображень, файлів і легкого PDF; без AI) {#minimum-image-files-and-light-pdf-tools-no-ai}

| Ресурс | Вимога |
|---|---|
| CPU | 2 ядра |
| RAM | 2 ГБ |
| Диск | ~5,5 ГБ (образ) + том даних |
| GPU | Не потрібен |

Усі 222 інструменти каталогу без AI працюють на скромному обладнанні: зображення (зміна розміру, обрізання, конвертація, стиснення, коригування, водяний знак), відео (обрізання, вимкнення звуку, ремукс), аудіо (конвертація, нормалізація, обрізання), PDF (об'єднання, розділення, стиснення, обертання, захист), конвертації файлів і окремі пресети конвертації. Більшість операцій завершується значно менш ніж за секунду навіть на великому файлі: зображення на 2,7 МБ змінює розмір приблизно за 0,05 с і перекодовується у WebP приблизно за 2 с.

Поріг пам'яті реальний, за результатами перебору обмежень ресурсів Docker: **512 МБ не вистачає для запуску стека** (навіть одну зміну розміру зображення буде вбито), **1 ГБ** достатньо для операцій з одним файлом, але пакет із кількох файлів вичерпує пам'ять, а **2 ГБ / 2 ядра** є найменшою конфігурацією, яка комфортно обробляє пакети без AI. Вбудований Fast OCR і пакет `face-detection` також вміщуються у 2 ГБ, тоді як більші AI-пакети (Whisper, LaMa/DDColor, rembg, RealESRGAN, відновлення фото та HQ-інпейнтинг SD1.5) потребують від 4 до 8 ГБ RAM і відхиляються одразу, якщо вільної пам'яті менше за поріг для відповідного пакета.

```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2G
```

**Єдиний виняток із високим навантаженням на CPU: перекодування відео.** Операції з копіюванням потоку (обрізання, вимкнення звуку, ремукс контейнера) миттєві, але транскодування в інший кодек залежить від CPU. Кліп 1080p / 45 секунд, перекодований у VP9 (WebM), займає приблизно **~40 с** на швидкому сучасному CPU, ~45 с на Apple Silicon, ~80 с на старішому мобільному 4-ядерному процесорі та **~130 с** на старішому 4-ядерному сервері. Якщо ваше навантаження переважно відео, віддавайте перевагу ядрам і тактовій частоті CPU або збільште ліміт `cpus:` для контейнера: у типовому compose застосунок обмежено 4 ядрами (8 у GPU-варіанті compose).

### Рекомендований (AI-інструменти на CPU) {#recommended-ai-tools-on-cpu}

| Ресурс | Вимога |
|---|---|
| CPU | 4 ядра |
| RAM | 4 ГБ |
| Диск | 3 ГБ (образ) + близько 20 ГБ (усі необов'язкові AI-пакети) + робочий простір |
| GPU | Не потрібен (запасний варіант на CPU) |

**Саме встановлення та запуск більших AI-пакетів підвищує рекомендацію до 4 ГБ RAM.** Без необов'язкових пакетів застосунок у спокої споживає близько 360 МБ. Застарілі Python-інструменти використовують спільний sidecar, тоді як точний OCR використовує окремий довгоживучий диспетчер, прив'язаний до активного незмінного покоління. Перед активацією інсталятор запускає димовий тест кандидата. Потім він атомарно перемикається на новий диспетчер і спорожнює попередній диспетчер до збирання сміття. Кожен офіційний артефакт точного OCR має пройти свій набір тестів для найгіршого випадку в межах cgroup на 4 ГіБ, тоді як рекомендація 4 ГБ для хоста залишає запас для застосунку Node.js, Postgres, Redis, черг і паралельної роботи.

Більшість AI-інструментів цілком придатні для CPU; кільком справді потрібен GPU. Виміри на сучасному 4-ядерному CPU:

| AI-інструмент | Час на CPU | Придатний на CPU? |
|---|---|---|
| Виявлення облич (blur-faces, smart-crop, red-eye), noise-removal | менше 1 с | Так |
| OCR, транскрибування, субтитри | 1-3 с | Так |
| Колоризація, покращення облич | ~10 с | Так |
| Видалення / заміна / розмиття фону | ~29 с | Так (доведеться чекати) |
| AI-збільшення (RealESRGAN) | ~33 с для малих; хвилини для великих зображень | Обмежено: GPU настійно рекомендується |
| Відновлення фото (повний конвеєр) | кілька хвилин | Ні: потрібен GPU або швидкий багатоядерний CPU |

SnapOtter навмисно не вбудовує завантаження цих моделей в образ Docker. AI-пакети завантажуються лише тоді, коли адміністратор вмикає відповідний інструмент, зберігаються у постійному томі `/data/ai` і спільно використовуються всіма інструментами, що залежать від того самого стека моделей. Це зберігає фінальний образ контейнера малим, водночас дозволяючи повній AI-інсталяції досягти більших обсягів сховища, наведених нижче.

Деякі інструменти залежать від кількох спільних пакетів. Наприклад, Passport Photo потребує і `background-removal`, і `face-detection`; якщо `background-removal` уже встановлено, ввімкнення Passport Photo завантажує лише відсутній пакет `face-detection`. Те саме повторне використання діє для всіх AI-інструментів.

Обсяг сховища необов'язкових AI-пакетів і пороги пам'яті CPU (SnapOtter перевіряє доступну пам'ять перед передачею в Python sidecar і негайно відхиляє запуски нижче порога вільної пам'яті пакета):

| Пакет | Розмір на диску | Поріг пам'яті CPU |
|---|---|---|
| Виявлення облич | 200-300 МБ | 2 ГБ RAM хоста (~0,5 ГБ вільних) |
| Транскрибування | ~600 МБ | 4 ГБ RAM хоста (~2 ГБ вільних) |
| Object eraser + Colorize | 1-2 ГБ | 4 ГБ RAM хоста (~2 ГБ вільних) |
| Точний OCR (`balanced`/`best`) | ~208-234 МіБ завантаження / ~409-488 МіБ після встановлення | 4 ГіБ налаштованої ефективної пам'яті (`fast` працює на 2 ГБ) |
| Видалення фону | 4-5 ГБ | 4 ГБ RAM хоста (~2,5 ГБ вільних) |
| Upscale + Face enhance + Noise removal | 5-6 ГБ | 4 ГБ RAM хоста (~2,5 ГБ вільних) |
| Відновлення фото | 4-5 ГБ | 4 ГБ RAM хоста (~3 ГБ вільних) |
| Високоякісний інпейнтинг (`inpaint-hq`) | 5-7 ГБ | 8 ГБ RAM хоста (~6 ГБ вільних) |
| **Усі пакети** | **~25 ГБ після встановлення** | **4 ГБ (8 ГБ з `inpaint-hq`)** |

Fast OCR вбудовано в образ через Tesseract, він додає близько 25 МіБ і не потребує необов'язкового пакета OCR та його вимоги в 4 ГіБ пам'яті. Fast підтримує `auto`, `en`, `de`, `es`, `fr`, `zh` і `ja`, але не корейську (`ko`) і не арабську (`ar`). Обидві використовують `balanced` або `best`, а тому потребують точного пакета. Точний пакет доступний в офіційних контейнерах Linux amd64 і arm64 та виконує ONNX Runtime на CPU. Хости NVIDIA використовують той самий CPU-рантайм OCR, тож OCR не залежить від версії CUDA чи архітектури GPU. Точному рантайму потрібно щонайменше 4 ГіБ ефективної пам'яті: налаштований ліміт cgroup контейнера, а за його відсутності пам'ять хоста. SnapOtter відхиляє системи нижче цього підписаного мінімуму сумісності ще до завантаження пакета. Встановлення точного пакета також відхиляється на bare-metal/попередньо зібраних архівах, для яких не можна гарантувати libc і ABI Python. На таких непідтримуваних хостах OCR для корейської та арабської повертає явну помилку несумісності й ніколи мовчки не переходить на Fast. Явний запит Fast для корейської повертає `FEATURE_INCOMPATIBLE` з причиною `fast-korean-unsupported` до постановки завдання в чергу.

Репліки, що спільно використовують той самий `DATA_DIR`, мають мати однакову архітектуру CPU; для розгортань із кількома репліками використовуйте node affinity. Змішані репліки amd64/arm64 потребують окремих томів даних і незалежних розгортань SnapOtter.

Точний рантайм зберігає одне активне покоління і очищає кеш завантаження після активації. У цьому релізі першому встановленню тимчасово потрібно приблизно 620-720 МіБ для архіву та проміжного розміщення, а оновлення може сягати піку близько 1,2 ГіБ, доки старе покоління залишається активним. Інсталятор обчислює точну вимогу з підписаного індексу та поточних поколінь до завантаження чи розпакування і завчасно завершується помилкою, якщо том даних замалий.

```yaml
deploy:
  resources:
    limits:
      cpus: '4'
      memory: 4G
```

### Повний (AI-інструменти на NVIDIA CUDA) {#full-ai-tools-on-nvidia-cuda}

| Ресурс | Вимога |
|---|---|
| CPU | 6-8 ядер (підготовка відео та паралелізм виконуються на CPU навіть із GPU AI) |
| RAM | 8 ГБ |
| GPU | NVIDIA з 8+ ГБ VRAM (рекомендовано 12 ГБ) |
| Диск | ~35 ГБ загалом |

GPU NVIDIA (CUDA) різко прискорює важкі AI-моделі. Виміри на RTX 4070 порівняно із сучасним CPU:

| AI-інструмент | Прискорення з GPU | Примітки |
|---|---|---|
| AI-збільшення (RealESRGAN 2×) | **~47×** | Найбільший виграш: менше секунди проти ~33 с (хвилини для великих зображень) |
| Покращення облич (CodeFormer) | **~12×** | ~0,9 с проти ~11 с |
| Транскрибування (Whisper) | ~4,5× | |
| Видалення / заміна / розмиття фону | ~4× | ~7 с на GPU проти ~29 с на CPU |
| Колоризація | ~1,8× | |
| OCR, виявлення облич, red-eye, noise-removal | ~1× | Уже швидко на CPU: GPU не допомагає |
| Відновлення фото | немає | Залежить від CPU навіть на GPU (0% завантаження GPU); тут швидкий CPU важливіший за GPU |

GPU варто мати для **збільшення, покращення облич, транскрибування та видалення фону**. Виявлення облич, OCR і red-eye залежать від CPU та вже швидкі, тож GPU нічого не додає.

Пікове використання VRAM сягає 7,5 ГБ під час збільшення з покращенням облич. GPU NVIDIA на 6 ГБ підходить для більшості AI-інструментів окремо, але не впорається зі збільшенням. 8-12 ГБ VRAM вистачає на все.

Прискорення через інтегрований GPU Intel/AMD (VA-API, Quick Sync або OpenCL) для AI-інференсу наразі не підтримується. Прокидання `/dev/dri` у контейнер не вмикає AI GPU-прискорення; SnapOtter виконуватиме AI-інструменти на CPU, якщо NVIDIA CUDA недоступна.

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

Паралельні запити на зміну розміру зображення до контейнера застосунку з типовим обмеженням у 4 ядра:

| Одночасні запити | Середній час відповіді | Помилки |
|---|---|---|
| 1 | 0,4 с | 0 |
| 5 | 1,2 с | 0 |
| 10 | 2,1 с | 0 |

Час відповіді зростає сублінійно без помилок, у міру насичення пулу воркерів. Збільшення ліміту `cpus:` контейнера застосунку (або використання хоста з більшою кількістю ядер) піднімає стелю. Зверніть увагу, що важкі завдання (транскодування відео, AI на CPU) утримують воркер увесь свій час виконання, тож розраховуйте CPU на очікувану кількість одночасних важких завдань, а не лише на кількість запитів.

### Підтримувані формати зображень {#supported-image-formats}

SnapOtter підтримує **55+ вхідних форматів** і **14 вихідних форматів**, зокрема RAW-файли від понад 20 брендів камер, професійні формати (PSD, EPS, OpenEXR, HDR), сучасні кодеки (JPEG XL, AVIF, HEIC, QOI) і наукові та ігрові формати (FITS, DDS).

Докладніше про кожен підтримуваний формат, використаний декодер і доступні засоби керування якістю див. у [повному списку форматів](/uk/guide/supported-formats).

### Відомі обмеження {#known-limitations}

- **Content-aware resize** аварійно завершується на великих зображеннях (>5 МП) через обмеження бінарного файлу caire. На менших зображеннях працює нормально.
- **Декодування HEIF** займає 13-23 секунди. HEIC (варіант Apple) значно швидший: 0,3-0,9 секунди.
- **Збільшення** на CPU завершується за тайм-аутом для всього, що більше за малі зображення. Для практичного використання потрібен GPU.
- Покращення облич **CodeFormer** значно повільніше за GFPGAN (53 с проти 2 с на GPU). Для більшості випадків рекомендовано GFPGAN.

## Томи {#volumes}

| Точка монтування / том | Призначення | Обов'язковий? |
|---|---|---|
| `/data` (app) | AI-моделі, Python venv, файли користувачів | **Так**: без нього файли буде втрачено |
| `/tmp/workspace` (app) | Тимчасові файли обробки (очищаються автоматично) | Рекомендований |
| `SnapOtter-pgdata` (postgres) | Каталог даних PostgreSQL (користувачі, налаштування, конвеєри, завдання) | **Так**: без нього дані буде втрачено |
| `SnapOtter-redisdata` (redis) | Файл Redis append-only для надійних черг завдань | Рекомендований |

### Bind mounts і іменовані томи {#bind-mounts-vs-named-volumes}

**Іменовані томи** (рекомендовано): Docker керує правами доступу автоматично:
```yaml
volumes:
  - SnapOtter-data:/data
```

**Bind mounts**: правами керуєте ви. Задайте `PUID`/`PGID` відповідно до користувача вашого хоста:
```yaml
volumes:
  - ./SnapOtter-data:/data
environment:
  - PUID=1000    # Your host UID (run: id -u)
  - PGID=1000    # Your host GID (run: id -g)
```

### Права доступу до сховища {#storage-permissions}

SnapOtter під час роботи записує у два розташування: `/data` (файли користувачів, журнали, AI-моделі та Python venv) і `/tmp/workspace` (тимчасовий робочий простір обробки). Обидва мають бути доступні для запису користувачу, від імені якого працює контейнер. Якщо хоча б одне недоступне, контейнер **завершується помилкою одразу під час запуску** з повідомленням, що називає каталог, поточні UID/GID і спосіб виправлення, замість того щоб запуститися «справним» і зазнати збою під час першого завантаження з незрозумілою помилкою. Каталог журналів (`LOG_DIR`, `/data/logs` в образі) перевіряється так само в кожному режимі сховища, оскільки журнали залишаються локальними, навіть коли файли зберігаються в S3.

Спосіб обробки прав залежить від того, як запущено контейнер:

**Типово (запуск від root, перехід на `snapotter`)**: точка входу стартує від root, виправляє власника змонтованих томів, а потім переходить на непривілейованого користувача `snapotter` через `gosu`. Іменовані томи працюють без налаштування. Для bind mounts задайте `PUID`/`PGID` відповідно до вашого користувача хоста (див. вище), щоб створені файли належали вам.

**Kubernetes / OpenShift (не від root через `runAsUser`)**: контейнер запущено напряму від користувача без root, тому він не може сам змінити власника томів, і оркестратор має зробити їх доступними для запису. Задайте `fsGroup`:

```yaml
securityContext:
  runAsUser: 999
  runAsGroup: 999
  fsGroup: 999        # makes mounted volumes writable by the pod
```

Каталоги образу, доступні для запису, належать групі з GID 0 і доступні для запису групі, тому под, що працює з **довільним UID** та додатковою кореневою групою (типово в OpenShift), може записувати без `chown`.

**TrueNAS Scale (та інші конфігурації з «чужим UID»)**: TrueNAS запускає застосунки від користувача без root (часто `568:568`) і монтує набори даних хоста, власником яких є інший користувач, тому ні точка входу, ні `fsGroup` самі по собі не роблять їх доступними для запису. Оберіть один зі способів:

- **Запустіть застосунок від root** (рекомендовано): залиште користувача застосунку незаданим або задайте `0`, і нехай типова точка входу виправить права та перейде на `snapotter`.
- **Запустіть з UID `999`**: задайте користувача/групу застосунку `999:999` (вбудований користувач SnapOtter `snapotter`), щоб він відповідав власнику в образі.
- **`chown` набір даних хоста** на UID, від імені якого працює контейнер, з оболонки TrueNAS:

  ```bash
  # Use the UID from the startup error (or run `id` inside the container)
  chown -R 568:568 /mnt/<pool>/<dataset>
  ```

Помилка запуску називає точний UID, який слід використати, тож найшвидший шлях: запустити застосунок один раз, прочитати повідомлення, а потім `chown` (або відповідно змінити користувача).

## Змінні середовища {#environment-variables}

| Змінна | Типове значення | Опис |
|---|---|---|
| `AUTH_ENABLED` | `true` | Увімкнути/вимкнути вимогу входу |
| `DEFAULT_USERNAME` | `admin` | Початкове ім'я адміністратора |
| `DEFAULT_PASSWORD` | `admin` | Початковий пароль адміністратора (примусова зміна під час першого входу) |
| `MAX_UPLOAD_SIZE_MB` | `0` (необмежено) | Ліміт завантаження на файл у МБ. Образ постачається зі значенням `0`; збірка з вихідного коду починається зі 100 |
| `MAX_BATCH_SIZE` | `0` (необмежено) | Максимум файлів у запиті пакетної обробки. Образ постачається зі значенням `0`; збірка з вихідного коду починається зі 100 |
| `RATE_LIMIT_PER_MIN` | `1000` | API-запитів на хвилину з одного IP (задайте 0, щоб вимкнути) |
| `MAX_USERS` | `0` (необмежено) | Максимальна кількість облікових записів користувачів |
| `TRUST_PROXY` | `loopback,linklocal,uniquelocal` | Які вузли можуть задавати IP клієнта через `X-Forwarded-For`. Типово лише приватні мережі |
| `PUID` | `999` | Запускати з цим UID (для прав bind mount) |
| `PGID` | `999` | Запускати з цим GID (для прав bind mount) |
| `LOG_LEVEL` | `info` | Детальність журналювання: fatal, error, warn, info, debug, trace |
| `CONCURRENT_JOBS` | `0` (авто) | Максимум паралельних AI-завдань обробки |
| `SESSION_DURATION_HOURS` | `168` | Тривалість сесії входу (7 днів) |
| `CORS_ORIGIN` | (порожньо) | Дозволені origin через кому, або порожньо для того самого origin |

### Вихідний проксі та приватний CA {#outbound-proxy-and-private-ca}

Офіційний контейнер вмикає підтримку проксі зі змінних середовища в Node. Якщо SnapOtter має звертатися до репозиторію рантайму OCR чи інших HTTPS-сервісів через корпоративний проксі, задайте `HTTPS_PROXY` (і `HTTP_PROXY`, якщо потрібно). Задайте `NO_PROXY` як список хостів через кому, до яких потрібно звертатися напряму, наприклад Postgres, Redis і внутрішнє об'єктне сховище.

Якщо проксі або внутрішній сервіс підписано приватним центром сертифікації, змонтуйте сертифікат CA лише для читання та вкажіть на нього в `NODE_EXTRA_CA_CERTS`. Файл має існувати на момент запуску процесу Node:

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

Зберігайте облікові дані проксі поза файлом Compose (наприклад, у захищеному файлі `.env` або секреті). Не вимикайте перевірку TLS: підписаний індекс OCR автентифікує метадані релізу, а звичайна перевірка TLS і далі захищає транспорт та кожен інший вихідний запит.

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

`TRUST_PROXY` типово має значення `loopback,linklocal,uniquelocal`, тож SnapOtter довіряє `X-Forwarded-For` лише від вузла в приватній мережі. Зворотний проксі на тому самому хості, в мережі Docker або у вашій LAN є довіреним одразу, а отже обмеження частоти запитів, обмежувач перебору паролів під час входу, журнал аудиту та IP-список дозволених для enterprise бачать справжній IP клієнта без жодного налаштування.

Задавайте `TRUST_PROXY=true` лише тоді, коли проксі спереду звертається до SnapOtter з **публічної** адреси, наприклад балансувальник навантаження хмари в іншій мережі. На напряму доступному екземплярі це значення робить `request.ip` керованим зловмисником, оскільки абонент, який змінює заголовок, отримує новий бакет обмеження частоти на кожен запит.

Дві речі, які варто знати, перш ніж вимірювати IP клієнтів. Docker Desktop на macOS і Windows обслуговує опублікований порт через проксі користувацького простору, який переписує кожну адресу джерела на шлюз ВМ `192.168.65.1`, тому жодне значення `TRUST_PROXY` не відновлює справжнього клієнта там; для всього, що відкрито в інтернет, розгортайте на Linux. І на будь-якій платформі звернення до опублікованого порту через `localhost` сприймається як шлюз моста, а не як ваш клієнт, тож тест через localhost нічого не говорить про те, як визначається справжній клієнт. Повну таблицю значень `TRUST_PROXY` та застереження щодо Docker Desktop наведено в [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md#client-ip-resolution-trust_proxy).

Дві речі важливі для кожного проксі нижче: дозвольте великі тіла запитів (завантаження) і не буферизуйте відповіді. Проксі з буферизацією відповідей ламає SSE-прогрес і, що помітніше, змушує завантаження великого файлу «починатися, але ніколи не завершуватися», бо проксі утримує весь файл, перш ніж передати його далі. SnapOtter надсилає `X-Accel-Buffering: no` під час завантажень, щоб nginx передавав їх потоком, навіть якщо буферизацію ввімкнено деінде, але проксі, відмінні від nginx, потребують явного вимкнення буферизації відповідей (показано в кожній конфігурації нижче). Якщо завантаження зупиняється посередині, першим слід перевірити проксі з буферизацією спереду.

Примітка щодо HSTS: API саме надсилає `Strict-Transport-Security` у кожній відповіді, тож проксі, що передає заголовки відповіді далі (усі наведені нижче конфігурації так роблять), не потребує власного налаштування HSTS. Лише якщо ваш проксі налаштовано видаляти чи перевизначати заголовки відповіді від вихідного сервера, потрібно зберегти заголовок або додати його знову на межі.

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

### Розгортання за підшляхом {#subpath}

Щоб обслуговувати за адресою `https://example.com/snapotter`, задайте `BASE_PATH=/snapotter` у
середовищі контейнера SnapOtter і перезапустіть його. Офіційні файли Compose для CPU та GPU
також приймають `BASE_PATH` з вашої оболонки або файлу Compose `.env`. Той самий
образ працює за будь-яким шляхом; перезбирання фронтенду не потрібне.

`BASE_PATH` приймає сегменти, розділені похилою рискою, що містять літери, цифри, `_` або
`-`, зокрема вкладені шляхи, як-от `/apps/snapotter`. Кінцева похила риска
необов'язкова. Залиште значення порожнім (типово) або задайте `/` для розгортання в корені.

У наявному HTTPS-блоці server вашого Nginx використайте:

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

Цей приклад зберігає префікс. Проксі, які відкидають `/snapotter` перед
пересиланням, також підтримуються. Внутрішні перевірки стану можуть і далі використовувати
`/api/v1/health`. Для OIDC або SAML також задайте
`EXTERNAL_URL=https://example.com/snapotter` і оновіть
URL зворотних викликів постачальника ідентифікації, додавши `/snapotter/api/auth/oidc/callback` або
`/snapotter/api/auth/saml/callback` відповідно.

API-скрипти продовжують працювати без змін: URL у відповідях API, наприклад
`downloadUrl` інструмента, починаються з `/api/` незалежно від `BASE_PATH`. Додавайте їх до базового URL
вашого екземпляра (`https://example.com/snapotter` + `/api/v1/download/...`),
а не розв'язуйте відносно кореня домену.

Відкривайте інтерфейс за URL із префіксом (`https://example.com/snapotter`). Браузер,
що прийшов без префікса, автоматично перенаправляється туди; очікується, що лише API-запити
надходитимуть до застосунку без префікса. Якщо в журналах є
`Requests arrive under /snapotter/ but BASE_PATH is empty`, ваш проксі
пересилає префікс, який `BASE_PATH` не оголошує: задайте `BASE_PATH` відповідно,
або відкидайте префікс на проксі.

### Nginx Proxy Manager {#nginx-proxy-manager}

1. Додайте новий Proxy Host
2. Вкажіть у Domain Name ваш домен
3. Задайте Scheme `http`, Forward Hostname `SnapOtter` (або IP вашого контейнера), Forward Port `1349`
4. Увімкніть підтримку WebSocket
5. У розділі Advanced додайте: `client_max_body_size 500M;` і `proxy_buffering off;`

Заголовок `Strict-Transport-Security` від API проходить через NPM без змін; перемикач HSTS на вкладці SSL необов'язковий додатково.

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

Traefik пересилає заголовки відповіді від вихідного сервера без змін, тож заголовок `Strict-Transport-Security` від API доходить до браузерів без middleware `headers`. Якщо ви вже використовуєте middleware, що переписує заголовки відповіді, переконайтеся, що він не чіпає цей заголовок.

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

`flush_interval -1` вимикає буферизацію відповідей, що потрібно для подій SSE-прогресу (пакетна обробка, AI-інструменти, встановлення функцій) і для того, щоб завантаження великих файлів передавалися потоком, а не зупинялися. Подовжені тайм-аути дозволяють завершитися завантаженню великих файлів, не даючи Caddy закрити з'єднання завчасно. Caddy також передає заголовок `Strict-Transport-Security` від API без змін, тому директива `header` для HSTS не потрібна.

### Cloudflare Tunnels {#cloudflare-tunnels}

```bash
cloudflared tunnel --url http://localhost:1349
```

Примітка: Cloudflare має ліміт завантаження 100 МБ на безкоштовних планах. Задайте `MAX_UPLOAD_SIZE_MB=100` відповідно.

Тунель пересилає заголовки відповіді API, зокрема `Strict-Transport-Security`, тож налаштування HSTS у панелі керування не потрібне (власне налаштування HSTS на межі Cloudflare необов'язкове додатково).

## Усунення несправностей {#troubleshooting}

### «Postgres not reachable: EAI_AGAIN» одразу після невдалого першого запуску {#eai-again-after-failed-first-start}

Якщо найперший `docker compose up -d` завершується збоєм посередині (зазвичай через зайнятий порт), проста повторна спроба `up -d` може запустити контейнер застосунку без приєднання до мережі compose. Тоді застосунок входить у цикл аварійних перезапусків з помилкою:

```
Postgres not reachable: EAI_AGAIN
```

тоді як `docker ps` показує, що postgres справний. Помилка справжня, але вказує не на той контейнер: без мережі DNS для імені хоста `postgres` взагалі не може розв'язатися, а політика перезапуску безкінечно повторює ту саму помилку.

Усуньте те, що зламало перший запуск (зазвичай: звільніть порт), а потім примусово перестворіть контейнер застосунку, щоб він знову приєднався до мережі:

```bash
docker compose up -d --force-recreate SnapOtter
```

### Windows: доступно з інших пристроїв, але не з самого ПК {#windows-wsl2-loopback}

Коли Docker працює всередині WSL2 (типове налаштування Windows), стек може бути доступним з усіх інших машин вашої мережі, тоді як `http://localhost:1349` завершується тайм-аутом на самому хості Windows, навіть із увімкненим дзеркальним мережевим режимом WSL. Порт ніколи не з'являється у Windows `netstat`, а з контейнерами все гаразд.

Відкрийте застосунок з іншого пристрою або зсередини дистрибутива за його власною адресою (`hostname -I` в оболонці WSL). Якщо переспрямування localhost у вашій версії WSL випадково працює, сприймайте це як бонус, а не як те, на що можна покладатися.

## CI/CD {#ci-cd}

Репозиторій GitHub має три робочі процеси:

- **ci.yml**: запускається автоматично під час кожного push і PR. Виконує lint, перевірку типів, тести, збірку та валідує образ Docker (без публікації).
- **release.yml**: запускається вручну через `workflow_dispatch`. Запускає semantic-release для створення тегу версії та релізу GitHub, потім збирає багатоархітектурний образ Docker (amd64 + arm64) і публікує його в Docker Hub (`snapotter/snapotter`) та GitHub Container Registry (`ghcr.io/snapotter-hq/snapotter`).
- **deploy-docs.yml**: збирає цей сайт документації та розгортає його в Cloudflare Pages під час push до `main`.

Щоб створити реліз, перейдіть до **Actions > Release > Run workflow** в інтерфейсі GitHub або виконайте:

```bash
gh workflow run release.yml
```

Semantic-release визначає версію за історією комітів. Тег Docker `latest` завжди вказує на найновіший реліз.

## Аналітика {#analytics}

SnapOtter містить анонімну продуктову аналітику (шаблони використання інструментів, звіти про помилки), яка допомагає виявляти баги й покращувати функції. Вона ввімкнена типово. Ваші файли, назви файлів і персональні дані до неї ніколи не потрапляють. SnapOtter працює нормально з вимкненою аналітикою.

### Вимкнення аналітики {#disabling-analytics}

Вимкнення під час роботи виконується одним кліком адміністратора. Відкрийте Settings > System > Privacy і вимкніть Anonymous Product Analytics. Це негайно зупиняє аналітику для всього екземпляра, перезбирання не потрібне.

Для образу, який ніколи не зможе надсилати аналітику, задайте жорстке вимкнення на етапі збірки, клонувавши репозиторій і перезібравши:

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker/docker-compose.yml build --build-arg SNAPOTTER_ANALYTICS=off
docker compose -f docker/docker-compose.yml up -d
```

Або додайте build arg до наявного `docker-compose.yml`:

```yaml
services:
  snapotter:
    build:
      context: .
      dockerfile: docker/Dockerfile
      args:
        SNAPOTTER_ANALYTICS: "off"
```
