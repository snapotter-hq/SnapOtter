---
description: "Встановіть SnapOtter за допомогою Docker однією командою. Включає налаштування Docker Compose, збирання з вихідного коду й повний огляд функцій."
i18n_source_hash: 8040133a6982
i18n_provenance: machine
i18n_output_hash: 5859f9d6859f
i18n_hash_version: 2
---

# Початок роботи {#getting-started}

::: tip Спробуйте перед встановленням
Ознайомтеся з повним інтерфейсом на [demo.snapotter.com](https://demo.snapotter.com) — без реєстрації чи встановлення.
:::

## Швидкий старт {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

Цей єдиний контейнер запускає все, що йому потрібно: без встановлення `DATABASE_URL` він запускає власний PostgreSQL і Redis на інтерфейсі петлі (вбудований режим) і зберігає всі дані в тому `SnapOtter-data`. Це найшвидший спосіб спробувати SnapOtter або самостійне розміщення в домашній лабораторії. Для виробництва використовуйте [канонічний стек Docker Compose](#docker-compose), який зберігає PostgreSQL і Redis у власних контейнерах. Вбудований режим працює як root (за замовчуванням) і вимикається автоматично, щойно ви встановите `DATABASE_URL`.

Встановлюєте на Raspberry Pi, старому ноутбуці чи невеликому VPS? Див. [Робота на слабкому обладнанні](/uk/guide/low-resource): там є покроковий посібник із підібраними налаштуваннями й пояснення, чого очікувати від обмеженого обладнання.

Під час першого входу вас попросять змінити пароль.

::: tip Анонімна продуктова аналітика
SnapOtter містить анонімну продуктову аналітику за замовчуванням. Щоб вимкнути її, відкрийте **Settings → System → Privacy** і вимкніть **Anonymous Product Analytics**. Вона зупиняється негайно для всього екземпляра.

Ви також можете встановити змінну середовища `SNAPOTTER_TELEMETRY=0` (`false` і `off` теж працюють), щоб вимкнути всю телеметрію для екземпляра без повторного збирання.

Моніторинг помилок працює на [Sentry](https://sentry.io), який спонсорує SnapOtter через свою програму з відкритим кодом.

Щодо деталей про те, що збирається, див. [Що збирає SnapOtter](/uk/guide/telemetry).
:::

::: tip Прискорення NVIDIA CUDA
Додайте `--gpus all` для NVIDIA CUDA-прискореного видалення фону, масштабування, покращення обличчя та відновлення. OCR залишається на основі ЦП і працює в одному образі з доступом до GPU або без нього:

```bash
docker run -d --name SnapOtter -p 1349:1349 --gpus all -v SnapOtter-data:/data snapotter/snapotter:latest
```

Потрібен [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html). Автоматично повертається до ЦП, коли CUDA недоступна. Прискорення Intel/AMD iGPU через VA-API, Quick Sync або OpenCL на сьогодні не підтримується для висновків ШІ. Див. [Теги Docker](/uk/guide/docker-tags) для тестів. Якщо інструменти штучного інтелекту працюють на ЦП, незважаючи на `--gpus all`, див. [Перевірте прискорення GPU](/uk/guide/deployment#verify-gpu-acceleration).
:::

::: details Також на GHCR
```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data ghcr.io/snapotter-hq/snapotter:latest
```

Обидва реєстри публікують той самий образ при кожному релізі.
:::

## Docker Compose {#docker-compose}

Використовуйте робочий файл, який підтримується та перевіряється з кожним випуском, замість копіювання скороченого прикладу Compose із цієї сторінки:

```bash
install -d -m 700 snapotter && cd snapotter
curl --proto '=https' --tlsv1.2 -fsSLo docker-compose.yml \
  https://raw.githubusercontent.com/snapotter-hq/SnapOtter/v2.1.0/docker/docker-compose.yml

# Keep generated service credentials out of shell history and world-readable files.
umask 077
POSTGRES_PASSWORD="$(openssl rand -hex 32)"
REDIS_PASSWORD="$(openssl rand -hex 32)"
printf 'POSTGRES_PASSWORD=%s\nREDIS_PASSWORD=%s\n' \
  "$POSTGRES_PASSWORD" "$REDIS_PASSWORD" > .env

docker compose -f docker-compose.yml pull
docker compose -f docker-compose.yml up -d --no-build
```

Канонічний [`docker/docker-compose.yml`](https://github.com/snapotter-hq/SnapOtter/blob/v2.1.0/docker/docker-compose.yml) включає всі чотири томи часу виконання, перевірки працездатності, обмеження ресурсів, надійну конфігурацію Redis, закріплені зображення бази даних/кешу та поточний захист контейнера. Змініть стандартний пароль адміністратора одразу після першого входу. Для відтворюваного розгортання прикріпіть зображення програми SnapOtter до тегу випуску або перевіреного дайджесту замість `latest`.

Перегляньте [Конфігурація](/uk/guide/configuration) для всіх змінних середовища та [Безпека та зміцнення](/uk/guide/security) для секретів, мережевої політики та вказівок щодо резервного копіювання.

## Збирання з вихідного коду {#build-from-source}

**Передумови:** Node.js 22.22+, pnpm 9+, Docker (для Postgres + Redis), Python 3.11+ (для функцій AI), Git.

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker-compose.dev.yml up -d   # start Postgres + Redis
pnpm install
pnpm dev
```

- Фронтенд: [http://localhost:1351](http://localhost:1351)
- Бекенд: [http://localhost:13490](http://localhost:13490)

## Що ви можете робити {#what-you-can-do}

### Обробка файлів (200+ інструментів) {#file-processing-200-tools}

| Модальність | Кількість | Приклади інструментів |
|----------|-------|---------------|
| **Зображення** | 107 | Зміна розміру, Обрізання, Стиснення, Конвертація, Видалення фону, Upscale, OCR, Водяний знак, Колаж, Colorize, Інструменти GIF, пресети форматів |
| **Відео** | 57 | Обрізання, Обрізання за краями, Стиснення, Конвертація, Об'єднання, Витягнення аудіо, Автосубтитри, Відео у GIF, Зміна розміру, Стабілізація, пресети форматів |
| **Аудіо** | 27 | Обрізання, Об'єднання, Конвертація, Нормалізація, Зменшення шуму, Транскрипція, Зсув висоти тону, Затухання, Створення рингтонів, пресети форматів |
| **PDF / Документ** | 29 | Об'єднання, Розділення, Стиснення, OCR, Водяний знак, Редагування (redact), Word у PDF, Excel у PDF, Обертання, Захист, Відновлення |
| **Файли** | 23 | CSV у JSON, JSON у XML, Об'єднання CSV, Розділення CSV, Створення ZIP, Витягнення ZIP, Створення діаграм, YAML/JSON |

### Конвеєри {#pipelines}

Об'єднуйте інструменти в багатоетапні робочі процеси й застосовуйте їх до одного зображення або цілого пакета:

1. Відкрийте **Pipelines** на бічній панелі.
2. Додайте кроки (будь-який інструмент, будь-які налаштування).
3. Запустіть на одному файлі — або на цілому пакеті одразу.
4. Збережіть конвеєр для повторного використання пізніше.

Конвеєри дозволяють 20 кроків за замовчуванням. Встановіть `MAX_PIPELINE_STEPS=0`, щоб зробити ліміт необмеженим.

### Бібліотека файлів {#file-library}

Кожен файл, який ви обробляєте, можна зберегти у вашу бібліотеку **Files**. SnapOtter відстежує повну історію версій, тож ви можете простежити кожен крок обробки від оригінального завантаження до фінального результату.

Збереження є явним: результати, які ви зберігаєте в бібліотеку, зберігаються, доки ви їх не видалите, тоді як результати, які ви обробляєте й залишаєте незбереженими, автоматично очищаються через 72 години (налаштовується через `FILE_MAX_AGE_HOURS`).

### REST API та ключі API {#rest-api-api-keys}

Кожен інструмент доступний через HTTP:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_<your-api-key>" \
  -F "file=@photo.jpg" \
  -F 'settings={"width":800,"height":600,"fit":"cover"}'
```

Генеруйте ключі API в **Settings → API Keys**. Див. [довідник REST API](/uk/api/rest) щодо всіх кінцевих точок, або відвідайте [http://localhost:1349/api/docs](http://localhost:1349/api/docs) для інтерактивного довідника.

### Багатокористувацький режим і команди {#multi-user-teams}

Увімкніть кількох користувачів із рольовим контролем доступу:

- **Admin**: повний доступ — керування користувачами, командами, налаштуваннями, усіма файлами/конвеєрами/ключами API
- **User**: використання інструментів, керування власними файлами/конвеєрами/ключами API

Створюйте команди в **Settings → Teams**, щоб групувати користувачів.

Встановіть `AUTH_ENABLED=true` (або `false` для однокористувацького/особистого використання без входу).
