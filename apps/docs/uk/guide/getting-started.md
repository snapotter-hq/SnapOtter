---
description: "Встановіть SnapOtter за допомогою Docker однією командою. Включає налаштування Docker Compose, збірку з вихідного коду та повний огляд можливостей."
i18n_source_hash: d2366a2e051c
i18n_provenance: human
i18n_output_hash: c461938653fd
---

# Початок роботи {#getting-started}

::: tip Спробуйте перед встановленням
Ознайомтеся з повним інтерфейсом на [demo.snapotter.com](https://demo.snapotter.com) - без реєстрації чи встановлення.
:::

## Швидкий старт {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

Цей єдиний контейнер запускає все необхідне: без встановленого `DATABASE_URL` він запускає власні PostgreSQL та Redis на інтерфейсі loopback (вбудований режим) і зберігає всі дані в томі `SnapOtter-data`. Це найшвидший спосіб спробувати SnapOtter або розгорнути на власному homelab. Для промислового використання запустіть стек [Docker Compose](#docker-compose) нижче, який тримає PostgreSQL та Redis в окремих контейнерах. Вбудований режим працює від імені root (за замовчуванням) і автоматично вимикається, щойно ви встановите `DATABASE_URL`.

Під час першого входу вас попросять змінити пароль.

::: tip Анонімна аналітика продукту
SnapOtter включає анонімну аналітику продукту за замовчуванням. Щоб вимкнути її, відкрийте **Settings → System → Privacy** і вимкніть **Anonymous Product Analytics**. Вона одразу зупиняється для всього інстансу.

Докладніше про те, що збирається, див. [Що збирає SnapOtter](/uk/guide/telemetry).
:::

::: tip Прискорення NVIDIA CUDA
Додайте `--gpus all` для видалення фону, збільшення, OCR, покращення облич та реставрації з прискоренням NVIDIA CUDA:

```bash
docker run -d --name SnapOtter -p 1349:1349 --gpus all -v SnapOtter-data:/data snapotter/snapotter:latest
```

Потребує [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html). Автоматично повертається до CPU, коли CUDA недоступна. Прискорення iGPU Intel/AMD через VA-API, Quick Sync чи OpenCL наразі не підтримується для AI-інференсу. Див. [Теги Docker](/uk/guide/docker-tags) для тестів продуктивності.
:::

::: details Також на GHCR
```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data ghcr.io/snapotter-hq/snapotter:latest
```

Обидва реєстри публікують той самий образ при кожному випуску.
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

Див. [Налаштування](/uk/guide/configuration) для всіх змінних середовища.

## Збірка з вихідного коду {#build-from-source}

**Передумови:** Node.js 22+, pnpm 9+, Docker (для Postgres + Redis), Python 3.10+ (для AI-можливостей), Git.

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker-compose.dev.yml up -d   # start Postgres + Redis
pnpm install
pnpm dev
```

- Фронтенд: [http://localhost:1349](http://localhost:1349)
- Бекенд: [http://localhost:13490](http://localhost:13490)

## Що ви можете робити {#what-you-can-do}

### Обробка файлів (241 інструмент) {#file-processing-241-tools}

| Модальність | Кількість | Приклади інструментів |
|----------|-------|---------------|
| **Зображення** | 105 | Зміна розміру, Обрізання, Стиснення, Конвертація, Видалення фону, Збільшення, OCR, Водяний знак, Колаж, Розфарбовування, Інструменти GIF, пресети форматів |
| **Відео** | 57 | Обрізання, Кадрування, Стиснення, Конвертація, Об'єднання, Витягування аудіо, Автосубтитри, Відео в GIF, Зміна розміру, Стабілізація, пресети форматів |
| **Аудіо** | 27 | Обрізання, Об'єднання, Конвертація, Нормалізація, Зниження шуму, Транскрибування, Зсув висоти тону, Затухання, Створення рінгтонів, пресети форматів |
| **PDF / Документи** | 42 | Об'єднання, Розділення, Стиснення, OCR, Водяний знак, Редагування, Word у PDF, Excel у PDF, Обертання, Захист, Відновлення |
| **Файли** | 10 | CSV у JSON, JSON у XML, Об'єднання CSV, Розділення CSV, Створення ZIP, Розпакування ZIP, Створення діаграм, YAML/JSON |

### Конвеєри {#pipelines}

Об'єднуйте інструменти в багатоетапні робочі процеси та застосовуйте їх до одного зображення чи цілого пакета:

1. Відкрийте **Pipelines** на бічній панелі.
2. Додайте етапи (будь-який інструмент, будь-які налаштування).
3. Запустіть на одному файлі або цілому пакеті одразу.
4. Збережіть конвеєр для повторного використання пізніше.

Конвеєри допускають 20 етапів за замовчуванням. Встановіть `MAX_PIPELINE_STEPS=0`, щоб зробити ліміт необмеженим.

### Бібліотека файлів {#file-library}

Кожен оброблений вами файл можна зберегти в бібліотеку **Files**. SnapOtter відстежує повну історію версій, тож ви можете простежити кожен крок обробки від початкового завантаження до кінцевого результату.

Збереження є явним: результати, які ви зберігаєте в бібліотеку, зберігаються, доки ви їх не видалите, тоді як результати, які ви обробляєте й залишаєте незбереженими, автоматично очищаються через 72 години (налаштовується через `FILE_MAX_AGE_HOURS`).

### REST API та ключі API {#rest-api-api-keys}

Кожен інструмент доступний через HTTP:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_<your-api-key>" \
  -F "file=@photo.jpg" \
  -F 'settings={"width":800,"height":600,"fit":"cover"}'
```

Згенеруйте ключі API у розділі **Settings → API Keys**. Див. [довідник REST API](/uk/api/rest) для всіх ендпоінтів або відвідайте [http://localhost:1349/api/docs](http://localhost:1349/api/docs) для інтерактивного довідника.

### Багатокористувацький режим і команди {#multi-user-teams}

Увімкніть кількох користувачів із контролем доступу на основі ролей:

- **Admin**: повний доступ - керування користувачами, командами, налаштуваннями, усіма файлами/конвеєрами/ключами API
- **User**: використання інструментів, керування власними файлами/конвеєрами/ключами API

Створюйте команди в розділі **Settings → Teams**, щоб групувати користувачів.

Встановіть `AUTH_ENABLED=true` (або `false` для однокористувацького/особистого використання без входу).
