---
description: "Посібник із посилення безпеки для SnapOtter. Безпека контейнерів, мережева ізоляція, секрети Docker, розгортання в Kubernetes та артефакти відповідності."
i18n_source_hash: 986f7658430c
i18n_provenance: machine
i18n_output_hash: 6b9158af7666
---

# Безпека та посилення {#security-hardening}

SnapOtter обробляє файли повністю на вашій інфраструктурі. Він за замовчуванням надсилає анонімну продуктову аналітику й звіти про збої без вмісту, щоб допомогти покращити проєкт. Він ніколи не надсилає ваші файли, імена файлів, вміст файлів, вивід OCR, метадані зображень чи текст документів. Необов'язковий відгук надсилається лише після того, як користувач його подасть, лише коли аналітика увімкнена, а контактні поля включаються лише за явної згоди на контакт. Адміністратор може вимкнути збір аналітики й відгуків одним кліком у Settings > System > Privacy, без потреби у повторному збиранні. Обробка файлів завжди залишається всередині вашого контейнера.

Контейнер працює від імені виділеного не-root користувача (`snapotter`) з усіма скиненими можливостями Linux, окрім мінімального необхідного набору. Щодо повної політики розкриття вразливостей і архітектури безпеки див. [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) на GitHub.

## Посилення контейнера {#container-hardening}

[Стандартний docker-compose.yml](https://github.com/snapotter-hq/SnapOtter/blob/main/docker/docker-compose.yml) містить посилення безпеки для продакшену. Ось розбір кожного параметра й чому він важливий:

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    ports:
      # Bind to localhost only for internet-facing deployments:
      - "127.0.0.1:1349:1349"
    volumes:
      - SnapOtter-data:/data
      - SnapOtter-workspace:/tmp/workspace
    environment:
      - AUTH_ENABLED=true
      - DEFAULT_PASSWORD=change-me-immediately
      - RATE_LIMIT_PER_MIN=1000
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
      - REDIS_URL=redis://redis:6379
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy

    # --- Resource limits ---
    mem_limit: 6g            # Prevents runaway memory from crashing the host
    memswap_limit: 6g        # No swap - fail fast instead of degrading the host
    cpus: 4                  # Cap CPU usage to 4 cores
    pids_limit: 512          # Prevents fork bombs

    # --- Capability restrictions ---
    cap_drop:
      - ALL                  # Drop ALL Linux capabilities first
    cap_add:
      - CHOWN                # Needed for volume permission setup
      - SETUID               # Needed for gosu privilege drop (root -> snapotter)
      - SETGID               # Needed for gosu privilege drop
      - DAC_OVERRIDE         # Needed for volume permission setup
      - FOWNER               # Needed for volume permission setup

    # --- Logging ---
    logging:
      driver: json-file
      options:
        max-size: "50m"      # Rotate logs at 50 MB
        max-file: "5"        # Keep 5 rotated log files

    # --- Health check ---
    healthcheck:
      test: ["CMD", "curl", "-sf", "--max-time", "5", "http://localhost:1349/api/v1/health"]
      interval: 30s
      timeout: 5s
      start_period: 60s
      retries: 3

    shm_size: "2gb"          # Required for Python ML shared memory
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
      start_period: 15s

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
      start_period: 10s

volumes:
  SnapOtter-data:
  SnapOtter-workspace:
  SnapOtter-pgdata:
  SnapOtter-redisdata:
```

### Чому `no-new-privileges` не встановлено {#why-no-new-privileges-is-not-set}

`security_opt: [no-new-privileges:true]` навмисно пропущено. Точка входу стартує від root, щоб виправити власника томів, потім скидається до користувача `snapotter` через [gosu](https://github.com/tianon/gosu), що потребує setuid. Щойно скидання привілеїв завершується, процес працює від імені `snapotter` з усіма можливостями, окрім п'яти перелічених вище, видаленими.

Якщо ви використовуєте Kubernetes або прапорець `--user` Docker для запуску безпосередньо від імені не-root (в обхід gosu), `no-new-privileges` безпечно вмикати.

### Чому `read_only` не встановлено {#why-read-only-is-not-set}

`read_only: true` не встановлено, оскільки перепризначення PUID/PGID записує в `/etc/passwd` і `/etc/group` під час запуску. Якщо ви використовуєте прапорець `--user` Docker або `runAsUser` Kubernetes замість PUID/PGID, ви можете безпечно увімкнути кореневу файлову систему тільки для читання.

## Мережева ізоляція {#network-isolation}

Під час звичайної роботи контейнер робить **нуль вихідних мережевих з'єднань**. Уся обробка файлів відбувається локально з використанням вбудованих бібліотек.

```
Browser  -->  Reverse Proxy (TLS)  -->  SnapOtter container  -->  (nothing)
```

Єдиний виняток — це **завантаження моделей AI**: коли користувач встановлює бандл функцій AI через UI, контейнер завантажує заздалегідь зібраний архів бандла з Hugging Face, плюс кілька окремих файлів моделей із GitHub Releases, Google Storage і PyPI. Ці завантаження відбуваються один раз на бандл і зберігаються в томі `/data`.

**Рекомендації щодо фаєрволу:**

| Сценарій | Правило для вихідного трафіку |
|---|---|
| Ізольований (без AI) | Заблокувати весь вихідний трафік від контейнера |
| Потрібні бандли AI | Дозволити HTTPS до `huggingface.co`, `*.xethub.hf.co`, `cdn-lfs.huggingface.co`, `github.com`, `objects.githubusercontent.com`, `storage.googleapis.com`, `pypi.org`, `files.pythonhosted.org` під час встановлення, потім заблокувати |
| Після встановлення AI | Заблокувати весь вихідний трафік — моделі кешуються локально |

Архіви бандлів обслуговуються зі сховища Xet від Hugging Face, яке передає через кінцеві точки `*.xethub.hf.co` паралельно і завдяки чому завантаження багатогігабайтних бандлів швидке. Якщо ваш фаєрвол дозволяє `huggingface.co`, але блокує `*.xethub.hf.co`, встановлення все одно вдаються, але переходять на повільніше однопотокове завантаження, тож додайте хости Xet до дозволеного списку, щоб залишатися на швидкому шляху. Повністю офлайн-встановлення можуть пропустити все це й натомість використати [Імпорт офлайн-бандлів](/uk/guide/deployment).

Щодо конфігурації зворотного проксі (Nginx, Traefik, Caddy, Cloudflare Tunnels) див. [посібник із розгортання](/uk/guide/deployment#reverse-proxy).

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

Постійний стан розділений між двома томами:

| Том | Вміст | Критичний? |
|---|---|---|
| `SnapOtter-pgdata` | База даних PostgreSQL (користувачі, налаштування, конвеєри, завдання, журнал аудиту) | Так |
| `/data` (том застосунку) | Завантажені користувачами файли, моделі AI, Python venv | Частково (див. нижче) |

У межах тому `/data`:

| Шлях | Вміст | Критичний? |
|---|---|---|
| `/data/uploads/`, `/data/outputs/` | Файли користувачів і результати обробки | Так |
| `/data/ai/` | Завантажені файли моделей AI | Ні (можна завантажити повторно) |
| `/data/venv/` | Віртуальне середовище Python | Ні (перезбирається під час запуску) |

### Резервне копіювання бази даних {#database-backup}

Використовуйте `pg_dump`, щоб зробити резервну копію бази даних, поки стек працює:

```bash
# Dump the database
docker exec SnapOtter-postgres pg_dump -U snapotter snapotter > backup.sql

# Restore into a fresh database
cat backup.sql | docker exec -i SnapOtter-postgres psql -U snapotter snapotter
```

Як альтернатива, зупиніть стек і зробіть знімок тому `SnapOtter-pgdata`:

```bash
docker compose down
docker run --rm -v SnapOtter-pgdata:/data -v $(pwd)/backup:/backup \
  alpine tar czf /backup/snapotter-pgdata.tar.gz -C /data .
```

### Резервне копіювання файлів користувачів {#user-files-backup}

```bash
# Snapshot the app data volume (excluding re-downloadable AI models)
docker run --rm -v SnapOtter-data:/data -v $(pwd)/backup:/backup \
  alpine tar czf /backup/snapotter-files.tar.gz \
    --exclude='ai' --exclude='venv' -C /data .
```

Моделі AI разом сягають близько 24 GB для всіх бандлів. Оскільки їх можна завантажити повторно, виключіть `/data/ai/` і `/data/venv/` з резервних копій, щоб заощадити місце. Критичними є лише база даних і файли користувачів.

## Артефакти відповідності {#compliance-artifacts}

Кожен реліз SnapOtter містить такі артефакти безпеки:

| Артефакт | Формат | Де його знайти |
|---|---|---|
| SBOM (CycloneDX) | JSON | Ресурс [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases): `snapotter-v{version}-sbom.cdx.json` |
| SBOM (SPDX) | JSON | Ресурс [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases): `snapotter-v{version}-sbom.spdx.json` |
| Сканування вразливостей | Trivy JSON | Ресурс [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases): `snapotter-v{version}-trivy.json` |
| Сканування вразливостей | SARIF | Вкладка [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security) |
| Статичний аналіз | CodeQL (JS/TS + Python) | Вкладка [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security), запускається щотижня + на кожен PR |
| Огляд залежностей | Нативний GitHub | Перевірка на кожен PR, дає збій при додаваннях високої серйозності |
| Аудит залежностей Python | pip-audit | Журнал запуску CI при кожному push |
| Політика безпеки | Markdown | [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) у репозиторії |
| Оновлення залежностей | Dependabot | Автоматизовані щотижневі PR для npm, pip, Docker, Actions |

**Запуск власного сканування:**

Завантажте SBOM з релізу й проскануйте його за допомогою бажаного інструмента:

```bash
# Scan with Grype using the CycloneDX SBOM
grype sbom:snapotter-v1.17.2-sbom.cdx.json

# Scan with Trivy using the SPDX SBOM
trivy sbom snapotter-v1.17.2-sbom.spdx.json

# Scan the Docker image directly
trivy image snapotter/snapotter:1.17.2
```

::: info 
SBOM і сканування вразливостей відображають точний образ, опублікований для того релізу. Бандли моделей AI, встановлені після розгортання, не включені до SBOM, оскільки вони завантажуються під час виконання.
:::
