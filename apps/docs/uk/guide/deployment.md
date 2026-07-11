---
description: "Розгорніть SnapOtter у продакшені за допомогою Docker. Вимоги до апаратного забезпечення, налаштування GPU та конфігурації зворотного проксі для Nginx, Traefik і Cloudflare."
i18n_source_hash: 6b6957060fa6
i18n_provenance: machine
i18n_output_hash: 823840401d54
---

# Розгортання {#deployment}

SnapOtter розгортається як стек Docker Compose із 3 контейнерів: образ застосунку SnapOtter, PostgreSQL 17 і Redis 8. Образ застосунку підтримує **linux/amd64** (з NVIDIA CUDA для прискорення AI) і **linux/arm64** (CPU), тож він працює нативно на серверах Intel/AMD, на Mac з Apple Silicon і на ARM-пристроях на кшталт Raspberry Pi 4/5. Прискорення на iGPU Intel/AMD через VA-API, Quick Sync або OpenCL наразі не підтримується для AI-інференсу.

Див. [Docker Image](./docker-tags) щодо налаштування GPU, прикладів Docker Compose і фіксації версій.

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

Після цього застосунок доступний за адресою `http://localhost:1349`.

> **Обмеження швидкості Docker Hub?** Замініть `snapotter/snapotter:latest` на `ghcr.io/snapotter-hq/snapotter:latest`, щоб натомість завантажувати з GitHub Container Registry. Обидва реєстри отримують той самий образ при кожному релізі.

## Швидкий старт (NVIDIA CUDA) {#quick-start-nvidia-cuda}

Для прискорення через NVIDIA CUDA на AI-інструментах (видалення фону, збільшення роздільності, покращення облич, OCR):

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

## Вимоги до апаратного забезпечення {#hardware-requirements}

Ці цифри отримані з бенчмарків на низці систем, від сучасної робочої станції amd64 з NVIDIA RTX 4070 до Raspberry Pi, на яких запускали весь каталог інструментів і перебирали ліміти ресурсів Docker, щоб знайти реальний мінімум.

### Швидка довідка {#quick-reference}

| Рівень | Сценарій використання | CPU | RAM | GPU | Сховище |
|------|----------|-----|-----|-----|---------|
| Мінімальний | Інструменти для зображень, файлів і легкі PDF-інструменти; один користувач; невеликі пакети | 2 ядра | 2 GB | Немає | ~7 GB |
| Рекомендований | Усі п'ять модальностей, включно з відео, PDF та AI на CPU; пакети; кілька користувачів | 4 ядра | 4 GB | Немає | ~25 GB |
| Повний | Усе на швидкості, включно з GPU AI; великі пакети; багато користувачів | 6-8 ядер | 8 GB | NVIDIA 8 GB+ VRAM (12 GB комфортно) | ~35 GB |

**Архітектура: тільки 64-бітна** (`linux/amd64` або `linux/arm64`). SnapOtter працює нативно на серверах Intel/AMD, на Mac з Apple Silicon і на 64-бітних платах ARM, включно з **Raspberry Pi 4 і 5** (4-8 GB). Він **не** працює на 32-бітному ARM (`armv7`/`armhf`) — образ для нього не збирається — а також на платах класу 512 МБ, як-от Pi Zero, які нижчі за мінімум пам'яті (див. нижче).

### Мінімальний (інструменти для зображень, файлів і легкі PDF-інструменти; без AI) {#minimum-image-files-and-light-pdf-tools-no-ai}

| Ресурс | Вимога |
|---|---|
| CPU | 2 ядра |
| RAM | 2 GB |
| Диск | ~5.5 GB (образ) + том даних |
| GPU | Не потрібен |

Усі 222 не-AI інструменти каталогу — для зображень (зміна розміру, обрізання, конвертація, стиснення, коригування, водяний знак), відео (обрізання, вимкнення звуку, ремукс), аудіо (конвертація, нормалізація, обрізання), PDF (об'єднання, розділення, стиснення, обертання, захист), конвертації файлів і спеціальні пресети конвертації — працюють на скромному апаратному забезпеченні. Більшість операцій завершуються значно менш ніж за секунду навіть на великому файлі: зображення 2.7 MB змінює розмір за ~0.05 с і переклодовується у WebP за ~2 с.

Мінімум пам'яті реальний, за результатами перебору лімітів ресурсів Docker: **512 MB не можуть запустити стек** (навіть одна зміна розміру зображення завершується примусово), **1 GB** справляється з однофайловими операціями, але пакет із кількома файлами вичерпує пам'ять, а **2 GB / 2 ядра** — це найменша конфігурація, яка комфортно справляється з пакетами.

```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2G
```

**Єдиний виняток із високим навантаженням на CPU — це перекодування відео.** Операції з копіюванням потоку (обрізання, вимкнення звуку, ремукс контейнера) миттєві, але транскодування в інший кодек навантажує CPU. Кліп 1080p / 45 секунд, перекодований у VP9 (WebM), займає приблизно **~40 с** на швидкому сучасному CPU, ~45 с на Apple Silicon, ~80 с на старому мобільному 4-ядерному і **~130 с** на старому 4-ядерному сервері. Якщо ваше навантаження зорієнтоване на відео, надайте пріоритет ядрам CPU і тактовій частоті або підніміть ліміт `cpus:` контейнера — стандартний постачений compose обмежує застосунок 4 ядрами за замовчуванням (8 на GPU compose).

### Рекомендований (AI-інструменти на CPU) {#recommended-ai-tools-on-cpu}

| Ресурс | Вимога |
|---|---|
| CPU | 4 ядра |
| RAM | 4 GB |
| Диск | 3 GB (образ) + 24 GB (моделі AI) + робочий простір |
| GPU | Не потрібен (резервний варіант на CPU) |

**Саме встановлення AI-бандлів піднімає RAM до 4 GB.** Без встановленого AI застосунок у стані спокою займає близько 360 MB; з усіма сімома встановленими бандлами він тримає ~2.6 GB резидентно, оскільки Python AI-сайдкар попередньо завантажує свої моделі (видалення фону, збільшення роздільності, OCR, транскрипція, виявлення облич, реставрація) під час запуску. Не-AI встановлення залишаються легкими; AI-встановлення потребують ≥4 GB.

Більшість AI-інструментів цілком придатні до використання на CPU; парі з них справді потрібен GPU. Виміряно на сучасному 4-ядерному CPU:

| AI-інструмент | Час на CPU | Придатний на CPU? |
|---|---|---|
| Виявлення облич (blur-faces, smart-crop, red-eye), noise-removal | менш ніж 1 с | Так |
| OCR, транскрипція, субтитри | 1-3 с | Так |
| Colorize, покращення облич | ~10 с | Так |
| Видалення / заміна / розмиття фону | ~29 с | Так (доведеться зачекати) |
| AI-збільшення роздільності (RealESRGAN) | ~33 с для малих; хвилини на великих зображеннях | Гранично — GPU наполегливо рекомендується |
| Реставрація фото (повний конвеєр) | кілька хвилин | Ні — потрібен GPU або швидкий багатоядерний CPU |

SnapOtter навмисно не запікає ці завантаження моделей у образ Docker. AI-бандли завантажуються лише тоді, коли адміністратор вмикає відповідний інструмент, зберігаються в постійному томі `/data/ai` і використовуються спільно кожним інструментом, що залежить від того самого стеку моделей. Це зберігає фінальний образ контейнера малим, водночас дозволяючи повному AI-встановленню досягти більших чисел сховища нижче.

Деякі інструменти залежать від більш ніж одного спільного бандла. Наприклад, Passport Photo потребує і `background-removal`, і `face-detection`; якщо `background-removal` вже встановлено, увімкнення Passport Photo завантажує лише відсутній бандл `face-detection`. Те саме повторне використання застосовується до всіх AI-інструментів.

Розміри завантажень моделей AI:

| Бандл | Розмір на диску |
|---|---|
| Видалення фону | 4-5 GB |
| Upscale + Покращення облич + Видалення шуму | 5-6 GB |
| Виявлення облич | 200-300 MB |
| Стирання об'єктів + Colorize | 1-2 GB |
| OCR | 5-6 GB |
| Реставрація фото | 4-5 GB |
| **Усі бандли** | **~24 GB** |

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
| CPU | 6-8 ядер (підготовка відео + паралельність працюють на CPU навіть із GPU AI) |
| RAM | 8 GB |
| GPU | NVIDIA з 8+ GB VRAM (12 GB рекомендовано) |
| Диск | ~35 GB загалом |

NVIDIA GPU (CUDA) різко пришвидшує важкі моделі AI. Виміряно на RTX 4070 порівняно із сучасним CPU:

| AI-інструмент | Прискорення з GPU | Примітки |
|---|---|---|
| AI-збільшення роздільності (RealESRGAN 2×) | **~47×** | Найбільший виграш — менш ніж секунда проти ~33 с (хвилини на великих зображеннях) |
| Покращення облич (CodeFormer) | **~12×** | ~0.9 с проти ~11 с |
| Транскрипція (Whisper) | ~4.5× | |
| Видалення / заміна / розмиття фону | ~4× | ~7 с на GPU проти ~29 с на CPU |
| Colorize | ~1.8× | |
| OCR, виявлення облич, red-eye, noise-removal | ~1× | Уже швидкі на CPU — GPU не допомагає |
| Реставрація фото | немає | Обмежена CPU навіть на GPU (0% використання GPU); тут швидкий CPU важливіший за GPU |

Інструменти, для яких GPU того вартий, — це **upscale, покращення облич, транскрипція і видалення фону**. Виявлення облич, OCR і red-eye обмежені CPU й уже швидкі, тож GPU нічого не додає.

Пікове використання VRAM сягає 7.5 GB під час upscale з покращенням облич. NVIDIA GPU на 6 GB працює для більшості AI-інструментів окремо, але не впорається з upscale. VRAM 8-12 GB справляється з усім.

Прискорення на iGPU Intel/AMD через VA-API, Quick Sync або OpenCL наразі не підтримується для AI-інференсу. Проброс `/dev/dri` у контейнер не вмикає прискорення AI на GPU; SnapOtter запускатиме AI-інструменти на CPU, доки не буде доступний NVIDIA CUDA.

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

Паралельні запити зміни розміру зображень до стандартного контейнера застосунку, обмеженого 4 ядрами:

| Одночасні запити | Середній час відповіді | Помилки |
|---|---|---|
| 1 | 0.4с | 0 |
| 5 | 1.2с | 0 |
| 10 | 2.1с | 0 |

Час відповіді погіршується сублінійно без помилок у міру насичення пулу воркерів. Підняття ліміту `cpus:` контейнера застосунку (або використання хоста з більшою кількістю ядер) підіймає стелю. Зверніть увагу, що важкі завдання (транскодування відео, AI на CPU) утримують воркер на весь свій час виконання, тож підбирайте CPU під очікувану кількість одночасних важких завдань, а не лише під кількість запитів.

### Підтримувані формати зображень {#supported-image-formats}

SnapOtter підтримує **55+ вхідних форматів** і **14 вихідних форматів**, включно з RAW-файлами від 20+ брендів камер, професійними форматами (PSD, EPS, OpenEXR, HDR), сучасними кодеками (JPEG XL, AVIF, HEIC, QOI) та науковими/ігровими форматами (FITS, DDS).

Див. [повний перелік форматів](/uk/guide/supported-formats) щодо деталей про кожен підтримуваний формат, використовуваний декодер і доступні засоби контролю якості.

### Відомі обмеження {#known-limitations}

- **Зміна розміру з урахуванням вмісту** аварійно завершується на великих зображеннях (>5 MP) через обмеження в бінарному файлі caire. Добре працює з меншими зображеннями.
- **Декодування HEIF** займає 13-23 секунди. HEIC (варіант Apple) значно швидший — 0.3-0.9 секунди.
- **OCR для японської** дає збій на CPU через баг MKLDNN у PaddlePaddle. Працює на GPU.
- **Upscale** дає таймаут на CPU для всього, крім малих зображень. Для практичного використання потрібен GPU.
- **CodeFormer** для покращення облич значно повільніший за GFPGAN (53с проти 2с на GPU). GFPGAN рекомендовано для більшості сценаріїв.

## Томи {#volumes}

| Точка монтування / Том | Призначення | Обов'язковий? |
|---|---|---|
| `/data` (застосунок) | Моделі AI, Python venv, файли користувачів | **Так** — без нього втрата файлів |
| `/tmp/workspace` (застосунок) | Тимчасові файли обробки (автоочищення) | Рекомендовано |
| `SnapOtter-pgdata` (postgres) | Каталог даних PostgreSQL (користувачі, налаштування, конвеєри, завдання) | **Так** — без нього втрата даних |
| `SnapOtter-redisdata` (redis) | Append-only файл Redis для довговічних черг завдань | Рекомендовано |

### Bind mounts проти іменованих томів {#bind-mounts-vs-named-volumes}

**Іменовані томи** (рекомендовано) — Docker керує правами автоматично:
```yaml
volumes:
  - SnapOtter-data:/data
```

**Bind mounts** — правами керуєте ви. Встановіть `PUID`/`PGID` відповідно до вашого користувача хоста:
```yaml
volumes:
  - ./SnapOtter-data:/data
environment:
  - PUID=1000    # Your host UID (run: id -u)
  - PGID=1000    # Your host GID (run: id -g)
```

### Права доступу до сховища {#storage-permissions}

SnapOtter записує у два розташування під час виконання: `/data` (файли користувачів, логи, моделі AI і Python venv) та `/tmp/workspace` (тимчасовий робочий простір обробки). Обидва мають бути доступними для запису користувачем, від імені якого працює контейнер. Якщо хоч одне ні, контейнер **швидко дає збій під час запуску** з повідомленням, яке називає каталог, поточний UID/GID і як це виправити — замість того, щоб завантажитися «здоровим» і потім дати збій під час першого завантаження з незрозумілою помилкою.

Те, як обробляються права, залежить від того, як запускається контейнер:

**За замовчуванням (стартує від root, скидається до `snapotter`)** — точка входу стартує від root, виправляє власника змонтованих томів, потім скидається до непривілейованого користувача `snapotter` через `gosu`. Іменовані томи працюють без жодної конфігурації. Для bind mounts встановіть `PUID`/`PGID` на вашого користувача хоста (вище), щоб файли, які він записує, належали вам.

**Kubernetes / OpenShift (не-root через `runAsUser`)** — запущений безпосередньо від імені не-root користувача, контейнер не може сам змінити власника томів, тож оркестратор має зробити їх доступними для запису. Встановіть `fsGroup`:

```yaml
securityContext:
  runAsUser: 999
  runAsGroup: 999
  fsGroup: 999        # makes mounted volumes writable by the pod
```

Каталоги образу, доступні для запису, належать групі GID 0 і доступні для запису групі, тож под, що працює з **довільним UID** плюс кореневою додатковою групою (за замовчуванням в OpenShift), може записувати без жодного `chown`.

**TrueNAS Scale (та інші налаштування з «чужим UID»)** — TrueNAS запускає застосунки від імені не-root користувача (часто `568:568`) і монтує набори даних хоста, що належать іншому користувачу, тож ані точка входу, ані `fsGroup` не роблять їх доступними для запису самотужки. Оберіть одне:

- **Запустіть застосунок від root** (рекомендовано) — залиште користувача застосунку невстановленим або встановіть його на `0` і дайте стандартній точці входу виправити права і скинутися до `snapotter`.
- **Запустіть від UID `999`** — встановіть користувача/групу застосунку на `999:999` (вбудований користувач `snapotter` SnapOtter), щоб він відповідав власності образу.
- **`chown` набір даних хоста** на UID, від якого працює контейнер, з оболонки TrueNAS:

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
| `DEFAULT_PASSWORD` | `admin` | Початковий пароль адміністратора (примусова зміна при першому вході) |
| `MAX_UPLOAD_SIZE_MB` | `100` | Ліміт завантаження на файл |
| `MAX_BATCH_SIZE` | `100` | Максимум файлів на пакетний запит |
| `RATE_LIMIT_PER_MIN` | `1000` | Запити API за хвилину на IP (встановіть 0, щоб вимкнути) |
| `MAX_USERS` | `0` (необмежено) | Максимальна кількість облікових записів користувачів |
| `TRUST_PROXY` | `true` | Довіряти заголовкам X-Forwarded-For від зворотного проксі |
| `PUID` | `999` | Запускати з цим UID (для прав bind mount) |
| `PGID` | `999` | Запускати з цим GID (для прав bind mount) |
| `LOG_LEVEL` | `info` | Рівень деталізації логів: fatal, error, warn, info, debug, trace |
| `CONCURRENT_JOBS` | `0` (авто) | Максимум паралельних завдань обробки AI |
| `SESSION_DURATION_HOURS` | `168` | Тривалість сеансу входу (7 днів) |
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

SnapOtter встановлює `TRUST_PROXY=true` за замовчуванням, тож обмеження швидкості й логування використовують реальний IP клієнта із заголовків `X-Forwarded-For`.

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
5. В Advanced додайте: `client_max_body_size 500M;` і `proxy_buffering off;`

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

`flush_interval -1` вимикає буферизацію відповідей, що потрібно для подій прогресу SSE (пакетна обробка, AI-інструменти, встановлення функцій). Продовжені таймаути дозволяють завершити завантаження великих файлів без того, щоб Caddy передчасно закривав з'єднання.

### Cloudflare Tunnels {#cloudflare-tunnels}

```bash
cloudflared tunnel --url http://localhost:1349
```

Примітка: Cloudflare має ліміт завантаження 100 MB на безкоштовних планах. Встановіть `MAX_UPLOAD_SIZE_MB=100` відповідно.

## CI/CD {#ci-cd}

Репозиторій GitHub має три робочі процеси:

- **ci.yml** — Запускається автоматично при кожному push і PR. Виконує лінтинг, перевірку типів, тести, збирання і валідацію образу Docker (без push).
- **release.yml** — Запускається вручну через `workflow_dispatch`. Виконує semantic-release для створення тегу версії й релізу GitHub, потім збирає мультиархітектурний образ Docker (amd64 + arm64) і робить push у Docker Hub (`snapotter/snapotter`) та GitHub Container Registry (`ghcr.io/snapotter-hq/snapotter`).
- **deploy-docs.yml** — Збирає цей сайт документації і розгортає його в Cloudflare Pages при push до `main`.

Щоб створити реліз, перейдіть до **Actions > Release > Run workflow** в UI GitHub, або виконайте:

```bash
gh workflow run release.yml
```

Semantic-release визначає версію з історії комітів. Тег Docker `latest` завжди вказує на останній реліз.

## Аналітика {#analytics}

SnapOtter містить анонімну продуктову аналітику (шаблони використання інструментів, звіти про помилки), щоб допомогти виловлювати баги й покращувати функції. Вона увімкнена за замовчуванням. Ваші файли, імена файлів і персональні дані ніколи не є її частиною. SnapOtter працює нормально з вимкненою аналітикою.

### Вимкнення аналітики {#disabling-analytics}

Відмова під час виконання — це перемикач адміністратора в один клік. Відкрийте Settings > System > Privacy і вимкніть Anonymous Product Analytics. Вона зупиняється негайно для всього екземпляра, без потреби у повторному збиранні.

Для образу, який ніколи не може надсилати аналітику, встановіть жорстке вимкнення на етапі збирання, клонувавши репозиторій і зібравши повторно:

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker/docker-compose.yml build --build-arg SNAPOTTER_ANALYTICS=off
docker compose -f docker/docker-compose.yml up -d
```

Або додайте аргумент збирання до вашого наявного `docker-compose.yml`:

```yaml
services:
  snapotter:
    build:
      context: .
      dockerfile: docker/Dockerfile
      args:
        SNAPOTTER_ANALYTICS: "off"
```
