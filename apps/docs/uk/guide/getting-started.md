---
description: "Встановіть SnapOtter за допомогою Docker однією командою. Включає налаштування Docker Compose, збірку з вихідного коду та повний огляд можливостей."
i18n_source_hash: aa8428189808
i18n_provenance: machine
i18n_output_hash: 682b4fb35910
i18n_hash_version: 2
---

# Початок роботи {#getting-started}

::: tip Спробуйте перед встановленням
Ознайомтеся з повним інтерфейсом на [demo.snapotter.com](https://demo.snapotter.com): без реєстрації та встановлення.
:::

## Швидкий старт {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

Цей єдиний контейнер запускає все необхідне: якщо `DATABASE_URL` не задано, він стартує власні PostgreSQL і Redis на інтерфейсі loopback (вбудований режим) і зберігає всі дані в томі `SnapOtter-data`. Це найшвидший спосіб спробувати SnapOtter або розгорнути його у домашній лабораторії. Для production використовуйте [канонічний стек Docker Compose](#docker-compose), у якому PostgreSQL і Redis працюють у власних контейнерах. Вбудований режим працює від root (за замовчуванням) і автоматично вимикається, щойно ви задаєте `DATABASE_URL`.

Встановлюєте на Raspberry Pi, старий ноутбук або невеликий VPS? Див. [Low-Resource Setups](/uk/guide/low-resource) з налаштованою покроковою інструкцією та очікуваннями від обмеженого обладнання.

Під час першого входу вас попросять змінити пароль.

::: tip Анонімна продуктова аналітика
SnapOtter за замовчуванням містить анонімну продуктову аналітику. Щоб вимкнути її, відкрийте **Settings → System → Privacy** і вимкніть **Anonymous Product Analytics**. Аналітика одразу припиняється для всього екземпляра.

Також можна задати змінну середовища `SNAPOTTER_TELEMETRY=0` (працюють також `false` і `off`), щоб вимкнути всю телеметрію для екземпляра без перебудови.

Моніторинг помилок працює на [Sentry](https://sentry.io), який спонсорує SnapOtter через свою програму для відкритого коду.

Подробиці про те, що збирається, див. у [What SnapOtter collects](/uk/guide/telemetry).
:::

::: tip Прискорення NVIDIA CUDA
Додайте `--gpus all` для прискореного через NVIDIA CUDA видалення фону, збільшення, покращення облич і відновлення. OCR залишається на CPU і працює в тому самому образі з доступом до GPU та без нього:

```bash
docker run -d --name SnapOtter -p 1349:1349 --gpus all -v SnapOtter-data:/data snapotter/snapotter:latest
```

Потрібен [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html). Автоматично переходить на CPU, якщо CUDA недоступна. Прискорення на інтегрованих GPU Intel/AMD через VA-API, Quick Sync або OpenCL для AI-інференсу наразі не підтримується. Бенчмарки див. у [Docker Tags](/uk/guide/docker-tags). Якщо AI-інструменти працюють на CPU, незважаючи на `--gpus all`, див. [Перевірка GPU-прискорення](/uk/guide/deployment#verify-gpu-acceleration).
:::

::: details Також у GHCR
```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data ghcr.io/snapotter-hq/snapotter:latest
```

Обидва реєстри публікують однаковий образ під час кожного релізу.
:::

## Docker Compose {#docker-compose}

Використовуйте виробничий файл, який підтримується і тестується з кожним релізом, замість копіювання скороченого прикладу Compose з цієї сторінки:

```bash
install -d -m 700 snapotter && cd snapotter
curl --proto '=https' --tlsv1.2 -fsSLo docker-compose.yml \
  https://raw.githubusercontent.com/snapotter-hq/SnapOtter/v2.3.0/docker/docker-compose.yml

# Keep generated service credentials out of shell history and world-readable files.
umask 077
POSTGRES_PASSWORD="$(openssl rand -hex 32)"
REDIS_PASSWORD="$(openssl rand -hex 32)"
printf 'POSTGRES_PASSWORD=%s\nREDIS_PASSWORD=%s\n' \
  "$POSTGRES_PASSWORD" "$REDIS_PASSWORD" > .env

docker compose -f docker-compose.yml pull
docker compose -f docker-compose.yml up -d --no-build
```

Канонічний [`docker/docker-compose.yml`](https://github.com/snapotter-hq/SnapOtter/blob/v2.3.0/docker/docker-compose.yml) містить усі чотири томи середовища виконання, перевірки стану, обмеження ресурсів, стійку конфігурацію Redis, закріплені образи бази даних і кешу та актуальне посилення безпеки контейнерів. Одразу після першого входу змініть типовий пароль адміністратора. Для відтворюваного розгортання закріпіть образ застосунку SnapOtter на перевіреному вами теґу релізу або digest, замість того щоб відстежувати `latest`.

Усі змінні середовища див. у розділі [Конфігурація](/uk/guide/configuration), а секрети, мережеву політику та рекомендації щодо резервного копіювання, у розділі [Безпека та посилення захисту](/uk/guide/security).

## Збірка з вихідного коду {#build-from-source}

**Передумови:** Node.js 22.22+, pnpm 9+, Docker (для Postgres + Redis), Python 3.11+ (для AI-функцій), Git.

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker-compose.dev.yml up -d   # start Postgres + Redis
pnpm install
pnpm dev
```

- Фронтенд: [http://localhost:1351](http://localhost:1351)
- Бекенд: [http://localhost:13490](http://localhost:13490)

## Що можна робити {#what-you-can-do}

### Обробка файлів (200+ інструментів) {#file-processing-200-tools}

| Модальність | Кількість | Приклади інструментів |
|----------|-------|---------------|
| **Зображення** | 112 | Зміна розміру, Обрізання, Стиснення, Конвертація, Видалення фону, Збільшення, OCR, Водяний знак, Колаж, Розфарбування, Інструменти GIF, пресети форматів |
| **Відео** | 57 | Обрізання, Кадрування, Стиснення, Конвертація, Об'єднання, Витягнення аудіо, Автосубтитри, Відео в GIF, Зміна розміру, Стабілізація, пресети форматів |
| **Аудіо** | 27 | Обрізання, Об'єднання, Конвертація, Нормалізація, Зменшення шуму, Транскрибування, Зсув висоти тону, Згасання, Створення рингтонів, пресети форматів |
| **PDF / Документ** | 35 | Об'єднання, Розділення, Стиснення, OCR, Водяний знак, Редагування (приховування даних), Word у PDF, Excel у PDF, Обертання, Захист, Відновлення |
| **Файли** | 23 | CSV у JSON, JSON у XML, Об'єднання CSV, Розділення CSV, Створення ZIP, Розпакування ZIP, Створення діаграм, YAML/JSON |

### Конвеєри {#pipelines}

Поєднуйте інструменти в багатокрокові робочі процеси та застосовуйте їх до одного зображення або цілого пакета:

1. Відкрийте **Pipelines** на бічній панелі.
2. Додайте кроки (будь-який інструмент, будь-які налаштування).
3. Запустіть для одного файла або одразу для всього пакета.
4. Збережіть конвеєр для повторного використання.

За замовчуванням конвеєр може мати 20 кроків. Задайте `MAX_PIPELINE_STEPS=0`, щоб зняти це обмеження.

### Бібліотека файлів {#file-library}

Кожен оброблений файл можна зберегти у вашу бібліотеку **Files**. SnapOtter відстежує повну історію версій, тож ви можете простежити кожен крок обробки від початкового завантаження до кінцевого результату.

Збереження виконується явно: результати, збережені в бібліотеці, зберігаються, доки ви їх не видалите, а результати, які ви обробили й не зберегли, автоматично очищаються через 72 години (налаштовується через `FILE_MAX_AGE_HOURS`).

### REST API та ключі API {#rest-api-api-keys}

Кожен інструмент доступний через HTTP:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_<your-api-key>" \
  -F "file=@photo.jpg" \
  -F 'settings={"width":800,"height":600,"fit":"cover"}'
```

Згенеруйте ключі API в розділі **Settings → API Keys**. Усі кінцеві точки див. у [довіднику REST API](/uk/api/rest) або відвідайте [http://localhost:1349/api/docs](http://localhost:1349/api/docs), щоб отримати інтерактивний довідник.

### Кілька користувачів і команди {#multi-user-teams}

Увімкніть кількох користувачів із рольовим керуванням доступом:

- **Admin**: повний доступ: керування користувачами, командами, налаштуваннями, усіма файлами/конвеєрами/ключами API
- **User**: використання інструментів, керування власними файлами/конвеєрами/ключами API

Створюйте команди в **Settings → Teams**, щоб групувати користувачів.

Задайте `AUTH_ENABLED=true` (або `false` для одного користувача / власного використання без входу).

## Використання з телефона {#use-it-from-your-phone}

SnapOtter працює в мобільних браузерах, і його можна встановити як застосунок. Відкрийте свій екземпляр на телефоні, а потім:

- **iPhone / iPad (Safari):** торкніться Share, потім **Add to Home Screen**.
- **Android (Chrome):** відкрийте меню браузера та торкніться **Install app**.

Встановлений застосунок відкривається у власному вікні одразу на вашому екземплярі.

Є одне застереження: браузери пропонують встановлення лише через HTTPS. Звичайна HTTP-адреса у вашій локальній мережі чудово працює у вкладці браузера, але для повноцінного встановлення розмістіть екземпляр за зворотним проксі із сертифікатом (див. [посібник із розгортання](/uk/guide/deployment)).

На телефонах і планшетах інструменти для зображень показують кнопку **Take photo** поруч із кнопкою завантаження. Сфотографуйте чек або дошку, і знімок одразу потрапить в інструмент.
