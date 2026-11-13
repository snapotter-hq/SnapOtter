---
description: "Посібник із посилення безпеки SnapOtter. Безпека контейнерів, мережева ізоляція, секрети Docker, розгортання в Kubernetes і артефакти відповідності."
i18n_source_hash: 5cf773ddb4c0
i18n_provenance: machine
i18n_output_hash: 1d3f06df410f
i18n_hash_version: 2
---

# Безпека та посилення захисту {#security-hardening}

SnapOtter обробляє файли повністю на вашій інфраструктурі. За замовчуванням він надсилає анонімну продуктову аналітику та звіти про збої без вмісту файлів, щоб допомагати вдосконалювати проєкт. Він ніколи не надсилає ваші файли, імена файлів, вміст файлів, результат OCR, метадані зображень чи текст документів. Необов'язковий відгук надсилається лише після того, як користувач його відправить, лише коли аналітику ввімкнено, а контактні поля додаються лише за явної згоди на контакт. Адміністратор може вимкнути аналітику та збір відгуків одним кліком у Settings > System > Privacy, без перебудови. Обробка файлів завжди залишається всередині вашого контейнера.

Контейнер працює від окремого користувача без прав root (`snapotter`) з усіма можливостями Linux, окрім мінімально необхідного набору, які відкинуто. Повну політику розкриття вразливостей і архітектуру безпеки див. у [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) на GitHub.

## Посилення захисту контейнера {#container-hardening}

Канонічні файли Compose для [CPU](https://github.com/snapotter-hq/SnapOtter/blob/v2.3.0/docker/docker-compose.yml) і [GPU](https://github.com/snapotter-hq/SnapOtter/blob/v2.3.0/docker/docker-compose-gpu.yml) є джерелом істини. Не копіюйте скорочений приклад у production; розгортайте файл із перевіреного вами тега релізу.

Обидва стеки застосовують такі засоби контролю:

- Ліміти пам'яті, swap, CPU та PID стримують некеровану нативну обробку.
- Кожен сервіс відкидає всі можливості Linux. Застосунок повертає лише `CHOWN, SETUID, SETGID, DAC_OVERRIDE, FOWNER, KILL` для володіння томами, односторонній перехід ідентичності `gosu` та коректне пересилання сигналів. PostgreSQL і Redis отримують лише той піднабір, який потрібен їхнім офіційним entrypoint.
- `security_opt: [no-new-privileges:true]` не дає процесам у контейнерах застосунку, PostgreSQL і Redis отримувати додаткові привілеї. Це залишається сумісним з `gosu`: entrypoint стартує від root, готує томи і лише тоді переходить до окремого користувача `snapotter`.
- Вхідні образи PostgreSQL і Redis закріплено за digest. Застосунок так само слід закріпити на перевіреному теґу релізу або digest, а не на `latest`.
- Перевірки стану, обмежена ротація JSON-журналів, стійкий Redis AOF і політика перезапуску визначені централізовано в канонічних файлах.

Для розгортання, доступного з інтернету, прив'яжіть порт 1349 до loopback і завершуйте TLS на підтримуваному зворотному проксі. Згенеруйте унікальні облікові дані PostgreSQL і Redis, зберігайте секрети в захищених файлах або менеджері секретів і одразу змініть початковий пароль адміністратора.

### Чому `read_only` не задано {#why-read-only-is-not-set}

`read_only: true` не задано, тому що переприсвоєння PUID/PGID під час запуску записує до `/etc/passwd` і `/etc/group`. Якщо замість PUID/PGID ви використовуєте прапорець Docker `--user` або Kubernetes `runAsUser`, можна безпечно ввімкнути кореневу файлову систему лише для читання.

## Мережева ізоляція {#network-isolation}

Обробка файлів локальна, але типове встановлення **не є системою без вихідного трафіку**. Анонімна продуктова аналітика використовує PostHog, а звіти про збої використовують Sentry, коли телеметрію ввімкнено. Задайте `SNAPOTTER_TELEMETRY=0` (або вимкніть аналітику в Settings > System > Privacy), щоб вимкнути обидва. SnapOtter ніколи не включає завантажені файли, імена файлів, результат OCR, текст документів чи інший вміст файлів у ці події.

Інший вихідний трафік залежить від функцій: встановлення AI-пакетів/моделей завантажує підписані релізні вхідні дані; імпорт за URL отримує запитаний користувачем публічний URL; а явно налаштовані OIDC, SAML, OpenTelemetry, вебхуки, S3-сумісне сховище чи подібні інтеграції звертаються до призначень, обраних адміністратором. Завантаження моделей під час роботи за замовчуванням вимкнено. Задавайте `SNAPOTTER_ALLOW_MODEL_DOWNLOAD=1` лише для того, щоб явно дозволити автоматичні запасні завантаження. [Імпорт офлайн-пакета](/uk/guide/deployment) може розгорнути AI-функції без вихідного трафіку для моделей під час роботи.

**Рекомендації щодо брандмауера:**

| Сценарій | Правило для вихідного трафіку |
|---|---|
| Повністю ізольована мережа | Задайте `SNAPOTTER_TELEMETRY=0` і `SNAPOTTER_ALLOW_MODEL_DOWNLOAD=0`, використовуйте імпорт офлайн AI-пакета, вимкніть імпорт за URL і зовнішні інтеграції, а потім заблокуйте вихідний трафік |
| Телеметрія за замовчуванням | Дозвольте кінцеві точки PostHog і Sentry, наведені у журналах вашого браузера/мережі; вимкніть телеметрію, якщо політика їх не дозволяє |
| Потрібні AI-пакети | Під час встановлення дозвольте HTTPS до `huggingface.co, *.xethub.hf.co, cdn-lfs.huggingface.co, github.com, objects.githubusercontent.com, storage.googleapis.com, pypi.org, files.pythonhosted.org`; потім заблокуйте ці хости |
| Зовнішні інтеграції | Дозвольте лише точні призначення OIDC/SAML/OTLP/вебхуків/об'єктного сховища, налаштовані адміністратором |

Архіви пакетів надаються зі сховища Xet на Hugging Face, яке передає дані паралельно через кінцеві точки `*.xethub.hf.co` і саме тому багатогігабайтні пакети завантажуються швидко. Якщо ваш брандмауер дозволяє `huggingface.co`, але блокує `*.xethub.hf.co`, встановлення все одно завершується успішно, але переходить на повільніше завантаження в один потік, тож додайте хости Xet до списку дозволених, щоб лишатися на швидкому шляху. Повністю офлайн-встановлення можуть пропустити все це й натомість скористатися [Імпортом офлайн-пакета](/uk/guide/deployment).

Конфігурацію зворотного проксі (Nginx, Traefik, Caddy, Cloudflare Tunnels) див. у [посібнику з розгортання](/uk/guide/deployment#reverse-proxy).

## Секрети Docker {#docker-secrets}

Для production-розгортань уникайте передавання секретів як відкритих змінних середовища. Entrypoint підтримує конвенцію Docker `_FILE`: змонтуйте секрет як файл і задайте відповідну змінну `_FILE` зі шляхом до нього.

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
Секрети Docker Compose (без Swarm) потребують Compose v2.23 або новішої версії.
:::

## Розгортання в Kubernetes {#kubernetes-deployment}

Entrypoint виявляє, що контейнер уже працює без прав root (наприклад, через `runAsUser` у Kubernetes), і автоматично пропускає перехід через gosu. У цьому разі він не може сам виконати chown для змонтованих томів, тож перевіряє, що вони доступні для запису, і завчасно завершується з практичними вказівками, якщо це не так; див. [Права доступу до сховища](/uk/guide/deployment#storage-permissions) щодо `fsGroup` і конфігурацій із чужим UID (TrueNAS, OpenShift).

**Рекомендований Pod SecurityContext:**

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

Оскільки `runAsUser: 999` задано на рівні pod, entrypoint повністю пропускає gosu. Це дозволяє використовувати можливості `allowPrivilegeEscalation: false` і `drop: [ALL]` без конфлікту.

Про підбір ресурсів див. [Вимоги до обладнання](/uk/guide/deployment#hardware-requirements).

## Резервне копіювання та відновлення {#backup-and-recovery}

Виробничий стек Compose визначає чотири томи. Зупиніть вхідний трафік і дочекайтеся завершення активних завдань перед узгодженим резервним копіюванням, щоб PostgreSQL, Redis і стан файлів описували один і той самий момент часу.

| Том | Вміст | Підхід до відновлення |
|---|---|---|
| `SnapOtter-pgdata` | Користувачі PostgreSQL, налаштування, конвеєри, завдання, метадані файлів і журнал аудиту | Критичний; для переносного відновлення використовуйте логічний дамп із негайним завершенням при помилці |
| `SnapOtter-data` | Збережені об'єкти бібліотеки, журнали та стан AI (`/data/files, /data/logs, /data/ai, /data/ai/venv`) | Копіюйте весь том; щоб заощадити місце, свідомо пропустіть увесь стан AI і перевстановіть його пакети |
| `SnapOtter-redisdata` | Redis AOF для стійкого стану черг BullMQ | Копіюйте після призупинення застосунку та примусового `SAVE`; потрібен, щоб точно відновити роботу з черги |
| `SnapOtter-workspace` | Тимчасові ключі об'єктного сховища (`/tmp/workspace/uploads, /tmp/workspace/outputs`) | Не копіюйте після того, як усі завдання завершено або скасовано; ніколи не відкидайте його, поки завдання активні |

Compose зазвичай додає до імен томів префікс з назвою проєкту. Визначайте справжній вихідний том із змонтованого контейнера, а не припускайте, що показане ім'я, як-от `SnapOtter-data`, є назвою тому Docker.

### Резервне копіювання бази даних {#database-backup}

Використовуйте власний архівний формат PostgreSQL і перевіряйте архів, перш ніж вважати копію завершеною:

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

Перевіряйте кожну резервну копію, відновлюючи її в ізольованому стеку, звіряючи записи бази даних і контрольні суми файлів та запускаючи застосунок. `tests/qa/backup-restore-drill.sh` у репозиторії автоматизує цю релізну перевірку на явному `QA_IMAGE`.

Якщо ваша платформа замість цього робить знімки томів, узгоджені після збою, спершу зупиніть увесь стек і зробіть знімок усіх критичних томів як єдиного набору. Сире копіювання каталогу даних PostgreSQL із запущеного контейнера не є підтримуваною логічною резервною копією.

### Резервне копіювання файлів і черг {#file-and-queue-backup}

Призупиніть застосунок перед створенням копій томів файлів і черг. Використайте `docker inspect`, щоб визначити фактичну назву тому, примусово збережіть поточний стан Redis і архівуйте зі збереженням власника та прав доступу:

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

Перезапускайте Redis перед застосунком. Якщо ви навмисно виключаєте `/data/ai`, видаліть усе піддерево AI, а не зберігайте запис `installed.json` без його моделей або віртуального середовища. Тримайте резервні копії зашифрованими, з контролем доступу та окремо від хоста, на якому працює SnapOtter.

## Артефакти відповідності {#compliance-artifacts}

Кожен реліз SnapOtter містить такі артефакти безпеки:

| Артефакт | Формат | Де знайти |
|---|---|---|
| Прив'язка суб'єкта релізу | Канонічний JSON + атестація GitHub | Ресурс [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases): `snapotter-v{version}-release-subjects.json` |
| SBOM архіву | CycloneDX і SPDX JSON | Ресурси релізу: `snapotter-v{version}-archive-linux-{arch}-sbom.{cdx,spdx}.json` |
| SBOM образу | CycloneDX і SPDX JSON | Ресурси релізу: `snapotter-v{version}-image-linux-{arch}-sbom.{cdx,spdx}.json` |
| Сканування вразливостей | Trivy JSON | Ресурси релізу з відповідними префіксами `archive-linux-{arch}` або `image-linux-{arch}` |
| Сканування вразливостей | SARIF | Вкладка [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security) |
| Статичний аналіз | CodeQL (JS/TS + Python) | Вкладка [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security), запускається щотижня та для кожного PR |
| Перевірка залежностей | Вбудована в GitHub | Перевірка для кожного PR, завершується помилкою при додаванні залежностей із високим ризиком |
| Аудит залежностей Python | pip-audit | Журнал запуску CI при кожному push |
| Політика безпеки | Markdown | [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) у репозиторії |
| Оновлення залежностей | Dependabot | Автоматичні щотижневі PR для npm, pip, Docker, Actions |

**Власне сканування:**

Завантажте маніфест суб'єкта релізу та перевірте, що його атестовано релізним робочим процесом:

```bash
gh attestation verify snapotter-v2.3.0-release-subjects.json \
  --repo snapotter-hq/SnapOtter \
  --signer-workflow snapotter-hq/SnapOtter/.github/workflows/release.yml
```

Маніфест окремо фіксує `releaseTag`, `releaseCommit` і `workflowTriggerCommit`. Переконайтеся, що `releaseCommit` є комітом, отриманим з незмінного тега, а потім звірте SHA-256 digest архіву, образу, SBOM або результатів сканування, які ви використовуєте, з відповідним записом у `subjects`. Це розрізнення навмисне: перехід на щойно створений коміт релізу не змінює ідентичність коміту в OIDC-обліковних даних робочого процесу.

Також можна просканувати завантажений SBOM або безпосередньо образ:

```bash
# Scan with Grype using the CycloneDX SBOM
grype sbom:snapotter-v2.3.0-image-linux-amd64-sbom.cdx.json

# Scan with Trivy using the SPDX SBOM
trivy sbom snapotter-v2.3.0-image-linux-amd64-sbom.spdx.json

# Scan the Docker image directly
trivy image snapotter/snapotter:2.3.0
```

::: info 
SBOM і результати сканування образів відображають точний образ для конкретної архітектури, опублікований для цього релізу. SBOM і результати сканування архівів окремо описують попередньо зібраний архів. AI-пакети моделей, встановлені після розгортання, не входять до цих SBOM, бо завантажуються під час роботи.
:::
