---
description: "Посібник із посилення безпеки SnapOtter. Безпека контейнерів, ізоляція мережі, секрети Docker, розгортання в Kubernetes та артефакти відповідності."
i18n_source_hash: c682d19a84ce
i18n_provenance: human
i18n_output_hash: a87d10525207
---

# Безпека та посилення захисту {#security-hardening}

SnapOtter обробляє файли повністю у вашій інфраструктурі. За замовчуванням він надсилає анонімну аналітику продукту без вмісту та звіти про збої, щоб допомогти покращити проєкт. Він ніколи не надсилає ваші файли, імена файлів, вміст файлів, результати OCR, метадані зображень чи текст документів. Необов'язковий відгук надсилається лише після того, як користувач його надішле, лише коли аналітику увімкнено, а контактні поля включаються лише за явної згоди на контакт. Адміністратор може вимкнути аналітику та збір відгуків одним кліком у розділі Settings > System > Privacy, без потреби у повторній збірці. Обробка файлів завжди залишається всередині вашого контейнера.

Контейнер працює від імені виділеного користувача без прав root (`snapotter`) з відкинутими всіма можливостями Linux, окрім мінімально необхідного набору. Повну політику розкриття вразливостей та архітектуру безпеки дивіться у [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) на GitHub.

## Посилення захисту контейнера {#container-hardening}

[Стандартний docker-compose.yml](https://github.com/snapotter-hq/SnapOtter/blob/main/docker/docker-compose.yml) містить посилення безпеки для продакшену. Ось розбір кожного параметра та чому він важливий:

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

`security_opt: [no-new-privileges:true]` навмисно пропущено. Точка входу стартує від імені root, щоб виправити власника томів, а потім знижує привілеї до користувача `snapotter` через [gosu](https://github.com/tianon/gosu), що потребує setuid. Після завершення зниження привілеїв процес працює від імені `snapotter` з усіма можливостями, окрім п'яти перелічених вище, видаленими.

Якщо ви використовуєте Kubernetes або прапорець Docker `--user`, щоб запускати процес без прав root напряму (в обхід gosu), `no-new-privileges` можна безпечно ввімкнути.

### Чому `read_only` не встановлено {#why-read-only-is-not-set}

`read_only: true` не встановлено, оскільки перемапування PUID/PGID виконує запис до `/etc/passwd` та `/etc/group` під час запуску. Якщо ви використовуєте прапорець Docker `--user` або Kubernetes `runAsUser` замість PUID/PGID, ви можете безпечно ввімкнути кореневу файлову систему лише для читання.

## Ізоляція мережі {#network-isolation}

Під час звичайної роботи контейнер робить **нуль вихідних мережевих з'єднань**. Уся обробка файлів відбувається локально за допомогою вбудованих бібліотек.

```
Browser  -->  Reverse Proxy (TLS)  -->  SnapOtter container  -->  (nothing)
```

Єдиний виняток - це **завантаження AI-моделей**: коли користувач встановлює набір AI-функцій через інтерфейс, контейнер завантажує файли моделей із GitHub Releases та PyPI. Ці завантаження відбуваються один раз на набір і зберігаються у томі `/data`.

**Рекомендації щодо фаєрвола:**

| Сценарій | Правило для вихідного трафіку |
|---|---|
| Ізольована мережа (без AI) | Заблокувати весь вихідний трафік із контейнера |
| Потрібні набори AI | Дозволити HTTPS до `github.com`, `objects.githubusercontent.com`, `pypi.org`, `files.pythonhosted.org` під час встановлення, потім заблокувати |
| Після встановлення AI | Заблокувати весь вихідний трафік - моделі кешуються локально |

Щодо конфігурації зворотного проксі (Nginx, Traefik, Caddy, Cloudflare Tunnels) дивіться [Посібник із розгортання](/uk/guide/deployment#reverse-proxy).

## Секрети Docker {#docker-secrets}

Для продакшн-розгортань уникайте передавання секретів як звичайних текстових змінних середовища. Точка входу підтримує угоду Docker `_FILE`: змонтуйте секрет як файл і встановіть відповідну змінну `_FILE` на його шлях.

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
Секрети Docker Compose (без Swarm) потребують Compose v2.23 чи новіше.
:::

## Розгортання в Kubernetes {#kubernetes-deployment}

Точка входу виявляє, коли контейнер уже працює без прав root (наприклад, через Kubernetes `runAsUser`), і автоматично пропускає зниження привілеїв через gosu. У цьому випадку вона не може самостійно змінити власника змонтованих томів, тож перевіряє, чи доступні вони для запису, і завершує роботу заздалегідь із дієвими вказівками, якщо це не так — дивіться [Дозволи на сховище](/uk/guide/deployment#storage-permissions) для `fsGroup` та налаштувань зі стороннім UID (TrueNAS, OpenShift).

**Рекомендований SecurityContext для Pod:**

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

Оскільки `runAsUser: 999` встановлено на рівні pod, точка входу повністю пропускає gosu. Це дозволяє можливості `allowPrivilegeEscalation: false` та `drop: [ALL]` без конфліктів.

Щодо визначення розміру ресурсів дивіться [Апаратні вимоги](/uk/guide/deployment#hardware-requirements).

## Резервне копіювання та відновлення {#backup-and-recovery}

Постійний стан розділено між двома томами:

| Том | Вміст | Критичний? |
|---|---|---|
| `SnapOtter-pgdata` | База даних PostgreSQL (користувачі, налаштування, конвеєри, завдання, журнал аудиту) | Так |
| `/data` (том застосунку) | Завантажені користувачами файли, AI-моделі, віртуальне середовище Python | Частково (дивіться нижче) |

Усередині тому `/data`:

| Шлях | Вміст | Критичний? |
|---|---|---|
| `/data/uploads/`, `/data/outputs/` | Файли користувачів і результати обробки | Так |
| `/data/ai/` | Завантажені файли AI-моделей | Ні (можна завантажити повторно) |
| `/data/venv/` | Віртуальне середовище Python | Ні (перебудовується під час запуску) |

### Резервне копіювання бази даних {#database-backup}

Скористайтеся `pg_dump`, щоб створити резервну копію бази даних, поки стек працює:

```bash
# Dump the database
docker exec SnapOtter-postgres pg_dump -U snapotter snapotter > backup.sql

# Restore into a fresh database
cat backup.sql | docker exec -i SnapOtter-postgres psql -U snapotter snapotter
```

Альтернативно зупиніть стек і зробіть знімок тому `SnapOtter-pgdata`:

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

AI-моделі загалом займають до приблизно 24 ГБ по всіх наборах. Оскільки їх можна завантажити повторно, виключіть `/data/ai/` та `/data/venv/` з резервних копій, щоб заощадити місце. Критичними є лише база даних і файли користувачів.

## Артефакти відповідності {#compliance-artifacts}

Кожен випуск SnapOtter містить такі артефакти безпеки:

| Артефакт | Формат | Де знайти |
|---|---|---|
| SBOM (CycloneDX) | JSON | Актив [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases): `snapotter-v{version}-sbom.cdx.json` |
| SBOM (SPDX) | JSON | Актив [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases): `snapotter-v{version}-sbom.spdx.json` |
| Сканування вразливостей | Trivy JSON | Актив [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases): `snapotter-v{version}-trivy.json` |
| Сканування вразливостей | SARIF | Вкладка [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security) |
| Статичний аналіз | CodeQL (JS/TS + Python) | Вкладка [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security), запускається щотижня + на кожен PR |
| Огляд залежностей | Нативний GitHub | Перевірка на кожен PR, дає збій у разі додавання залежностей високої серйозності |
| Аудит залежностей Python | pip-audit | Журнал запуску CI на кожен push |
| Політика безпеки | Markdown | [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) у репозиторії |
| Оновлення залежностей | Dependabot | Автоматизовані щотижневі PR для npm, pip, Docker, Actions |

**Запуск власного сканування:**

Завантажте SBOM із випуску та проскануйте його інструментом на ваш вибір:

```bash
# Scan with Grype using the CycloneDX SBOM
grype sbom:snapotter-v1.17.2-sbom.cdx.json

# Scan with Trivy using the SPDX SBOM
trivy sbom snapotter-v1.17.2-sbom.spdx.json

# Scan the Docker image directly
trivy image snapotter/snapotter:1.17.2
```

::: info 
SBOM і сканування вразливостей відображають точний образ, опублікований для цього випуску. Набори AI-моделей, встановлені після розгортання, не включаються до SBOM, оскільки вони завантажуються під час виконання.
:::
