---
description: "Розгортання SnapOtter у production за допомогою Docker. Вимоги до обладнання, налаштування GPU та конфігурації зворотного проксі для Nginx, Traefik і Cloudflare."
i18n_source_hash: b8c4ed2cc086
i18n_provenance: machine
i18n_output_hash: fe102e99307f
i18n_hash_version: 2
---

# Розгортання {#deployment}

SnapOtter розгортається як стек Docker Compose із трьох контейнерів: образ застосунку SnapOtter, PostgreSQL 17 і Redis 8. Образ застосунку підтримує **linux/amd64** (з NVIDIA CUDA для прискорення AI) і **linux/arm64** (CPU), тому працює нативно на серверах Intel/AMD, Mac на Apple Silicon та ARM-пристроях на кшталт Raspberry Pi 4/5. Прискорення на інтегрованих GPU Intel/AMD через VA-API, Quick Sync або OpenCL для AI-інференсу наразі не підтримується.

Налаштування GPU, приклади Docker Compose і фіксацію версій див. у розділі [Docker Image](./docker-tags).

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

Наведений вище стек підключається від імені власника бази даних. Починаючи з SnapOtter 2.3.0, запити можна обслуговувати від ролі, яка лише читає та записує рядки; див. [Ролі з мінімальними привілеями](./database#least-privilege-roles).

> **Обмеження частоти запитів Docker Hub?** Замініть `snapotter/snapotter:latest` на `ghcr.io/snapotter-hq/snapotter:latest`, щоб завантажувати образ із GitHub Container Registry. Обидва реєстри отримують однаковий образ під час кожного релізу.

## Швидкий старт (NVIDIA CUDA) {#quick-start-nvidia-cuda}

Для прискорення NVIDIA CUDA в підтримуваних AI-інструментах (видалення фону, збільшення розмірів, покращення облич):

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

Якщо AI-інструменти працюють на CPU, хоча `--gpus all` і NVIDIA Container Toolkit налаштовано правильно, перевстановіть відповідний пакет (наприклад, Background Removal) у розділі **Settings → AI Features**. Інсталятор відновлює GPU-збірку ONNX Runtime, яку CPU-збірка, підтягнута іншим пакетом (наприклад, транскрибуванням), інакше може перекрити у спільному AI-середовищі. Якщо перевстановлення з інтерфейсу не відновлює GPU на старішому образі, див. ручне виправлення в [issue #490](https://github.com/snapotter-hq/SnapOtter/issues/490).

## Вимоги до обладнання {#hardware-requirements}

Ці цифри отримано за результатами тестів на різних системах, від сучасної робочої станції amd64 з NVIDIA RTX 4070 до Raspberry Pi: на кожній запускався весь каталог інструментів, а обмеження ресурсів Docker поступово змінювалися, щоб знайти реальну нижню межу.

Працюєте на слабкому кінці цих рівнів (Pi, старий ноутбук, VPS на 2 ГБ)? Розділ [Low-Resource Setups](/uk/guide/low-resource) перетворює ці цифри на конкретну покрокову інструкцію з налаштованими обмеженнями.

### Коротка довідка {#quick-reference}

| Рівень | Сценарій використання | CPU | RAM | GPU | Сховище |
|------|----------|-----|-----|-----|---------|
| Мінімальний | Інструменти без AI (зображення, файли, прості операції з PDF), а також вбудований Fast OCR і виявлення облич; один користувач; невеликі пакети | 2 ядра | 2 ГБ | Немає | ~7 ГБ |
| Рекомендований | Усі п'ять модальностей, зокрема відео, PDF і стандартні AI-пакети на CPU; пакетна обробка; кілька користувачів | 4 ядра | 4 ГБ (8 ГБ для HQ-інпейнтингу) | Немає | ~25 ГБ |
| Повний | Усе на повній швидкості, зокрема AI на GPU; великі пакети; багато користувачів | 6-8 ядер | 8 ГБ | NVIDIA з 8 ГБ+ VRAM (комфортно 12 ГБ) | ~35 ГБ |

**Архітектура: лише 64-бітна** (`linux/amd64` або `linux/arm64`). SnapOtter працює нативно на серверах Intel/AMD, Mac на Apple Silicon і 64-бітних ARM-платах, зокрема на **Raspberry Pi 4 і 5** (4-8 ГБ). Він **не** працює на 32-бітному ARM (`armv7`/`armhf`), оскільки образ для нього не збирається, а також на платах класу 512 МБ, як-от Pi Zero, що не досягають мінімального обсягу пам'яті (див. нижче).

### Мінімальний (інструменти для зображень, файлів і простий PDF; без AI) {#minimum-image-files-and-light-pdf-tools-no-ai}

| Ресурс | Вимога |
|---|---|
| CPU | 2 ядра |
| RAM | 2 ГБ |
| Диск | ~5,5 ГБ (образ) + том даних |
| GPU | Не потрібен |

Усі 222 інструменти каталогу без AI, а саме зображення (зміна розміру, обрізання, конвертація, стиснення, коригування, водяні знаки), відео (обрізання, вимкнення звуку, ремукс), аудіо (конвертація, нормалізація, обрізання), PDF (об'єднання, розділення, стиснення, обертання, захист), конвертація файлів і спеціальні пресети конвертації, працюють на скромному обладнанні. Більшість операцій завершується значно менш ніж за секунду навіть на великому файлі: зображення на 2,7 МБ змінює розмір приблизно за 0,05 с і перекодовується у WebP приблизно за 2 с.

Нижня межа пам'яті реальна, її визначено за перебором обмежень ресурсів Docker: **512 МБ недостатньо для запуску стеку** (навіть зміна розміру одного зображення завершується примусово), **1 ГБ** вистачає для операцій з одним файлом, але пакетна обробка кількох файлів вичерпує пам'ять, а **2 ГБ / 2 ядра** це найменша конфігурація, що комфортно справляється з пакетами без AI. Вбудований Fast OCR і пакет `face-detection` також вміщуються в 2 ГБ, тоді як більші AI-пакети (Whisper, LaMa/DDColor, rembg, RealESRGAN, відновлення фотографій і HQ-інпейнтинг SD1.5) потребують від 4 до 8 ГБ RAM, і запуск одразу відхиляється, якщо вільної пам'яті менше за поріг для відповідного пакета.

```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2G
```

**Єдиний виняток із високим навантаженням на CPU: перекодування відео.** Операції копіювання потоку (обрізання, вимкнення звуку, ремукс контейнера) виконуються миттєво, а транскодування в інший кодек залежить від CPU. Кліп 1080p тривалістю 45 секунд, перекодований у VP9 (WebM), займає приблизно **~40 с** на швидкому сучасному CPU, ~45 с на Apple Silicon, ~80 с на старішому мобільному 4-ядерному процесорі та **~130 с** на старішому 4-ядерному сервері. Якщо ваше навантаження переважно відео, віддавайте перевагу кількості ядер і тактовій частоті або збільште ліміт `cpus:` для контейнера: поставлений compose-файл за замовчуванням обмежує застосунок 4 ядрами (8 у GPU-варіанті compose).

### Рекомендований (AI-інструменти на CPU) {#recommended-ai-tools-on-cpu}

| Ресурс | Вимога |
|---|---|
| CPU | 4 ядра |
| RAM | 4 ГБ |
| Диск | 3 ГБ (образ) + близько 20 ГБ (усі необов'язкові AI-пакети) + робочий простір |
| GPU | Не потрібен (запасний варіант на CPU) |

**Саме встановлення та запуск великих AI-пакетів піднімає рекомендацію до 4 ГБ RAM.** Без жодних необов'язкових пакетів застосунок у спокої займає близько 360 МБ. Застарілі Python-інструменти спільно використовують один sidecar, а точний OCR працює через окремий довгоживучий диспетчер, прив'язаний до активного незмінного покоління. Перед активацією інсталятор запускає smoke-тест кандидата. Потім він атомарно перемикається на новий диспетчер і зливає попередній диспетчер до збирання сміття. Кожен офіційний артефакт точного OCR має пройти набір релізних перевірок для найгіршого випадку в межах cgroup на 4 ГіБ, а рекомендація 4 ГБ для хоста залишає запас для застосунку Node.js, Postgres, Redis, черг і одночасної роботи.

Більшість AI-інструментів цілком придатні для роботи на CPU; для кількох справді потрібен GPU. Виміри на сучасному 4-ядерному CPU:

| AI-інструмент | Час на CPU | Придатний для CPU? |
|---|---|---|
| Виявлення облич (blur-faces, smart-crop, red-eye), noise-removal | менше 1 с | Так |
| OCR, транскрибування, субтитри | 1-3 с | Так |
| Розфарбування, покращення облич | ~10 с | Так |
| Видалення / заміна / розмиття фону | ~29 с | Так (доведеться почекати) |
| AI-збільшення (RealESRGAN) | ~33 с для малих; хвилини для великих зображень | З застереженнями: наполегливо рекомендується GPU |
| Відновлення фотографій (повний конвеєр) | кілька хвилин | Ні: потрібен GPU або швидкий багатоядерний CPU |

SnapOtter свідомо не вбудовує ці моделі в образ Docker. AI-пакети завантажуються лише тоді, коли адміністратор вмикає відповідний інструмент, зберігаються в постійному томі `/data/ai` і спільно використовуються всіма інструментами, що залежать від того самого набору моделей. Це зберігає кінцевий образ контейнера невеликим, а повна AI-інсталяція все одно може досягти більших обсягів сховища, наведених нижче.

Деякі інструменти залежать від кількох спільних пакетів. Наприклад, Passport Photo потребує і `background-removal`, і `face-detection`; якщо `background-removal` уже встановлено, ввімкнення Passport Photo завантажить лише відсутній пакет `face-detection`. Те саме повторне використання діє для всіх AI-інструментів.

Обсяг сховища необов'язкових AI-пакетів і пороги пам'яті CPU (SnapOtter перевіряє доступну пам'ять перед передаванням у Python sidecar і одразу відхиляє запуски, якщо вільної пам'яті менше за поріг пакета):

| Пакет | Розмір на диску | Поріг пам'яті CPU |
|---|---|---|
| Виявлення облич | 200-300 МБ | 2 ГБ RAM хоста (~0,5 ГБ вільно) |
| Транскрибування | ~600 МБ | 4 ГБ RAM хоста (~2 ГБ вільно) |
| Видалення об'єктів + Розфарбування | 1-2 ГБ | 4 ГБ RAM хоста (~2 ГБ вільно) |
| Точний OCR (`balanced`/`best`) | ~208-234 МіБ завантаження / ~409-488 МіБ після встановлення | 4 ГіБ налаштованої ефективної пам'яті (`fast` працює на 2 ГБ) |
| Видалення фону | 4-5 ГБ | 4 ГБ RAM хоста (~2,5 ГБ вільно) |
| Збільшення + Покращення облич + Видалення шуму | 5-6 ГБ | 4 ГБ RAM хоста (~2,5 ГБ вільно) |
| Відновлення фотографій | 4-5 ГБ | 4 ГБ RAM хоста (~3 ГБ вільно) |
| Високоякісний інпейнтинг (`inpaint-hq`) | 5-7 ГБ | 8 ГБ RAM хоста (~6 ГБ вільно) |
| **Усі пакети** | **~25 ГБ після встановлення** | **4 ГБ (8 ГБ з `inpaint-hq`)** |

Fast OCR вбудовано в образ через Tesseract, він додає близько 25 МіБ і не потребує необов'язкового OCR-пакета та його вимоги в 4 ГіБ пам'яті. Fast підтримує `auto`, `en`, `de`, `es`, `fr`, `zh` і `ja`, але не підтримує корейську (`ko`) і арабську (`ar`). Обидві використовують `balanced` або `best`, тому потребують точного пакета. Точний пакет доступний в офіційних контейнерах Linux amd64 і arm64 та запускає ONNX Runtime на CPU. Хости з NVIDIA використовують той самий OCR-рантайм на CPU, тож OCR не залежить від версії CUDA чи архітектури GPU. Точному рантайму потрібно щонайменше 4 ГіБ ефективної пам'яті: налаштований ліміт cgroup контейнера, а за його відсутності пам'ять хоста. SnapOtter відхиляє системи нижче цього підписаного мінімуму сумісності ще до завантаження пакета. Встановлення точного пакета також відхиляється на bare-metal/попередньо зібраних архівах, для яких не можна гарантувати сумісність libc і Python ABI. На таких непідтримуваних хостах корейський і арабський OCR повертають явну помилку несумісності й ніколи мовчки не перемикаються на Fast.

Репліки, що спільно використовують один `DATA_DIR`, мають використовувати ту саму архітектуру CPU; закріплюйте розгортання з кількома репліками за допомогою node affinity. Змішані репліки amd64/arm64 потребують окремих томів даних і незалежних розгортань SnapOtter.

Точний рантайм зберігає одне активне покоління і очищає кеш завантаження після активації. У цьому релізі перше встановлення тимчасово потребує приблизно 620-720 МіБ для архіву та проміжного розміщення, а оновлення може сягати піку близько 1,2 ГіБ, поки старе покоління лишається активним. Інсталятор обчислює точну вимогу за підписаним індексом і поточними поколіннями до завантаження чи розпакування та завчасно завершується помилкою, якщо том даних замалий.

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
| CPU | 6-8 ядер (підготовка відео та паралельність працюють на CPU навіть при AI на GPU) |
| RAM | 8 ГБ |
| GPU | NVIDIA з 8+ ГБ VRAM (рекомендовано 12 ГБ) |
| Диск | ~35 ГБ загалом |

GPU NVIDIA (CUDA) різко прискорює важкі AI-моделі. Виміри на RTX 4070 порівняно з сучасним CPU:

| AI-інструмент | Прискорення на GPU | Примітки |
|---|---|---|
| AI-збільшення (RealESRGAN 2×) | **~47×** | Найбільший виграш: менше секунди проти ~33 с (хвилини на великих зображеннях) |
| Покращення облич (CodeFormer) | **~12×** | ~0,9 с проти ~11 с |
| Транскрибування (Whisper) | ~4,5× | |
| Видалення / заміна / розмиття фону | ~4× | ~7 с на GPU проти ~29 с на CPU |
| Розфарбування | ~1,8× | |
| OCR, виявлення облич, red-eye, noise-removal | ~1× | Уже швидко на CPU: GPU не допомагає |
| Відновлення фотографій | немає | Залежить від CPU навіть на GPU (0% завантаження GPU); тут швидкий CPU важливіший за GPU |

GPU варто мати для **збільшення, покращення облич, транскрибування та видалення фону**. Виявлення облич, OCR і red-eye залежать від CPU та й так швидкі, тож GPU нічого не додає.

Пікове використання VRAM сягає 7,5 ГБ під час збільшення з покращенням облич. GPU NVIDIA на 6 ГБ підходить для більшості AI-інструментів окремо, але не впорається зі збільшенням. 8-12 ГБ VRAM вистачає для всього.

Прискорення на інтегрованих GPU Intel/AMD через VA-API, Quick Sync або OpenCL для AI-інференсу наразі не підтримується. Прокидання `/dev/dri` у контейнер не вмикає GPU-прискорення AI; SnapOtter виконуватиме AI-інструменти на CPU, якщо NVIDIA CUDA недоступна.

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

Паралельні запити на зміну розміру зображень до контейнера застосунку з типовим обмеженням 4 ядра:

| Одночасні запити | Середній час відповіді | Помилки |
|---|---|---|
| 1 | 0,4 с | 0 |
| 5 | 1,2 с | 0 |
| 10 | 2,1 с | 0 |

Час відповіді зростає сублінійно без помилок, поки пул воркерів насичується. Збільшення ліміту `cpus:` для контейнера застосунку (або використання хоста з більшою кількістю ядер) піднімає стелю. Зверніть увагу, що важкі завдання (транскодування відео, AI на CPU) утримують воркер протягом усього часу виконання, тож підбирайте CPU під очікувану кількість одночасних важких завдань, а не лише кількість запитів.

### Підтримувані формати зображень {#supported-image-formats}

SnapOtter підтримує **55+ вхідних форматів** і **14 вихідних форматів**, зокрема RAW-файли від понад 20 виробників камер, професійні формати (PSD, EPS, OpenEXR, HDR), сучасні кодеки (JPEG XL, AVIF, HEIC, QOI) і наукові та ігрові формати (FITS, DDS).

Докладніше про кожен підтримуваний формат, використовуваний декодер і доступні параметри якості див. у [повному списку форматів](/uk/guide/supported-formats).

### Відомі обмеження {#known-limitations}

- **Content-aware resize** аварійно завершується на великих зображеннях (>5 МП) через обмеження бінарного файлу caire. На менших зображеннях працює нормально.
- **Декодування HEIF** займає 13-23 секунди. HEIC (варіант Apple) значно швидший: 0,3-0,9 секунди.
- **Збільшення** на CPU завершується за тайм-аутом для всього, що більше за малі зображення. Для практичного використання потрібен GPU.
- **Покращення облич CodeFormer** значно повільніше за GFPGAN (53 с проти 2 с на GPU). Для більшості випадків рекомендується GFPGAN.

## Томи {#volumes}

| Монтування / том | Призначення | Обов'язковий? |
|---|---|---|
| `/data` (app) | AI-моделі, Python venv, файли користувачів | **Так**: без нього файли втрачаються |
| `/tmp/workspace` (app) | Тимчасові файли обробки (очищаються автоматично) | Рекомендований |
| `SnapOtter-pgdata` (postgres) | Каталог даних PostgreSQL (користувачі, налаштування, конвеєри, завдання) | **Так**: без нього дані втрачаються |
| `SnapOtter-redisdata` (redis) | Append-only файл Redis для стійких черг завдань | Рекомендований |

### Bind mounts і іменовані томи {#bind-mounts-vs-named-volumes}

**Іменовані томи** (рекомендовано): Docker керує правами доступу автоматично:
```yaml
volumes:
  - SnapOtter-data:/data
```

**Bind mounts**: правами керуєте ви. Установіть `PUID`/`PGID` відповідно до користувача хоста:
```yaml
volumes:
  - ./SnapOtter-data:/data
environment:
  - PUID=1000    # Your host UID (run: id -u)
  - PGID=1000    # Your host GID (run: id -g)
```

### Права доступу до сховища {#storage-permissions}

Під час роботи SnapOtter записує в два розташування: `/data` (файли користувачів, журнали, AI-моделі та Python venv) і `/tmp/workspace` (тимчасовий робочий простір обробки). Обидва мають бути доступні для запису користувачу, від імені якого працює контейнер. Якщо це не так, контейнер **негайно завершується під час запуску** з повідомленням, що називає каталог, поточні UID/GID та спосіб виправлення, замість того щоб стартувати як «здоровий», а потім завершитися незрозумілою помилкою на першому ж завантаженні. Каталог журналів (`LOG_DIR`, `/data/logs` в образі) перевіряється так само в усіх режимах сховища, оскільки журнали залишаються локальними, навіть коли файли зберігаються в S3.

Як саме обробляються права, залежить від способу запуску контейнера:

**За замовчуванням (старт від root, перехід на `snapotter`)**: entrypoint стартує від root, виправляє власника змонтованих томів, а потім переходить до непривілейованого користувача `snapotter` через `gosu`. Іменовані томи працюють без жодного налаштування. Для bind mounts установіть `PUID`/`PGID` відповідно до вашого користувача на хості (див. вище), щоб створені файли належали вам.

**Kubernetes / OpenShift (не від root через `runAsUser`)**: контейнер, запущений одразу від користувача без прав root, не може сам виконати chown для томів, тож оркестратор має зробити їх доступними для запису. Установіть `fsGroup`:

```yaml
securityContext:
  runAsUser: 999
  runAsGroup: 999
  fsGroup: 999        # makes mounted volumes writable by the pod
```

Каталоги образу, доступні для запису, належать групі з GID 0 і мають права запису для групи, тому pod, що працює з **довільним UID** та додатковою групою root (типове значення в OpenShift), може записувати без `chown`.

**TrueNAS Scale (та інші конфігурації з «чужим UID»)**: TrueNAS запускає застосунки від користувача без прав root (часто `568:568`) і монтує набори даних хоста, власником яких є інший користувач, тому ні entrypoint, ні `fsGroup` самі по собі не роблять їх доступними для запису. Оберіть один із варіантів:

- **Запустити застосунок від root** (рекомендовано): залиште користувача застосунку незаданим або встановіть `0`, і нехай entrypoint за замовчуванням виправить права та перейде до `snapotter`.
- **Запустити з UID `999`**: встановіть користувача/групу застосунку `999:999` (вбудований користувач SnapOtter `snapotter`), щоб вони збігалися з власником у образі.
- **Виконати `chown` для набору даних хоста** на UID, від якого працює контейнер, з оболонки TrueNAS:

  ```bash
  # Use the UID from the startup error (or run `id` inside the container)
  chown -R 568:568 /mnt/<pool>/<dataset>
  ```

Помилка запуску називає точний UID, тож найшвидший шлях: один раз запустити застосунок, прочитати повідомлення, а потім виконати `chown` (або змінити користувача) відповідно.

## Змінні середовища {#environment-variables}

| Змінна | Типове значення | Опис |
|---|---|---|
| `AUTH_ENABLED` | `true` | Увімкнути/вимкнути вимогу входу |
| `DEFAULT_USERNAME` | `admin` | Ім'я початкового адміністратора |
| `DEFAULT_PASSWORD` | `admin` | Початковий пароль адміністратора (примусова зміна під час першого входу) |
| `MAX_UPLOAD_SIZE_MB` | `0` (без обмежень) | Ліміт завантаження одного файла в МБ. Образ постачається з `0`; збірка з вихідного коду починається зі 100 |
| `MAX_BATCH_SIZE` | `0` (без обмежень) | Максимальна кількість файлів в одному пакетному запиті. Образ постачається з `0`; збірка з вихідного коду починається зі 100 |
| `RATE_LIMIT_PER_MIN` | `1000` | API-запитів на хвилину з одного IP (0 вимикає обмеження) |
| `MAX_USERS` | `0` (без обмежень) | Максимальна кількість облікових записів користувачів |
| `TRUST_PROXY` | `loopback,linklocal,uniquelocal` | Які вузли можуть задавати IP клієнта через `X-Forwarded-For`. За замовчуванням лише приватні мережі |
| `PUID` | `999` | Запускати від цього UID (для прав доступу bind mount) |
| `PGID` | `999` | Запускати від цього GID (для прав доступу bind mount) |
| `LOG_LEVEL` | `info` | Деталізація журналу: fatal, error, warn, info, debug, trace |
| `CONCURRENT_JOBS` | `0` (авто) | Максимальна кількість паралельних завдань AI-обробки |
| `SESSION_DURATION_HOURS` | `168` | Тривалість сесії входу (7 днів) |
| `CORS_ORIGIN` | (порожньо) | Дозволені origin через кому, або порожньо для same-origin |

### Вихідний проксі та приватний ЦС {#outbound-proxy-and-private-ca}

Офіційний контейнер вмикає підтримку проксі зі змінних середовища в Node. Якщо SnapOtter має звертатися до репозиторію OCR-рантайму чи інших HTTPS-сервісів через корпоративний проксі, задайте `HTTPS_PROXY` (і за потреби `HTTP_PROXY`). Задайте `NO_PROXY` як список через кому хостів, до яких слід звертатися напряму, наприклад Postgres, Redis і внутрішнє об'єктне сховище.

Якщо проксі або внутрішній сервіс підписано приватним центром сертифікації, змонтуйте сертифікат ЦС лише для читання та вкажіть шлях до нього в `NODE_EXTRA_CA_CERTS`. Файл має існувати на момент запуску процесу Node:

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

Зберігайте облікові дані проксі поза файлом Compose (наприклад, у захищеному файлі `.env` або секреті). Не вимикайте перевірку TLS: підписаний індекс OCR автентифікує метадані релізу, а звичайна перевірка TLS і далі захищає транспорт та усі інші вихідні запити.

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

`TRUST_PROXY` за замовчуванням має значення `loopback,linklocal,uniquelocal`, тому SnapOtter довіряє `X-Forwarded-For` лише від вузла в приватній мережі. Зворотний проксі на тому самому хості, у мережі Docker чи у вашій локальній мережі є довіреним одразу, тож обмеження частоти запитів, обмежувач підбору паролів під час входу, журнал аудиту та enterprise-список дозволених IP бачать справжній IP клієнта без жодного налаштування.

Задавайте `TRUST_PROXY=true` лише тоді, коли проксі перед застосунком звертається до SnapOtter з **публічної** адреси, наприклад хмарний балансувальник навантаження в іншій мережі. На напряму відкритому екземплярі це значення робить `request.ip` підконтрольним зловмиснику, оскільки той, хто змінює заголовок, отримує новий кошик обмеження частоти на кожен запит.

Дві речі слід знати, перш ніж вимірювати IP клієнтів. Docker Desktop на macOS і Windows обслуговує опублікований порт через проксі в просторі користувача, який переписує кожну адресу джерела на шлюз ВМ `192.168.65.1`, тому жодне значення `TRUST_PROXY` не відновить справжнього клієнта; для всього, що доступне з інтернету, розгортайте на Linux. І на будь-якій платформі звернення до опублікованого порту через `localhost` відображається як шлюз мосту, а не як ваш клієнт, тож тест через localhost нічого не каже про те, як визначається справжній клієнт. Повну таблицю значень `TRUST_PROXY` та застереження щодо Docker Desktop наведено в [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md#client-ip-resolution-trust_proxy).

Для кожного з наведених нижче проксі важливі дві речі: дозволити великі тіла запитів (завантаження) і не буферизувати відповіді. Проксі з буферизацією відповідей ламає SSE-прогрес і, що помітніше, змушує завантаження великого файла «починатися, але ніколи не завершуватися», бо проксі утримує весь файл, перш ніж передати його далі. SnapOtter надсилає `X-Accel-Buffering: no` під час завантажень, тож nginx передає їх потоком, навіть якщо буферизація ввімкнена деінде, але для проксі, відмінних від nginx, буферизацію відповідей потрібно вимкнути явно (показано в кожній конфігурації нижче). Якщо завантаження зупиняється на півдорозі, першим слід перевірити проксі з буферизацією перед застосунком.

Зауваження про HSTS: API саме надсилає `Strict-Transport-Security` у кожній відповіді, тож проксі, який передає заголовки відповіді без змін (усі конфігурації нижче так і роблять), не потребує власного налаштування HSTS. Лише якщо ваш проксі налаштований вилучати або перевизначати заголовки відповіді вищого рівня, потрібно зберегти цей заголовок або додати його знову на межі.

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

Щоб обслуговувати застосунок за адресою `https://example.com/snapotter`, задайте `BASE_PATH=/snapotter` у середовищі
контейнера SnapOtter і перезапустіть його. Офіційні файли Compose для CPU і GPU
також приймають `BASE_PATH` з вашої оболонки або з файлу Compose `.env`. Той самий
образ працює за будь-яким шляхом; перебудовувати фронтенд не потрібно.

`BASE_PATH` приймає сегменти, розділені слешами, що містять літери, цифри, `_` або
`-`, зокрема вкладені шляхи на кшталт `/apps/snapotter`. Кінцевий слеш
необов'язковий. Для розгортання в корені залиште значення порожнім (за замовчуванням) або задайте `/`.

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

Цей приклад зберігає префікс. Проксі, що вилучають `/snapotter` перед
пересиланням, також підтримуються. Внутрішні перевірки стану можуть і далі використовувати
`/api/v1/health`. Для OIDC або SAML також задайте
`EXTERNAL_URL=https://example.com/snapotter` та оновіть зворотні URL
постачальника ідентифікації, додавши `/snapotter/api/auth/oidc/callback` або
`/snapotter/api/auth/saml/callback` відповідно.

API-скрипти продовжують працювати без змін: URL у відповідях API, наприклад
`downloadUrl` інструмента, починаються з `/api/` незалежно від `BASE_PATH`. Додавайте їх до
базового URL вашого екземпляра (`https://example.com/snapotter` + `/api/v1/download/...`),
а не розв'язуйте відносно кореня домену.

Відкривайте інтерфейс за URL із префіксом (`https://example.com/snapotter`). Браузер,
що прийшов без префікса, автоматично перенаправляється; очікується, що без префікса до застосунку
звертаються лише API-запити. Якщо в журналах є
`Requests arrive under /snapotter/ but BASE_PATH is empty`, ваш проксі
пересилає префікс, який `BASE_PATH` не оголошує: задайте його в `BASE_PATH`
або вилучайте префікс на проксі.

### Nginx Proxy Manager {#nginx-proxy-manager}

1. Додайте новий Proxy Host
2. Укажіть у Domain Name свій домен
3. Установіть Scheme у `http`, Forward Hostname у `SnapOtter` (або IP вашого контейнера), Forward Port у `1349`
4. Увімкніть підтримку WebSocket
5. У розділі Advanced додайте: `client_max_body_size 500M;` і `proxy_buffering off;`

Заголовок `Strict-Transport-Security` від API проходить через NPM без змін; перемикач HSTS на вкладці SSL необов'язковий додатково до нього.

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

Traefik пересилає заголовки відповіді вищого рівня без змін, тож заголовок `Strict-Transport-Security` від API доходить до браузерів без middleware `headers`. Якщо ви вже використовуєте такий, що переписує заголовки відповіді, переконайтеся, що він не чіпає цей заголовок.

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

`flush_interval -1` вимикає буферизацію відповідей, що потрібно для подій прогресу SSE (пакетна обробка, AI-інструменти, встановлення функцій) і для того, щоб завантаження великих файлів передавалися потоком, а не зупинялися. Збільшені тайм-аути дозволяють завершити завантаження великих файлів, не даючи Caddy закрити з'єднання завчасно. Caddy також пропускає заголовок `Strict-Transport-Security` від API без змін, тож директива `header` для HSTS не потрібна.

### Cloudflare Tunnels {#cloudflare-tunnels}

```bash
cloudflared tunnel --url http://localhost:1349
```

Примітка: у безкоштовних планах Cloudflare діє ліміт завантаження 100 МБ. Задайте `MAX_UPLOAD_SIZE_MB=100` відповідно.

Тунель пересилає заголовки відповіді API, зокрема `Strict-Transport-Security`, тож налаштовувати HSTS у панелі керування не потрібно (власне налаштування HSTS на межі Cloudflare необов'язкове додатково).

## Усунення несправностей {#troubleshooting}

### «Postgres not reachable: EAI_AGAIN» одразу після невдалого першого запуску {#eai-again-after-failed-first-start}

Якщо найперший `docker compose up -d` завершується помилкою на півдорозі (зазвичай через зайнятий порт), звичайний повторний `up -d` може запустити контейнер застосунку, не підключивши його до мережі compose. Тоді застосунок безкінечно перезапускається з помилкою:

```
Postgres not reachable: EAI_AGAIN
```

тоді як `docker ps` показує, що postgres справний. Помилка справжня, але вказує не на той контейнер: без мережі DNS для імені хоста `postgres` узагалі не розв'язується, а політика перезапуску безкінечно повторює ту саму помилку.

Усуньте причину, через яку не вдався перший запуск (зазвичай: звільніть порт), а потім примусово перестворіть контейнер застосунку, щоб він знову підключився до мережі:

```bash
docker compose up -d --force-recreate SnapOtter
```

### Windows: доступно з інших пристроїв, але не з самого ПК {#windows-wsl2-loopback}

Якщо Docker працює всередині WSL2 (типове налаштування Windows), стек може бути доступним з усіх інших машин вашої мережі, тоді як `http://localhost:1349` перевищує час очікування на самому хості Windows, навіть коли ввімкнено дзеркальний мережевий режим WSL. Порт ніколи не з'являється в `netstat` Windows, і з контейнерами все гаразд.

Відкрийте застосунок з іншого пристрою або зсередини дистрибутива за його власною адресою (`hostname -I` в оболонці WSL). Якщо пересилання localhost у вашій версії WSL випадково працює, вважайте це бонусом, а не тим, на що можна покладатися.

## CI/CD {#ci-cd}

Репозиторій GitHub має три робочі процеси:

- **ci.yml**: запускається автоматично при кожному push і PR. Виконує lint, перевірку типів, тести, збірку та перевірку образу Docker (без публікації).
- **release.yml**: запускається вручну через `workflow_dispatch`. Виконує semantic-release для створення тега версії та релізу GitHub, потім збирає багатоархітектурний образ Docker (amd64 + arm64) і публікує його на Docker Hub (`snapotter/snapotter`) та в GitHub Container Registry (`ghcr.io/snapotter-hq/snapotter`).
- **deploy-docs.yml**: збирає цей сайт документації та розгортає його на Cloudflare Pages при push у `main`.

Щоб створити реліз, перейдіть до **Actions > Release > Run workflow** в інтерфейсі GitHub або виконайте:

```bash
gh workflow run release.yml
```

Semantic-release визначає версію за історією комітів. Тег Docker `latest` завжди вказує на найновіший реліз.

## Аналітика {#analytics}

SnapOtter містить анонімну продуктову аналітику (шаблони використання інструментів, звіти про помилки), щоб допомагати виявляти помилки та покращувати функції. Вона ввімкнена за замовчуванням. Ваші файли, імена файлів і персональні дані до неї ніколи не потрапляють. SnapOtter працює у звичайному режимі й з вимкненою аналітикою.

### Вимкнення аналітики {#disabling-analytics}

Вимкнення під час роботи виконується одним кліком адміністратора. Відкрийте Settings > System > Privacy і вимкніть Anonymous Product Analytics. Аналітика одразу припиняється для всього екземпляра, перебудовувати нічого не потрібно.

Щоб отримати образ, який ніколи не може надсилати аналітику, задайте жорстке вимкнення на етапі збірки, клонувавши репозиторій і перезібравши образ:

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker/docker-compose.yml build --build-arg SNAPOTTER_ANALYTICS=off
docker compose -f docker/docker-compose.yml up -d
```

Або додайте аргумент збірки до наявного `docker-compose.yml`:

```yaml
services:
  snapotter:
    build:
      context: .
      dockerfile: docker/Dockerfile
      args:
        SNAPOTTER_ANALYTICS: "off"
```
