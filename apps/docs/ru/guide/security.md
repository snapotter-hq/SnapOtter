---
description: "Руководство по усилению безопасности SnapOtter. Безопасность контейнеров, сетевая изоляция, Docker secrets, развёртывание в Kubernetes и артефакты соответствия требованиям."
i18n_source_hash: 9ff337fa0417
i18n_provenance: machine
i18n_output_hash: 7403b85fe295
i18n_hash_version: 2
---

# Безопасность и усиление защиты {#security-hardening}

SnapOtter обрабатывает файлы полностью на вашей инфраструктуре. По умолчанию он отправляет анонимную продуктовую аналитику без содержимого и отчёты об аварийных сбоях, чтобы помочь улучшить проект. Он никогда не отправляет ваши файлы, имена файлов, содержимое файлов, вывод OCR, метаданные изображений или текст документов. Опциональная обратная связь отправляется только после того, как пользователь её отправит, только когда аналитика включена, а контактные поля включаются только при явном согласии на контакт. Администратор может отключить сбор аналитики и обратной связи в один клик в разделе Settings > System > Privacy, пересборка не требуется. Обработка файлов всегда остаётся внутри вашего контейнера.

Контейнер работает от имени выделенного не-root пользователя (`snapotter`) со сброшенными всеми возможностями Linux, кроме минимально необходимого набора. Полную политику раскрытия уязвимостей и архитектуру безопасности см. в [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) на GitHub.

## Укрепление контейнера {#container-hardening}

Канонические файлы Compose [CPU](https://github.com/snapotter-hq/SnapOtter/blob/main/docker/docker-compose.yml) и [GPU](https://github.com/snapotter-hq/SnapOtter/blob/main/docker/docker-compose-gpu.yml) являются источником истины. Не копируйте сокращенный пример в производство; разверните файл из проверенного вами тега выпуска.

Оба стека применяют следующие элементы управления:

- Ограничения памяти, подкачки, ЦП и PID содержат неконтролируемую встроенную обработку.

— Каждый сервис отказывается от всех возможностей Linux. Приложение добавляет обратно только `CHOWN, SETUID, SETGID, DAC_OVERRIDE, FOWNER, KILL` для владения томом, одностороннее удаление идентификаторов `gosu` и плавную пересылку сигналов. PostgreSQL и Redis получают только то подмножество, которое необходимо их официальным точкам входа.

— `security_opt: [no-new-privileges:true]` не позволяет процессам в приложении, контейнерах PostgreSQL и Redis получать дополнительные привилегии. Это остается совместимым с `gosu`: точка входа начинается от имени пользователя root, подготавливает тома и передается только выделенному пользователю `snapotter`.

— Входные данные изображений PostgreSQL и Redis закрепляются с помощью дайджеста. Приложение также должно быть прикреплено к проверенному тегу выпуска или дайджесту, а не к `latest`.

— Проверки работоспособности, ограниченная ротация журналов JSON, надежный Redis AOF и политика перезапуска определяются централизованно в канонических файлах.

Для развертывания с выходом в Интернет привяжите порт 1349 к петлевой проверке и завершите TLS на поддерживаемом обратном прокси-сервере. Создавайте уникальные учетные данные PostgreSQL и Redis, храните секреты в защищенных файлах или диспетчере секретов и немедленно меняйте первоначальный пароль администратора.

### Почему `read_only` не установлен {#why-read-only-is-not-set}

`read_only: true` не установлен, поскольку переназначение PUID/PGID записывается в `/etc/passwd` и `/etc/group` при запуске. Если вы используете флаг Docker `--user` или Kubernetes `runAsUser` вместо PUID/PGID, вы можете безопасно включить корневую файловую систему только для чтения.

## Изоляция сети {#network-isolation}

Обработка файлов осуществляется локально, но установка по умолчанию **не является системой без исходящего трафика**. Анонимная аналитика продуктов использует PostHog, а отчеты о сбоях используют Sentry, когда включена телеметрия. Установите `SNAPOTTER_TELEMETRY=0` (или отключите аналитику в разделе «Настройки» > «Система» > «Конфиденциальность»), чтобы отключить оба. SnapOtter никогда не включает в эти события загруженные файлы, имена файлов, выходные данные OCR, текст документа или другое содержимое файла.

Другой исходящий трафик зависит от функций: установка пакета/модели AI загружает подписанные входные данные выпуска; При импорте URL-адреса извлекается общедоступный URL-адрес, запрошенный пользователем; и явно настроенные OIDC, SAML, OpenTelemetry, веб-перехватчики, S3-совместимое хранилище или аналогичные интеграции связываются с местами назначения, выбранными администратором. Загрузка моделей во время выполнения по умолчанию отключена. Установите `SNAPOTTER_ALLOW_MODEL_DOWNLOAD=1` только для явного включения автоматических резервных загрузок. [Импорт автономного пакета](/ru/guide/deployment) позволяет предоставлять функции ИИ без выхода из модели времени выполнения.

**Рекомендации по использованию брандмауэра:**

|Сценарий|Исходящее правило|
|---|---|
|с воздушным зазором|Установите `SNAPOTTER_TELEMETRY=0` и `SNAPOTTER_ALLOW_MODEL_DOWNLOAD=0`, используйте автономный импорт пакета AI, отключите импорт URL-адресов и внешнюю интеграцию, а затем заблокируйте исходящий доступ.|
|Телеметрия по умолчанию|Разрешите конечные точки PostHog и Sentry, указанные в журналах вашего браузера/сети; отключить телеметрию, если политика не разрешает это|
|Необходимы пакеты AI|Во время установки разрешите HTTPS для `huggingface.co, *.xethub.hf.co, cdn-lfs.huggingface.co, github.com, objects.githubusercontent.com, storage.googleapis.com, pypi.org, files.pythonhosted.org`; затем заблокируйте эти хосты|
|Внешние интеграции|Разрешить только те места назначения OIDC/SAML/OTLP/webhook/object-storage, которые настроены администратором.|

Архивы пакетов обслуживаются из хранилища Xet Hugging Face, которое передается через конечные точки `*.xethub.hf.co` параллельно и обеспечивает быструю загрузку пакетов объемом несколько ГБ. Если ваш брандмауэр разрешает `huggingface.co`, но блокирует `*.xethub.hf.co`, установка все равно будет успешной, но произойдет возврат к более медленной однопоточной загрузке, поэтому внесите в список разрешенных хосты Xet, чтобы оставаться на быстром пути. При полной автономной установке все это можно пропустить и вместо этого использовать [Импорт автономного пакета](/ru/guide/deployment).

Для настройки обратного прокси-сервера (Nginx, Traefik, Caddy, Cloudflare Tunnels) см. [Руководство по развертыванию](/ru/guide/deployment#reverse-proxy).

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

Производственный стек Compose определяет четыре тома. Остановите вход и дайте активным заданиям завершиться, прежде чем создавать скоординированное резервное копирование, чтобы PostgreSQL, Redis и состояние файла описывали один и тот же момент времени.

|Объем|Содержание|Восстановительное лечение|
|---|---|---|
|`SnapOtter-pgdata`|Пользователи PostgreSQL, настройки, конвейеры, задания, метаданные файлов и журнал аудита.|Критический; используйте отказоустойчивый логический дамп для портативного восстановления|
|`SnapOtter-data`|Сохраненные объекты библиотеки, журналы и состояние AI (`/data/files, /data/logs, /data/ai, /data/ai/venv`).|Создайте резервную копию всего тома; чтобы сэкономить место, намеренно опустите все состояния AI и переустановите его пакеты|
|`SnapOtter-redisdata`|Redis AOF для устойчивого состояния очереди BullMQ|Сделайте резервную копию после приостановки приложения и принудительного выполнения `SAVE`; необходимо возобновить работу в очереди точно|
|`SnapOtter-workspace`|Ключи временного хранения объектов (`/tmp/workspace/uploads, /tmp/workspace/outputs`)|Не выполнять резервное копирование после того, как все задания удалены или отменены; никогда не выбрасывайте его, пока задания активны|

Compose обычно добавляет к имени тома имя проекта. Разрешите реальный исходный том из подключенного контейнера вместо того, чтобы предполагать, что отображаемое имя, такое как `SnapOtter-data`, является именем тома Docker.

### Резервное копирование базы данных {#database-backup}

Используйте собственный формат архива PostgreSQL и проверьте архив, прежде чем считать резервную копию завершенной:

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

Протестируйте каждую резервную копию, восстановив ее в изолированный стек, проверив записи базы данных и контрольные суммы файлов, а затем запустив приложение. `tests/qa/backup-restore-drill.sh` репозитория автоматизирует освобождение шлюза от явного `QA_IMAGE`.

Если вместо этого ваша платформа создает отказоустойчивые снимки томов, сначала остановите весь стек и сделайте снимок всех критических томов как одного набора. Необработанная копия каталога данных PostgreSQL из работающего контейнера не является поддерживаемой логической резервной копией.

### Резервное копирование файлов и очередей {#file-and-queue-backup}

Приостановите приложение перед записью томов файлов и очередей. Используйте `docker inspect`, чтобы разрешить фактическое имя тома, заставить Redis сохранить его текущее состояние и заархивировать с сохранением владения и разрешений:

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

Перезапустите Redis перед приложением. Если вы намеренно исключаете `/data/ai`, удалите все поддерево AI, а не сохраняйте запись `installed.json` без ее моделей или виртуальной среды. Храните файлы резервных копий в зашифрованном виде, с контролем доступа и отдельно от хоста, на котором работает SnapOtter.

## Артефакты соответствия {#compliance-artifacts}

Каждый выпуск SnapOtter включает следующие артефакты безопасности:

| Артефакт | Формат | Где это найти |
|---|---|---|
| Освободить привязку к теме | Каноническая аттестация JSON + GitHub | [Выпуск GitHub](https://github.com/snapotter-hq/SnapOtter/releases) актив: `snapotter-v{version}-release-subjects.json` |
| Архив SBOM | CycloneDX и SPDX JSON | Выпустить активы: `snapotter-v{version}-archive-linux-{arch}-sbom.{cdx,spdx}.json` |
| Изображение SBOM | CycloneDX и SPDX JSON | Выпустить активы: `snapotter-v{version}-image-linux-{arch}-sbom.{cdx,spdx}.json` |
| Сканирование уязвимостей | Trivy JSON | Выпустите ресурсы с соответствующими префиксами `archive-linux-{arch}` или `image-linux-{arch}`. |
| Сканирование уязвимостей | SARIF | Вкладка [GitHub Безопасность](https://github.com/snapotter-hq/SnapOtter/security) |
| Статический анализ | CodeQL (JS/TS + Python) | Вкладка [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security), работает еженедельно + за PR |
| Обзор зависимостей | GitHub родной | Проверка каждого PR, завершается сбоем при добавлениях высокой важности. |
| Аудит зависимостей Python | pip-audit | Журнал запуска CI при каждом нажатии |
| Политика безопасности | Markdown | [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) в репозитории |
| Обновления зависимостей | Dependabot | Автоматические еженедельные PR для npm, pip, Docker, Actions |

**Запуск собственного сканирования:**

Загрузите манифест объекта выпуска и убедитесь, что он подтвержден рабочим процессом выпуска:

```bash
gh attestation verify snapotter-v2.2.0-release-subjects.json \
  --repo snapotter-hq/SnapOtter \
  --signer-workflow snapotter-hq/SnapOtter/.github/workflows/release.yml
```

В манифесте `releaseTag`, `releaseCommit` и `workflowTriggerCommit` записываются отдельно. Убедитесь, что `releaseCommit` — это фиксация, очищенная от неизменяемого тега, затем сравните дайджест SHA-256 архива, образа, SBOM или сканирования, которое вы используете, с его записью в `subjects`. Это различие сделано намеренно: проверка вновь созданной фиксации выпуска не меняет идентификатор фиксации в учетных данных OIDC рабочего процесса.

Вы также можете напрямую отсканировать загруженный SBOM или изображение:

```bash
# Scan with Grype using the CycloneDX SBOM
grype sbom:snapotter-v2.2.0-image-linux-amd64-sbom.cdx.json

# Scan with Trivy using the SPDX SBOM
trivy sbom snapotter-v2.2.0-image-linux-amd64-sbom.spdx.json

# Scan the Docker image directly
trivy image snapotter/snapotter:2.2.0
```

::: info
Изображение SBOMs и сканы отражают точный образ конкретной архитектуры, опубликованный для этого выпуска. Архив SBOMs и сканы описывают готовый архив отдельно. Пакеты моделей AI, установленные после развертывания, не включены в эти пакеты SBOMs, поскольку они загружаются во время выполнения.
:::
