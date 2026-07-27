---
description: "Посібник із посилення безпеки для SnapOtter. Безпека контейнерів, мережева ізоляція, секрети Docker, розгортання в Kubernetes та артефакти відповідності."
i18n_source_hash: 9ff337fa0417
i18n_provenance: machine
i18n_output_hash: 09a77c679598
i18n_hash_version: 2
---

# Безпека та посилення {#security-hardening}

SnapOtter обробляє файли повністю на вашій інфраструктурі. Він за замовчуванням надсилає анонімну продуктову аналітику й звіти про збої без вмісту, щоб допомогти покращити проєкт. Він ніколи не надсилає ваші файли, імена файлів, вміст файлів, вивід OCR, метадані зображень чи текст документів. Необов'язковий відгук надсилається лише після того, як користувач його подасть, лише коли аналітика увімкнена, а контактні поля включаються лише за явної згоди на контакт. Адміністратор може вимкнути збір аналітики й відгуків одним кліком у Settings > System > Privacy, без потреби у повторному збиранні. Обробка файлів завжди залишається всередині вашого контейнера.

Контейнер працює від імені виділеного не-root користувача (`snapotter`) з усіма скиненими можливостями Linux, окрім мінімального необхідного набору. Щодо повної політики розкриття вразливостей і архітектури безпеки див. [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) на GitHub.

## Зміцнення контейнера {#container-hardening}

Канонічні файли Compose [CPU](https://github.com/snapotter-hq/SnapOtter/blob/main/docker/docker-compose.yml) і [GPU](https://github.com/snapotter-hq/SnapOtter/blob/main/docker/docker-compose-gpu.yml) є джерелом правди. Не копіюйте скорочений приклад у виробництво; розгорнути файл із тегу випуску, який ви перевірили.

Обидва стеки застосовують такі елементи керування:

- Обмеження пам'яті, підкачки, процесора та PID містять нестандартну власну обробку.
- Кожна служба втрачає всі можливості Linux. Додаток додає лише `CHOWN, SETUID, SETGID, DAC_OVERRIDE, FOWNER, KILL` для володіння томом, одностороннє видалення ідентифікаційної інформації `gosu` і витончене пересилання сигналу. PostgreSQL і Redis отримують лише ту підмножину, яку потребують їхні офіційні точки входу.

— `security_opt: [no-new-privileges:true]` не дозволяє процесам у контейнерах програми, PostgreSQL і Redis отримати додаткові привілеї. Це залишається сумісним із `gosu`: точка входу починається від імені root, готує томи та передається лише виділеному користувачеві `snapotter`.

— Вхідні дані зображень PostgreSQL і Redis закріплені дайджестом. Програму також слід прикріпити до тегу перевіреного випуску або дайджесту, а не до `latest`.

— Перевірки працездатності, обмежена ротація журналів JSON, надійний Redis AOF і політика перезапуску визначаються централізовано в канонічних файлах.

Для розгортання з підключенням до Інтернету прив’яжіть порт 1349 до loopback і завершіть TLS на підтримуваному зворотному проксі-сервері. Створюйте унікальні облікові дані PostgreSQL і Redis, зберігайте секрети в захищених файлах або в менеджері секретів і негайно змінюйте початковий пароль адміністратора.

### Чому `read_only` не встановлено {#why-read-only-is-not-set}

`read_only: true` не встановлено, оскільки перевідповідання PUID/PGID записує в `/etc/passwd` і `/etc/group` під час запуску. Якщо ви використовуєте прапор Docker `--user` або Kubernetes `runAsUser` замість PUID/PGID, ви можете безпечно ввімкнути кореневу файлову систему лише для читання.

## Ізоляція мережі {#network-isolation}

Обробка файлів є локальною, але інсталяція за замовчуванням **не є системою без виходу**. Анонімна аналітика продуктів використовує PostHog, а звіти про збої використовують Sentry, якщо ввімкнено телеметрію. Встановіть `SNAPOTTER_TELEMETRY=0` (або вимкніть аналітику в меню «Налаштування» > «Система» > «Конфіденційність»), щоб вимкнути обидва параметри. SnapOtter ніколи не включає в ці події завантажені файли, імена файлів, вихід OCR, текст документа чи інший вміст файлу.

Інший вихідний трафік керується функціями: інсталяція комплекту/моделі штучного інтелекту завантажує підписані вхідні дані випуску; Імпорт URL-адреси отримує загальнодоступну URL-адресу, яку запитує користувач; і явно налаштовані OIDC, SAML, OpenTelemetry, веб-хуки, S3-сумісне сховище або подібні інтеграції зв’язуються з пунктами призначення, вибраними адміністратором. Завантаження моделей під час виконання за замовчуванням вимкнено. Установіть `SNAPOTTER_ALLOW_MODEL_DOWNLOAD=1` лише для явного ввімкнення автоматичних резервних завантажень. [Офлайн-пакет імпорту](/uk/guide/deployment) може надавати функції AI без виходу моделі середовища виконання.

**Рекомендації щодо брандмауера:**

|Сценарій|Вихідне правило|
|---|---|
|З повітряним проміжком|Встановіть `SNAPOTTER_TELEMETRY=0` і `SNAPOTTER_ALLOW_MODEL_DOWNLOAD=0`, використовуйте офлайн-імпорт пакетів AI, вимкніть імпорт URL-адрес і зовнішню інтеграцію, а потім заблокуйте вихід|
|Телеметрія за замовчуванням|Дозволити кінцеві точки PostHog і Sentry, указані в журналах вашого браузера/мережі; вимкнути телеметрію, якщо політика не дозволяє їх|
|Потрібні пакети AI|Під час встановлення дозвольте HTTPS до `huggingface.co, *.xethub.hf.co, cdn-lfs.huggingface.co, github.com, objects.githubusercontent.com, storage.googleapis.com, pypi.org, files.pythonhosted.org`; потім заблокуйте ці хости|
|Зовнішні інтеграції|Дозволити лише точні призначення OIDC/SAML/OTLP/webhook/object-storage, налаштовані адміністратором|

Архіви пакетів обслуговуються зі сховища Xet Hugging Face, яке паралельно передається через кінцеві точки `*.xethub.hf.co` і завдяки чому швидко завантажуються пакети на кілька ГБ. Якщо ваш брандмауер дозволяє `huggingface.co`, але блокує `*.xethub.hf.co`, встановлення все одно вдасться, але повернеться до повільнішого однопотокового завантаження, тому внесіть хости Xet у білий список, щоб залишатися на швидкому шляху. Повністю автономна інсталяція може пропустити все це та використовувати [Offline Bundle Import](/uk/guide/deployment).

Для конфігурації зворотного проксі (Nginx, Traefik, Caddy, Cloudflare Tunnels) див. [Посібник із розгортання](/uk/guide/deployment#reverse-proxy).

## Секрети Docker {#docker-secrets}

Для продакшн-розгортань уникайте передавання секретів як звичайних текстових змінних середовища. Точка входу підтримує конвенцію `_FILE` Docker: змонтуйте секрет як файл і встановіть відповідну змінну `_FILE` на її шлях.

**Підтримувані секрети:**

| Змінна | Еквівалент `_FILE` |
|---|---|
| `DEFAULT_PASSWORD` | `DEFAULT_PASSWORD_FILE` |
| `COOKIE_SECRET` | `COOKIE_SECRET_FILE` |
| `OIDC_CLIENT_SECRET` | `OIDC_CLIENT_SECRET_FILE` |
| `S3_ACCESS_KEY_ID` | `S3_ACCESS_KEY_ID_FILE` |
| `S3_SECRET_ACCESS_KEY` | `S3_SECRET_ACCESS_KEY_FILE` |
| `SNAPOTTER_LICENSE_KEY` | `SNAPOTTER_LICENSE_KEY_FILE` |

**Приклад із секретами Docker Compose:**

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    environment:
      - AUTH_ENABLED=true
      - DEFAULT_USERNAME=admin
      - DEFAULT_PASSWORD_FILE=/run/secrets/snapotter_password
      - COOKIE_SECRET_FILE=/run/secrets/cookie_secret
    secrets:
      - snapotter_password
      - cookie_secret

secrets:
  snapotter_password:
    file: ./secrets/snapotter_password.txt
  cookie_secret:
    file: ./secrets/cookie_secret.txt
```

::: tip 
Секрети Docker Compose (без Swarm) потребують Compose v2.23 або новіше.
:::

## Розгортання в Kubernetes {#kubernetes-deployment}

Точка входу виявляє, коли контейнер уже працює від імені не-root (наприклад, через `runAsUser` Kubernetes), і автоматично пропускає скидання привілеїв gosu. У цьому разі вона не може сама змінити власника змонтованих томів, тож перевіряє, чи вони доступні для запису, і достроково виходить з дієвими вказівками, якщо ні — див. [Права доступу до сховища](/uk/guide/deployment#storage-permissions) щодо `fsGroup` і налаштувань із чужим UID (TrueNAS, OpenShift).

**Рекомендований SecurityContext поду:**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: snapotter
spec:
  replicas: 1
  selector:
    matchLabels:
      app: snapotter
  template:
    metadata:
      labels:
        app: snapotter
    spec:
      securityContext:
        runAsNonRoot: true
        runAsUser: 999
        runAsGroup: 999
        fsGroup: 999
      containers:
        - name: snapotter
          image: snapotter/snapotter:latest
          ports:
            - containerPort: 1349
          securityContext:
            allowPrivilegeEscalation: false
            capabilities:
              drop: [ALL]
          resources:
            requests:
              cpu: "1"
              memory: 2Gi
            limits:
              cpu: "4"
              memory: 6Gi
          livenessProbe:
            httpGet:
              path: /api/v1/health
              port: 1349
            initialDelaySeconds: 60
            periodSeconds: 30
            timeoutSeconds: 5
          readinessProbe:
            httpGet:
              path: /api/v1/health
              port: 1349
            initialDelaySeconds: 10
            periodSeconds: 10
            timeoutSeconds: 5
          volumeMounts:
            - name: data
              mountPath: /data
            - name: workspace
              mountPath: /tmp/workspace
      volumes:
        - name: data
          persistentVolumeClaim:
            claimName: snapotter-data
        - name: workspace
          emptyDir:
            medium: Memory
            sizeLimit: 2Gi
```

Оскільки `runAsUser: 999` встановлено на рівні поду, точка входу повністю пропускає gosu. Це дозволяє можливості `allowPrivilegeEscalation: false` і `drop: [ALL]` без конфлікту.

Щодо підбору ресурсів див. [Вимоги до апаратного забезпечення](/uk/guide/deployment#hardware-requirements).

## Резервне копіювання та відновлення {#backup-and-recovery}

Виробничий стек Compose визначає чотири томи. Зупиніть вхід і дайте активним завданням завершитися, перш ніж виконувати координоване резервне копіювання, щоб PostgreSQL, Redis і стан файлу описували той самий момент часу.

|Обсяг|Зміст|Відновлювальне лікування|
|---|---|---|
|`SnapOtter-pgdata`|Користувачі PostgreSQL, налаштування, конвеєри, завдання, метадані файлів і журнал аудиту|Критичний; використовуйте швидкий логічний дамп для портативного відновлення|
|`SnapOtter-data`|Збережені бібліотечні об’єкти, журнали та стан AI (`/data/files, /data/logs, /data/ai, /data/ai/venv`)|Створіть резервну копію всього тому; щоб заощадити місце, навмисно пропустіть усі стани ШІ та перевстановіть його комплекти|
|`SnapOtter-redisdata`|Redis AOF для тривалого стану черги BullMQ|Резервне копіювання після призупинення програми та примусового запуску `SAVE`; необхідні для точного відновлення роботи в черзі|
|`SnapOtter-workspace`|Тимчасові ключі зберігання об’єктів (`/tmp/workspace/uploads, /tmp/workspace/outputs`)|Не створюйте резервну копію після того, як усі завдання вичерпано або скасовано; ніколи не викидайте його, поки завдання активні|

Компонувати зазвичай префікси імен томів із назвою проекту. Розділіть реальний вихідний том із підключеного контейнера замість того, щоб припускати, що відображуване ім’я, наприклад `SnapOtter-data`, є ім’ям тому Docker.

### Резервне копіювання бази даних {#database-backup}

Використовуйте спеціальний формат архіву PostgreSQL і перевірте архів, перш ніж розглядати резервну копію як завершену:

```bash
docker exec SnapOtter-postgres \
  pg_dump --format=custom --no-owner -U snapotter snapotter > snapotter.dump
test -s snapotter.dump
docker exec -i SnapOtter-postgres pg_restore --list < snapotter.dump >/dev/null

# Restore only into a fresh/disposable target first; any SQL error fails the command.
docker exec -i SnapOtter-postgres \
  pg_restore --exit-on-error --clean --if-exists --no-owner \
  -U snapotter -d snapotter < snapotter.dump
```

Перевірте кожну резервну копію, відновивши її в ізольований стек, перевіривши записи бази даних і контрольні суми файлів і запустивши програму. `tests/qa/backup-restore-drill.sh` репозиторію автоматизує цей шлюз випуску проти явного `QA_IMAGE`.

Якщо натомість ваша платформа робить миттєві знімки томів, що відповідають збоям, спочатку зупиніть увесь стек і зробіть миттєві знімки всіх критичних томів як один набір. Необроблена копія каталогу даних PostgreSQL із запущеного контейнера не є підтримуваною логічною резервною копією.

### Резервне копіювання файлів і черги {#file-and-queue-backup}

Призупиніть програму перед захопленням томів файлів і черги. Використовуйте `docker inspect`, щоб розпізнати фактичну назву тому, змусити Redis зберегти поточний стан і архівувати зі збереженням права власності та дозволів:

```bash
docker stop SnapOtter
docker exec SnapOtter-redis redis-cli -a "$REDIS_PASSWORD" --no-auth-warning SAVE
docker stop SnapOtter-redis

DATA_VOLUME="$(docker inspect SnapOtter --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}}{{end}}{{end}}')"
REDIS_VOLUME="$(docker inspect SnapOtter-redis --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}}{{end}}{{end}}')"

install -d -m 700 backup
docker run --rm -v "$DATA_VOLUME:/source:ro" -v "$PWD/backup:/backup" \
  alpine:3.22@sha256:14358309a308569c32bdc37e2e0e9694be33a9d99e68afb0f5ff33cc1f695dce tar czf /backup/snapotter-data.tar.gz -C /source .
docker run --rm -v "$REDIS_VOLUME:/source:ro" -v "$PWD/backup:/backup" \
  alpine:3.22@sha256:14358309a308569c32bdc37e2e0e9694be33a9d99e68afb0f5ff33cc1f695dce tar czf /backup/snapotter-redis.tar.gz -C /source .
sha256sum backup/snapotter-*.tar.gz > backup/SHA256SUMS
```

Перезапустіть Redis перед програмою. Якщо ви навмисно виключаєте `/data/ai`, видаліть усе піддерево AI, а не зберігайте запис `installed.json` без його моделей або віртуального середовища. Зберігайте файли резервних копій у зашифрованому вигляді, з контрольованим доступом і окремо від хоста, на якому запущено SnapOtter.

## Артефакти відповідності {#compliance-artifacts}

Кожен випуск SnapOtter містить такі артефакти безпеки:

| Артефакт | Формат | Де його знайти |
|---|---|---|
| Звільнити предметну прив'язку | Канонічна атестація JSON + GitHub | [Випуск GitHub](https://github.com/snapotter-hq/SnapOtter/releases) актив: `snapotter-v{version}-release-subjects.json` |
| Архів SBOM | CycloneDX і SPDX JSON | Випустити активи: `snapotter-v{version}-archive-linux-{arch}-sbom.{cdx,spdx}.json` |
| Зображення SBOM | CycloneDX і SPDX JSON | Випустити активи: `snapotter-v{version}-image-linux-{arch}-sbom.{cdx,spdx}.json` |
| Сканування вразливостей | Trivy JSON | Випустіть активи з відповідними префіксами `archive-linux-{arch}` або `image-linux-{arch}` |
| Сканування вразливостей | SARIF | Вкладка [Безпека GitHub](https://github.com/snapotter-hq/SnapOtter/security). |
| Статичний аналіз | CodeQL (JS/TS + Python) | Вкладка [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security), запускається щотижня + за PR |
| Огляд залежності | GitHub рідний | Перевірка за PR, не вдається виконати додавання високої серйозності |
| Аудит залежностей Python | pip-audit | Журнал запуску CI під час кожного натискання |
| Політика безпеки | Markdown | [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) у сховищі |
| Оновлення залежностей | Dependabot | Автоматизовані щотижневі PR для npm, pip, Docker, Actions |

**Запуск власного сканування:**

Завантажте маніфест теми випуску та переконайтеся, що він підтверджений робочим процесом випуску:

```bash
gh attestation verify snapotter-v2.2.0-release-subjects.json \
  --repo snapotter-hq/SnapOtter \
  --signer-workflow snapotter-hq/SnapOtter/.github/workflows/release.yml
```

У маніфесті окремо записуються `releaseTag`, `releaseCommit` і `workflowTriggerCommit`. Переконайтеся, що `releaseCommit` є комітом, видаленим із незмінного тегу, а потім перевірте дайджест SHA-256 архіву, зображення, SBOM або сканування, який ви використовуєте, на його запис у `subjects`. Ця відмінність є навмисною: перевірка щойно створеного коміту випуску не змінює ідентифікатор коміту в облікових даних OIDC робочого циклу.

Ви також можете сканувати завантажений SBOM або безпосередньо зображення:

```bash
# Scan with Grype using the CycloneDX SBOM
grype sbom:snapotter-v2.2.0-image-linux-amd64-sbom.cdx.json

# Scan with Trivy using the SPDX SBOM
trivy sbom snapotter-v2.2.0-image-linux-amd64-sbom.spdx.json

# Scan the Docker image directly
trivy image snapotter/snapotter:2.2.0
```

::: info
Зображення SBOMs і скановані зображення відображають точне зображення конкретної архітектури, опубліковане для цього випуску. Архів SBOMs і скани описують попередньо зібраний архів окремо. Комплекти моделей AI, встановлені після розгортання, не включені в ці SBOMs, оскільки вони завантажуються під час виконання.
:::
