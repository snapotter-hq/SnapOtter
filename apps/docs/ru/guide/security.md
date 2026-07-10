---
description: "Руководство по усилению безопасности SnapOtter. Безопасность контейнеров, изоляция сети, секреты Docker, развёртывание в Kubernetes и артефакты соответствия."
i18n_source_hash: c682d19a84ce
i18n_provenance: human
i18n_output_hash: 6674520f2ea8
---

# Безопасность и усиление защиты {#security-hardening}

SnapOtter обрабатывает файлы полностью на вашей инфраструктуре. По умолчанию он отправляет анонимную продуктовую аналитику без содержимого и отчёты о сбоях, чтобы помочь улучшить проект. Он никогда не отправляет ваши файлы, имена файлов, содержимое файлов, вывод OCR, метаданные изображений или текст документов. Необязательная обратная связь отправляется только после того, как пользователь её отправит, только когда аналитика включена, а контактные поля включаются только с явного согласия на предоставление контактных данных. Администратор может отключить сбор аналитики и обратной связи в один клик в разделе Settings > System > Privacy, без пересборки. Обработка файлов всегда остаётся внутри вашего контейнера.

Контейнер работает под выделенным пользователем без прав root (`snapotter`) со сброшенными всеми возможностями Linux, кроме минимально необходимого набора. Полную политику раскрытия уязвимостей и архитектуру безопасности смотрите в [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) на GitHub.

## Усиление защиты контейнера {#container-hardening}

[Файл docker-compose.yml по умолчанию](https://github.com/snapotter-hq/SnapOtter/blob/main/docker/docker-compose.yml) включает усиление безопасности для промышленной эксплуатации. Ниже приведён разбор каждой опции и почему она важна:

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

### Почему `no-new-privileges` не установлен {#why-no-new-privileges-is-not-set}

`security_opt: [no-new-privileges:true]` намеренно опущен. Точка входа запускается под root, чтобы исправить владельца тома, затем сбрасывает права до пользователя `snapotter` через [gosu](https://github.com/tianon/gosu), для чего требуется setuid. После завершения сброса привилегий процесс работает под `snapotter` со всеми возможностями, кроме пяти перечисленных выше, удалёнными.

Если вы используете Kubernetes или флаг Docker `--user` для прямого запуска без прав root (в обход gosu), `no-new-privileges` можно безопасно включить.

### Почему `read_only` не установлен {#why-read-only-is-not-set}

`read_only: true` не установлен, потому что переназначение PUID/PGID записывает в `/etc/passwd` и `/etc/group` при запуске. Если вместо PUID/PGID вы используете флаг Docker `--user` или `runAsUser` в Kubernetes, вы можете безопасно включить корневую файловую систему в режиме только для чтения.

## Изоляция сети {#network-isolation}

Во время нормальной работы контейнер устанавливает **ноль исходящих сетевых соединений**. Вся обработка файлов происходит локально с использованием встроенных библиотек.

```
Browser  -->  Reverse Proxy (TLS)  -->  SnapOtter container  -->  (nothing)
```

Единственное исключение, **загрузка моделей ИИ**: когда пользователь устанавливает набор функций ИИ через интерфейс, контейнер загружает файлы моделей из GitHub Releases и PyPI. Эти загрузки происходят один раз на набор и хранятся в томе `/data`.

**Рекомендации по межсетевому экрану:**

| Сценарий | Правило для исходящего трафика |
|---|---|
| Изолированная среда (без ИИ) | Заблокировать весь исходящий трафик от контейнера |
| Нужны наборы ИИ | Разрешить HTTPS к `github.com`, `objects.githubusercontent.com`, `pypi.org`, `files.pythonhosted.org` во время установки, затем заблокировать |
| После установки ИИ | Заблокировать весь исходящий трафик (модели кешируются локально) |

Конфигурацию обратного прокси (Nginx, Traefik, Caddy, Cloudflare Tunnels) смотрите в [руководстве по развёртыванию](/ru/guide/deployment#reverse-proxy).

## Секреты Docker {#docker-secrets}

Для промышленных развёртываний избегайте передачи секретов в виде переменных окружения в открытом виде. Точка входа поддерживает соглашение Docker `_FILE`: смонтируйте секрет как файл и установите соответствующую переменную `_FILE` в его путь.

**Поддерживаемые секреты:**

| Переменная | Эквивалент `_FILE` |
|---|---|
| `DEFAULT_PASSWORD` | `DEFAULT_PASSWORD_FILE` |
| `COOKIE_SECRET` | `COOKIE_SECRET_FILE` |
| `OIDC_CLIENT_SECRET` | `OIDC_CLIENT_SECRET_FILE` |
| `S3_ACCESS_KEY_ID` | `S3_ACCESS_KEY_ID_FILE` |
| `S3_SECRET_ACCESS_KEY` | `S3_SECRET_ACCESS_KEY_FILE` |
| `SNAPOTTER_LICENSE_KEY` | `SNAPOTTER_LICENSE_KEY_FILE` |

**Пример с секретами Docker Compose:**

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
Секреты Docker Compose (без Swarm) требуют Compose v2.23 или новее.
:::

## Развёртывание в Kubernetes {#kubernetes-deployment}

Точка входа определяет, когда контейнер уже работает без прав root (например, через `runAsUser` в Kubernetes), и автоматически пропускает сброс привилегий gosu. В этом случае она не может самостоятельно выполнить chown смонтированных томов, поэтому проверяет их доступность для записи и завершается заранее с практическими рекомендациями, если они недоступны для записи. Смотрите [Разрешения хранилища](/ru/guide/deployment#storage-permissions) для конфигураций `fsGroup` и чужих UID (TrueNAS, OpenShift).

**Рекомендуемый SecurityContext для Pod:**

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

Поскольку `runAsUser: 999` установлен на уровне pod, точка входа полностью пропускает gosu. Это позволяет возможностям `allowPrivilegeEscalation: false` и `drop: [ALL]` работать без конфликтов.

По подбору ресурсов смотрите [Требования к оборудованию](/ru/guide/deployment#hardware-requirements).

## Резервное копирование и восстановление {#backup-and-recovery}

Постоянное состояние распределено между двумя томами:

| Том | Содержимое | Критичен? |
|---|---|---|
| `SnapOtter-pgdata` | База данных PostgreSQL (пользователи, настройки, конвейеры, задания, журнал аудита) | Да |
| `/data` (том приложения) | Загруженные пользователями файлы, модели ИИ, venv Python | Частично (см. ниже) |

Внутри тома `/data`:

| Путь | Содержимое | Критичен? |
|---|---|---|
| `/data/uploads/`, `/data/outputs/` | Файлы пользователей и результаты обработки | Да |
| `/data/ai/` | Загруженные файлы моделей ИИ | Нет (можно загрузить повторно) |
| `/data/venv/` | Виртуальное окружение Python | Нет (пересобирается при запуске) |

### Резервное копирование базы данных {#database-backup}

Используйте `pg_dump` для резервного копирования базы данных, пока стек работает:

```bash
# Dump the database
docker exec SnapOtter-postgres pg_dump -U snapotter snapotter > backup.sql

# Restore into a fresh database
cat backup.sql | docker exec -i SnapOtter-postgres psql -U snapotter snapotter
```

В качестве альтернативы остановите стек и сделайте снимок тома `SnapOtter-pgdata`:

```bash
docker compose down
docker run --rm -v SnapOtter-pgdata:/data -v $(pwd)/backup:/backup \
  alpine tar czf /backup/snapotter-pgdata.tar.gz -C /data .
```

### Резервное копирование файлов пользователей {#user-files-backup}

```bash
# Snapshot the app data volume (excluding re-downloadable AI models)
docker run --rm -v SnapOtter-data:/data -v $(pwd)/backup:/backup \
  alpine tar czf /backup/snapotter-files.tar.gz \
    --exclude='ai' --exclude='venv' -C /data .
```

Модели ИИ в сумме занимают примерно до 24 ГБ по всем наборам. Поскольку их можно загрузить повторно, исключите `/data/ai/` и `/data/venv/` из резервных копий для экономии места. Критичны только база данных и файлы пользователей.

## Артефакты соответствия {#compliance-artifacts}

Каждый выпуск SnapOtter включает следующие артефакты безопасности:

| Артефакт | Формат | Где найти |
|---|---|---|
| SBOM (CycloneDX) | JSON | Ресурс [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases): `snapotter-v{version}-sbom.cdx.json` |
| SBOM (SPDX) | JSON | Ресурс [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases): `snapotter-v{version}-sbom.spdx.json` |
| Сканирование уязвимостей | Trivy JSON | Ресурс [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases): `snapotter-v{version}-trivy.json` |
| Сканирование уязвимостей | SARIF | Вкладка [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security) |
| Статический анализ | CodeQL (JS/TS + Python) | Вкладка [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security), запускается еженедельно + для каждого PR |
| Проверка зависимостей | Встроенная в GitHub | Проверка для каждого PR, завершается ошибкой при добавлении зависимостей с высокой критичностью |
| Аудит зависимостей Python | pip-audit | Журнал запуска CI при каждом push |
| Политика безопасности | Markdown | [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) в репозитории |
| Обновления зависимостей | Dependabot | Автоматические еженедельные PR для npm, pip, Docker, Actions |

**Запуск собственного сканирования:**

Загрузите SBOM из выпуска и просканируйте его предпочтительным инструментом:

```bash
# Scan with Grype using the CycloneDX SBOM
grype sbom:snapotter-v1.17.2-sbom.cdx.json

# Scan with Trivy using the SPDX SBOM
trivy sbom snapotter-v1.17.2-sbom.spdx.json

# Scan the Docker image directly
trivy image snapotter/snapotter:1.17.2
```

::: info 
SBOM и сканирование уязвимостей отражают точный образ, опубликованный для этого выпуска. Наборы моделей ИИ, установленные после развёртывания, не включены в SBOM, поскольку они загружаются во время выполнения.
:::
