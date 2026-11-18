---
description: "Руководство по усилению безопасности SnapOtter. Безопасность контейнеров, сетевая изоляция, секреты Docker, развёртывание в Kubernetes и артефакты соответствия требованиям."
i18n_source_hash: 630381c08cde
i18n_provenance: machine
i18n_output_hash: 1c397068ca81
i18n_hash_version: 2
---

# Безопасность и усиление защиты {#security-hardening}

SnapOtter обрабатывает файлы полностью в вашей инфраструктуре. По умолчанию он отправляет анонимную аналитику продукта и отчёты о сбоях без содержимого, чтобы помогать улучшать проект. Он никогда не отправляет ваши файлы, имена файлов, содержимое файлов, результаты OCR, метаданные изображений или текст документов. Необязательная обратная связь отправляется только после того, как пользователь её подтвердит, и только при включённой аналитике, а контактные поля включаются только с явного согласия на контакт. Администратор может отключить аналитику и сбор обратной связи одним щелчком в разделе Настройки > Система > Конфиденциальность, пересборка не требуется. Обработка файлов всегда остаётся внутри вашего контейнера.

Контейнер запускается от отдельного пользователя без прав root (`snapotter`) с отброшенными Linux capabilities, кроме минимально необходимого набора. Полную политику раскрытия уязвимостей и архитектуру безопасности см. в [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) на GitHub.

## Усиление защиты контейнеров {#container-hardening}

Источником истины служат стандартные файлы Compose для [CPU](https://github.com/snapotter-hq/SnapOtter/blob/v2.3.0/docker/docker-compose.yml) и [GPU](https://github.com/snapotter-hq/SnapOtter/blob/v2.3.0/docker/docker-compose-gpu.yml). Не копируйте сокращённый пример в продакшен; развёртывайте файл из проверенного вами тега выпуска.

Оба стека применяют следующие меры:

- Ограничения памяти, swap, CPU и PID сдерживают неконтролируемую нативную обработку.
- Каждый сервис отбрасывает все Linux capabilities. Приложение возвращает только `CHOWN, SETUID, SETGID, DAC_OVERRIDE, FOWNER, KILL` для владения томами, односторонней смены идентичности `gosu` и корректной передачи сигналов. PostgreSQL и Redis получают только тот поднабор, который нужен их официальным точкам входа.
- `security_opt: [no-new-privileges:true]` не даёт процессам в контейнерах приложения, PostgreSQL и Redis получать дополнительные привилегии. Это остаётся совместимым с `gosu`: точка входа стартует от root, подготавливает тома и только затем переходит к выделенному пользователю `snapotter`.
- Входные образы PostgreSQL и Redis зафиксированы по дайджесту. Приложение также следует закрепить на проверенном теге выпуска или дайджесте, а не на `latest`.
- Проверки состояния, ограниченная ротация журналов JSON, устойчивый Redis AOF и политика перезапуска централизованно определены в стандартных файлах.

Для развёртывания, доступного из интернета, привяжите порт 1349 к loopback и завершайте TLS на поддерживаемом обратном прокси. Создайте уникальные учётные данные PostgreSQL и Redis, храните секреты в защищённых файлах или менеджере секретов и сразу смените начальный пароль администратора.

### Почему `read_only` не задан {#why-read-only-is-not-set}

`read_only: true` не задан, потому что переназначение PUID/PGID при запуске записывает в `/etc/passwd` и `/etc/group`. Если вместо PUID/PGID вы используете флаг Docker `--user` или Kubernetes `runAsUser`, можно безопасно включить корневую файловую систему только для чтения.

## Сетевая изоляция {#network-isolation}

Обработка файлов выполняется локально, но установка по умолчанию **не является системой без исходящего трафика**. Анонимная аналитика продукта использует PostHog, а отчёты о сбоях используют Sentry, когда телеметрия включена. Задайте `SNAPOTTER_TELEMETRY=0` (или отключите аналитику в разделе Настройки > Система > Конфиденциальность), чтобы выключить и то и другое. SnapOtter никогда не включает в эти события загруженные файлы, имена файлов, результаты OCR, текст документов или иное содержимое файлов.

Прочий исходящий трафик определяется используемыми функциями: установка пакетов и моделей ИИ загружает подписанные входные данные выпуска; импорт по URL получает публичный URL, запрошенный пользователем; а явно настроенные OIDC, SAML, OpenTelemetry, вебхуки, S3-совместимое хранилище и подобные интеграции обращаются к адресам, выбранным администратором. Загрузка моделей во время работы по умолчанию отключена. Задавайте `SNAPOTTER_ALLOW_MODEL_DOWNLOAD=1` только для явного согласия на автоматические резервные загрузки. [Импорт офлайн-пакета](/ru/guide/deployment) позволяет подготовить функции ИИ без исходящего трафика для загрузки моделей.

**Рекомендации по межсетевому экрану:**

| Сценарий | Правило для исходящего трафика |
|---|---|
| Изолированная сеть (air-gapped) | Задайте `SNAPOTTER_TELEMETRY=0` и `SNAPOTTER_ALLOW_MODEL_DOWNLOAD=0`, используйте офлайн-импорт пакетов ИИ, отключите импорт по URL и внешние интеграции, затем заблокируйте исходящий трафик |
| Телеметрия по умолчанию | Разрешите конечные точки PostHog и Sentry, указанные в журналах браузера и сети; отключите телеметрию, если политика их не допускает |
| Нужны пакеты ИИ | На время установки разрешите HTTPS к `huggingface.co, *.xethub.hf.co, cdn-lfs.huggingface.co, github.com, objects.githubusercontent.com, storage.googleapis.com, pypi.org, files.pythonhosted.org`; затем заблокируйте эти хосты |
| Внешние интеграции | Разрешайте только точные адреса OIDC/SAML/OTLP/вебхуков/объектного хранилища, настроенные администратором |

Архивы пакетов раздаются из хранилища Xet на Hugging Face, которое передаёт данные параллельно через конечные точки `*.xethub.hf.co` и благодаря этому позволяет быстро загружать пакеты объёмом в несколько ГБ. Если ваш межсетевой экран разрешает `huggingface.co`, но блокирует `*.xethub.hf.co`, установка всё равно проходит, но переходит на более медленную однопоточную загрузку, поэтому добавьте хосты Xet в список разрешённых, чтобы оставаться на быстром пути. При полностью офлайн-установке всё это можно пропустить и вместо этого использовать [офлайн-импорт пакетов](/ru/guide/deployment).

Настройку обратного прокси (Nginx, Traefik, Caddy, Cloudflare Tunnels) см. в [руководстве по развёртыванию](/ru/guide/deployment#reverse-proxy).

## Секреты Docker {#docker-secrets}

В продакшене не передавайте секреты в виде переменных окружения открытым текстом. Точка входа поддерживает соглашение Docker `_FILE`: смонтируйте секрет как файл и задайте соответствующую переменную `_FILE` с путём к нему.

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
Секреты Docker Compose (без Swarm) требуют Compose версии 2.23 или новее.
:::

## Развёртывание в Kubernetes {#kubernetes-deployment}

Точка входа определяет, что контейнер уже запущен без прав root (например, через Kubernetes `runAsUser`), и автоматически пропускает понижение привилегий через gosu. В этом случае она сама не может выполнить chown для смонтированных томов, поэтому проверяет, доступны ли они для записи, и при их недоступности завершается раньше с понятной подсказкой: см. [Права доступа к хранилищу](/ru/guide/deployment#storage-permissions) для `fsGroup` и конфигураций с чужим UID (TrueNAS, OpenShift).

**Рекомендуемый Pod SecurityContext:**

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

Поскольку `runAsUser: 999` задан на уровне пода, точка входа полностью пропускает gosu. Это позволяет использовать capabilities `allowPrivilegeEscalation: false` и `drop: [ALL]` без конфликтов.

Рекомендации по ресурсам см. в разделе [Требования к оборудованию](/ru/guide/deployment#hardware-requirements).

## Резервное копирование и восстановление {#backup-and-recovery}

Продакшен-стек Compose определяет четыре тома. Перед согласованным резервным копированием остановите входящий трафик и дождитесь завершения активных задач, чтобы PostgreSQL, Redis и состояние файлов описывали один и тот же момент времени.

| Том | Содержимое | Подход к восстановлению |
|---|---|---|
| `SnapOtter-pgdata` | Пользователи PostgreSQL, настройки, конвейеры, задачи, метаданные файлов и журнал аудита | Критичен; используйте логический дамп с быстрым отказом для переносимого восстановления |
| `SnapOtter-data` | Сохранённые объекты библиотеки, журналы и состояние ИИ (`/data/files, /data/logs, /data/ai, /data/ai/venv`) | Копируйте том целиком; чтобы сэкономить место, сознательно исключите всё состояние ИИ и переустановите его пакеты |
| `SnapOtter-redisdata` | Redis AOF для устойчивого состояния очередей BullMQ | Копируйте после приостановки приложения и принудительного `SAVE`; необходим для точного возобновления задач в очереди |
| `SnapOtter-workspace` | Временные ключи объектного хранилища (`/tmp/workspace/uploads, /tmp/workspace/outputs`) | Не копируйте после того, как все задачи завершены или отменены; никогда не отбрасывайте том, пока задачи активны |

Compose обычно добавляет к именам томов префикс с именем проекта. Определяйте реальный исходный том по смонтированному контейнеру, а не считайте, что отображаемое имя вроде `SnapOtter-data` является именем тома Docker.

### Резервное копирование базы данных {#database-backup}

Используйте пользовательский формат архива PostgreSQL и проверьте архив, прежде чем считать резервную копию завершённой:

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

Проверяйте каждую резервную копию: восстановите её в изолированный стек, проверьте записи базы данных и контрольные суммы файлов и запустите приложение. `tests/qa/backup-restore-drill.sh` в репозитории автоматизирует эту проверку выпуска для явно заданного `QA_IMAGE`.

Если ваша платформа делает снимки томов, согласованные на уровне сбоя, сначала остановите весь стек и сделайте снимок всех критичных томов как единого набора. Копирование каталога данных PostgreSQL из работающего контейнера не считается поддерживаемой логической резервной копией.

### Резервное копирование файлов и очередей {#file-and-queue-backup}

Приостановите приложение перед снятием копий томов файлов и очередей. Используйте `docker inspect`, чтобы определить фактическое имя тома, заставьте Redis сохранить текущее состояние и архивируйте с сохранением владельцев и прав доступа:

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

Перезапускайте Redis раньше приложения. Если вы намеренно исключаете `/data/ai`, удаляйте всё поддерево ИИ целиком, а не оставляйте запись `installed.json` без её моделей или виртуального окружения. Храните резервные копии в зашифрованном виде с ограниченным доступом и отдельно от хоста, на котором работает SnapOtter.

## Артефакты соответствия требованиям {#compliance-artifacts}

Каждый выпуск SnapOtter включает следующие артефакты безопасности:

| Артефакт | Формат | Где найти |
|---|---|---|
| Привязка субъекта выпуска | Канонический JSON + аттестация GitHub | Ресурс [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases): `snapotter-v{version}-release-subjects.json` |
| SBOM архива | CycloneDX и SPDX JSON | Ресурсы выпуска: `snapotter-v{version}-archive-linux-{arch}-sbom.{cdx,spdx}.json` |
| SBOM образа | CycloneDX и SPDX JSON | Ресурсы выпуска: `snapotter-v{version}-image-linux-{arch}-sbom.{cdx,spdx}.json` |
| Сканирование уязвимостей | Trivy JSON | Ресурсы выпуска с соответствующими префиксами `archive-linux-{arch}` или `image-linux-{arch}` |
| Сканирование уязвимостей | SARIF | Вкладка [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security) |
| Статический анализ | CodeQL (JS/TS + Python) | Вкладка [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security), запускается еженедельно и для каждого PR |
| Проверка зависимостей | Встроенная в GitHub | Проверка для каждого PR, завершается ошибкой при добавлении зависимостей с высокой серьёзностью |
| Аудит зависимостей Python | pip-audit | Журнал запуска CI при каждом push |
| Политика безопасности | Markdown | [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) в репозитории |
| Обновления зависимостей | Dependabot | Автоматические еженедельные PR для npm, pip, Docker и Actions |

**Собственное сканирование:**

Загрузите манифест субъекта выпуска и убедитесь, что он аттестован рабочим процессом выпуска:

```bash
gh attestation verify snapotter-v2.3.0-release-subjects.json \
  --repo snapotter-hq/SnapOtter \
  --signer-workflow snapotter-hq/SnapOtter/.github/workflows/release.yml
```

Манифест раздельно фиксирует `releaseTag`, `releaseCommit` и `workflowTriggerCommit`. Убедитесь, что `releaseCommit` является коммитом, извлечённым из неизменяемого тега, затем сверьте дайджест SHA-256 используемого вами архива, образа, SBOM или результата сканирования с его записью в `subjects`. Это различие намеренное: переход на только что созданный коммит выпуска не меняет идентичность коммита в учётных данных OIDC рабочего процесса.

Также можно просканировать загруженный SBOM или сам образ напрямую:

```bash
# Scan with Grype using the CycloneDX SBOM
grype sbom:snapotter-v2.3.0-image-linux-amd64-sbom.cdx.json

# Scan with Trivy using the SPDX SBOM
trivy sbom snapotter-v2.3.0-image-linux-amd64-sbom.spdx.json

# Scan the Docker image directly
trivy image snapotter/snapotter:2.3.0
```

::: info 
SBOM и результаты сканирования образа отражают точный образ для конкретной архитектуры, опубликованный для этого выпуска. SBOM и результаты сканирования архива описывают готовый архив отдельно. Пакеты моделей ИИ, установленные после развёртывания, в эти SBOM не входят, потому что загружаются во время работы.
:::