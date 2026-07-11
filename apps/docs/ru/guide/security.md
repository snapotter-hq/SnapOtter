---
description: "Руководство по усилению безопасности SnapOtter. Безопасность контейнеров, сетевая изоляция, Docker secrets, развёртывание в Kubernetes и артефакты соответствия требованиям."
i18n_source_hash: 986f7658430c
i18n_provenance: machine
i18n_output_hash: 712ae054624d
---

# Безопасность и усиление защиты {#security-hardening}

SnapOtter обрабатывает файлы полностью на вашей инфраструктуре. По умолчанию он отправляет анонимную продуктовую аналитику без содержимого и отчёты об аварийных сбоях, чтобы помочь улучшить проект. Он никогда не отправляет ваши файлы, имена файлов, содержимое файлов, вывод OCR, метаданные изображений или текст документов. Опциональная обратная связь отправляется только после того, как пользователь её отправит, только когда аналитика включена, а контактные поля включаются только при явном согласии на контакт. Администратор может отключить сбор аналитики и обратной связи в один клик в разделе Settings > System > Privacy, пересборка не требуется. Обработка файлов всегда остаётся внутри вашего контейнера.

Контейнер работает от имени выделенного не-root пользователя (`snapotter`) со сброшенными всеми возможностями Linux, кроме минимально необходимого набора. Полную политику раскрытия уязвимостей и архитектуру безопасности см. в [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) на GitHub.

## Усиление защиты контейнера {#container-hardening}

[Стандартный docker-compose.yml](https://github.com/snapotter-hq/SnapOtter/blob/main/docker/docker-compose.yml) включает усиление защиты для продакшена. Ниже разбор каждой опции и почему она важна:

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

`security_opt: [no-new-privileges:true]` намеренно опущен. Точка входа запускается как root, чтобы исправить владение томами, затем понижается до пользователя `snapotter` через [gosu](https://github.com/tianon/gosu), который требует setuid. После завершения понижения привилегий процесс работает как `snapotter` со всеми возможностями, кроме пяти перечисленных выше, которые удалены.

Если вы используете Kubernetes или флаг `--user` Docker для прямого запуска от имени не-root (в обход gosu), `no-new-privileges` можно безопасно включить.

### Почему `read_only` не установлен {#why-read-only-is-not-set}

`read_only: true` не установлен, потому что переназначение PUID/PGID записывает в `/etc/passwd` и `/etc/group` при запуске. Если вы используете флаг `--user` Docker или `runAsUser` Kubernetes вместо PUID/PGID, вы можете безопасно включить корневую файловую систему только для чтения.

## Сетевая изоляция {#network-isolation}

Во время нормальной работы контейнер устанавливает **нулевое число исходящих сетевых соединений**. Вся обработка файлов происходит локально с использованием встроенных библиотек.

```
Browser  -->  Reverse Proxy (TLS)  -->  SnapOtter container  -->  (nothing)
```

Единственное исключение составляют **загрузки моделей ИИ**: когда пользователь устанавливает пакет функций ИИ через интерфейс, контейнер загружает готовый архив пакета из Hugging Face, плюс несколько отдельных файлов моделей из GitHub Releases, Google Storage и PyPI. Эти загрузки происходят один раз на пакет и хранятся в томе `/data`.

**Рекомендации по межсетевому экрану:**

| Сценарий | Правило для исходящего трафика |
|---|---|
| Изолированная сеть (без ИИ) | Блокировать весь исходящий трафик из контейнера |
| Нужны ИИ-пакеты | Разрешить HTTPS к `huggingface.co`, `*.xethub.hf.co`, `cdn-lfs.huggingface.co`, `github.com`, `objects.githubusercontent.com`, `storage.googleapis.com`, `pypi.org`, `files.pythonhosted.org` во время установки, затем блокировать |
| После установки ИИ | Блокировать весь исходящий трафик, модели кешируются локально |

Архивы пакетов раздаются из хранилища Xet Hugging Face, которое передаёт данные через эндпоинты `*.xethub.hf.co` параллельно и делает загрузки многогигабайтных пакетов быстрыми. Если ваш межсетевой экран разрешает `huggingface.co`, но блокирует `*.xethub.hf.co`, установки всё равно проходят успешно, но переходят на более медленную загрузку в одном потоке, поэтому добавьте хосты Xet в список разрешённых, чтобы оставаться на быстром пути. Полностью офлайн-установки могут пропустить всё это и использовать [Импорт офлайн-пакета](/ru/guide/deployment) вместо этого.

Для настройки обратного прокси (Nginx, Traefik, Caddy, Cloudflare Tunnels) см. [руководство по развёртыванию](/ru/guide/deployment#reverse-proxy).

## Docker Secrets {#docker-secrets}

Для продакшен-развёртываний избегайте передачи секретов как переменных окружения в открытом виде. Точка входа поддерживает соглашение `_FILE` Docker: смонтируйте секрет как файл и установите соответствующую переменную `_FILE` на его путь.

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

Точка входа определяет, когда контейнер уже работает от имени не-root (например, через `runAsUser` Kubernetes), и автоматически пропускает понижение привилегий gosu. В этом случае она не может сама сменить владельца смонтированных томов, поэтому проверяет, что они доступны для записи, и завершается заранее с полезными указаниями, если это не так. См. [Права доступа к хранилищу](/ru/guide/deployment#storage-permissions) для `fsGroup` и настроек с чужим UID (TrueNAS, OpenShift).

**Рекомендуемый SecurityContext пода:**

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

Поскольку `runAsUser: 999` установлен на уровне пода, точка входа полностью пропускает gosu. Это позволяет возможности `allowPrivilegeEscalation: false` и `drop: [ALL]` без конфликта.

Для подбора ресурсов см. [Требования к оборудованию](/ru/guide/deployment#hardware-requirements).

## Резервное копирование и восстановление {#backup-and-recovery}

Постоянное состояние разделено между двумя томами:

| Том | Содержимое | Критично? |
|---|---|---|
| `SnapOtter-pgdata` | База данных PostgreSQL (пользователи, настройки, конвейеры, задания, журнал аудита) | Да |
| `/data` (том app) | Загруженные пользователями файлы, модели ИИ, Python venv | Частично (см. ниже) |

Внутри тома `/data`:

| Путь | Содержимое | Критично? |
|---|---|---|
| `/data/uploads/`, `/data/outputs/` | Пользовательские файлы и результаты обработки | Да |
| `/data/ai/` | Загруженные файлы моделей ИИ | Нет (можно загрузить заново) |
| `/data/venv/` | Виртуальное окружение Python | Нет (пересобирается при старте) |

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

### Резервное копирование пользовательских файлов {#user-files-backup}

```bash
# Snapshot the app data volume (excluding re-downloadable AI models)
docker run --rm -v SnapOtter-data:/data -v $(pwd)/backup:/backup \
  alpine tar czf /backup/snapotter-files.tar.gz \
    --exclude='ai' --exclude='venv' -C /data .
```

Модели ИИ в сумме занимают до примерно 24 ГБ по всем пакетам. Поскольку их можно загрузить заново, исключите `/data/ai/` и `/data/venv/` из резервных копий, чтобы сэкономить место. Критичны только база данных и пользовательские файлы.

## Артефакты соответствия требованиям {#compliance-artifacts}

Каждый релиз SnapOtter включает следующие артефакты безопасности:

| Артефакт | Формат | Где найти |
|---|---|---|
| SBOM (CycloneDX) | JSON | Ассет [релиза GitHub](https://github.com/snapotter-hq/SnapOtter/releases): `snapotter-v{version}-sbom.cdx.json` |
| SBOM (SPDX) | JSON | Ассет [релиза GitHub](https://github.com/snapotter-hq/SnapOtter/releases): `snapotter-v{version}-sbom.spdx.json` |
| Сканирование уязвимостей | Trivy JSON | Ассет [релиза GitHub](https://github.com/snapotter-hq/SnapOtter/releases): `snapotter-v{version}-trivy.json` |
| Сканирование уязвимостей | SARIF | Вкладка [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security) |
| Статический анализ | CodeQL (JS/TS + Python) | Вкладка [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security), запускается еженедельно + для каждого PR |
| Проверка зависимостей | Нативная GitHub | Проверка на каждый PR, падает при добавлениях высокой серьёзности |
| Аудит зависимостей Python | pip-audit | Лог CI-запуска при каждом push |
| Политика безопасности | Markdown | [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) в репозитории |
| Обновления зависимостей | Dependabot | Автоматические еженедельные PR для npm, pip, Docker, Actions |

**Запуск собственного сканирования:**

Загрузите SBOM из релиза и просканируйте его предпочитаемым инструментом:

```bash
# Scan with Grype using the CycloneDX SBOM
grype sbom:snapotter-v1.17.2-sbom.cdx.json

# Scan with Trivy using the SPDX SBOM
trivy sbom snapotter-v1.17.2-sbom.spdx.json

# Scan the Docker image directly
trivy image snapotter/snapotter:1.17.2
```

::: info 
SBOM и сканирование уязвимостей отражают точный образ, опубликованный для этого релиза. Пакеты моделей ИИ, установленные после развёртывания, не включены в SBOM, поскольку они загружаются во время работы.
:::
