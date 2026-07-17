---
description: "دليل تعزيز أمان SnapOtter. أمان الحاويات، وعزل الشبكة، وأسرار Docker، ونشر Kubernetes، وأدوات الامتثال."
i18n_source_hash: 986f7658430c
i18n_provenance: human
i18n_output_hash: 41275618e244
---

# الأمان والتعزيز {#security-hardening}

يعالج SnapOtter الملفات بالكامل على بنيتك التحتية. يرسل تحليلات منتج مجهولة وخالية من المحتوى وتقارير أعطال افتراضيًا للمساعدة في تحسين المشروع. لا يرسل أبدًا ملفاتك، ولا أسماء ملفاتك، ولا محتويات ملفاتك، ولا مخرجات OCR، ولا بيانات الصور الوصفية، ولا نص المستندات. تُرسَل الملاحظات الاختيارية فقط بعد أن يقدّمها المستخدم، وفقط عند تفعيل التحليلات، وتُضمَّن حقول جهة الاتصال فقط مع موافقة صريحة على الاتصال. يمكن للمسؤول إيقاف التحليلات والتقاط الملاحظات بنقرة واحدة ضمن Settings > System > Privacy، دون الحاجة لإعادة بناء. تبقى معالجة الملفات دائمًا داخل حاويتك.

تعمل الحاوية كمستخدم مخصص غير root (`snapotter`) مع إسقاط جميع قدرات Linux باستثناء المجموعة الدنيا المطلوبة. للاطلاع على سياسة الإفصاح الكاملة عن الثغرات ومعمارية الأمان، راجع [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) على GitHub.

## تعزيز الحاوية {#container-hardening}

يتضمن [ملف docker-compose.yml الافتراضي](https://github.com/snapotter-hq/SnapOtter/blob/main/docker/docker-compose.yml) تعزيزًا أمنيًا لبيئة الإنتاج. إليك تفصيلًا لكل خيار وسبب أهميته:

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

### لماذا لا يُعيَّن `no-new-privileges` {#why-no-new-privileges-is-not-set}

يُحذَف `security_opt: [no-new-privileges:true]` عمدًا. تبدأ نقطة الدخول كـ root لإصلاح ملكية وحدة التخزين، ثم تنزل إلى مستخدم `snapotter` عبر [gosu](https://github.com/tianon/gosu)، الذي يتطلب setuid. بمجرد اكتمال إسقاط الامتياز، تعمل العملية كـ `snapotter` مع إزالة جميع القدرات باستثناء الخمس المذكورة أعلاه.

إذا كنت تستخدم Kubernetes أو راية Docker‏ `--user` للتشغيل كـ non-root مباشرة (متجاوزًا gosu)، فمن الآمن تفعيل `no-new-privileges`.

### لماذا لا يُعيَّن `read_only` {#why-read-only-is-not-set}

لا يُعيَّن `read_only: true` لأن إعادة تعيين PUID/PGID تكتب إلى `/etc/passwd` و `/etc/group` عند بدء التشغيل. إذا كنت تستخدم راية Docker‏ `--user` أو Kubernetes‏ `runAsUser` بدلًا من PUID/PGID، فيمكنك بأمان تفعيل نظام ملفات جذر للقراءة فقط.

## عزل الشبكة {#network-isolation}

أثناء التشغيل العادي، تجري الحاوية **صفرًا من الاتصالات الشبكية الصادرة**. تحدث كل معالجة للملفات محليًا باستخدام المكتبات المُرفَقة.

```
Browser  -->  Reverse Proxy (TLS)  -->  SnapOtter container  -->  (nothing)
```

الاستثناء الوحيد هو **تنزيلات نماذج الذكاء الاصطناعي**: عندما يثبّت مستخدم حزمة ميزة ذكاء اصطناعي عبر الواجهة، تنزّل الحاوية أرشيف الحزمة المبني مسبقًا من Hugging Face، بالإضافة إلى بضعة ملفات نماذج فردية من GitHub Releases و Google Storage و PyPI. تحدث هذه التنزيلات مرة واحدة لكل حزمة وتُخزَّن في وحدة التخزين `/data`.

**توصيات جدار الحماية:**

| السيناريو | قاعدة الصادر |
|---|---|
| معزول عن الشبكة (بدون ذكاء اصطناعي) | حظر كل حركة المرور الصادرة من الحاوية |
| حزم الذكاء الاصطناعي مطلوبة | السماح بـ HTTPS إلى `huggingface.co`، و `*.xethub.hf.co`، و `cdn-lfs.huggingface.co`، و `github.com`، و `objects.githubusercontent.com`، و `storage.googleapis.com`، و `pypi.org`، و `files.pythonhosted.org` أثناء التثبيت، ثم الحظر |
| بعد تثبيت الذكاء الاصطناعي | حظر كل حركة المرور الصادرة - النماذج مخزّنة محليًا |

تُقدَّم أرشيفات الحزم من تخزين Xet الخاص بـ Hugging Face، الذي ينقل عبر نقاط `*.xethub.hf.co` الطرفية بشكل متوازٍ وهو ما يجعل تنزيلات الحزم متعددة الجيجابايت سريعة. إذا كان جدار الحماية لديك يسمح بـ `huggingface.co` لكنه يحظر `*.xethub.hf.co`، فإن عمليات التثبيت لا تزال تنجح لكنها ترجع إلى تنزيل أبطأ أحادي التدفق، لذا أدرج مضيفات Xet في قائمة السماح للبقاء على المسار السريع. يمكن للتثبيتات دون اتصال بالكامل تخطي كل هذا واستخدام [استيراد الحزم دون اتصال](/ar/guide/deployment) بدلًا من ذلك.

لتهيئة الوكيل العكسي (Nginx، و Traefik، و Caddy، وأنفاق Cloudflare)، راجع [دليل النشر](/ar/guide/deployment#reverse-proxy).

## أسرار Docker {#docker-secrets}

لعمليات نشر الإنتاج، تجنّب تمرير الأسرار كمتغيرات بيئة نصية عادية. تدعم نقطة الدخول اصطلاح `_FILE` الخاص بـ Docker: ركّب سرًا كملف وعيّن متغير `_FILE` المقابل إلى مساره.

**الأسرار المدعومة:**

| المتغير | مكافئ `_FILE` |
|---|---|
| `DEFAULT_PASSWORD` | `DEFAULT_PASSWORD_FILE` |
| `COOKIE_SECRET` | `COOKIE_SECRET_FILE` |
| `OIDC_CLIENT_SECRET` | `OIDC_CLIENT_SECRET_FILE` |
| `S3_ACCESS_KEY_ID` | `S3_ACCESS_KEY_ID_FILE` |
| `S3_SECRET_ACCESS_KEY` | `S3_SECRET_ACCESS_KEY_FILE` |
| `SNAPOTTER_LICENSE_KEY` | `SNAPOTTER_LICENSE_KEY_FILE` |

**مثال مع أسرار Docker Compose:**

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
تتطلب أسرار Docker Compose (بدون Swarm) الإصدار v2.23 من Compose أو أحدث.
:::

## نشر Kubernetes {#kubernetes-deployment}

تكتشف نقطة الدخول متى تعمل الحاوية بالفعل كـ non-root (مثلًا عبر Kubernetes‏ `runAsUser`) وتتخطى إسقاط امتياز gosu تلقائيًا. في تلك الحالة لا يمكنها تغيير ملكية وحدات التخزين المركّبة بنفسها، لذا تتحقق من كونها قابلة للكتابة وتخرج مبكرًا مع إرشادات قابلة للتنفيذ إن لم تكن كذلك — راجع [أذونات التخزين](/ar/guide/deployment#storage-permissions) لإعدادات `fsGroup` و UID الأجنبي (TrueNAS، و OpenShift).

**Pod SecurityContext الموصى به:**

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

بما أن `runAsUser: 999` مُعيّن على مستوى pod، تتخطى نقطة الدخول gosu بالكامل. هذا يسمح بقدرات `allowPrivilegeEscalation: false` و `drop: [ALL]` دون تعارض.

لتحجيم الموارد، راجع [متطلبات العتاد](/ar/guide/deployment#hardware-requirements).

## النسخ الاحتياطي والاستعادة {#backup-and-recovery}

الحالة الدائمة موزّعة عبر وحدتي تخزين:

| وحدة التخزين | المحتويات | حرجة؟ |
|---|---|---|
| `SnapOtter-pgdata` | قاعدة بيانات PostgreSQL (المستخدمون، والإعدادات، وخطوط الأنابيب، والمهام، وسجل التدقيق) | نعم |
| `/data` (وحدة تخزين التطبيق) | الملفات التي رفعها المستخدمون، ونماذج الذكاء الاصطناعي، وبيئة Python الافتراضية | جزئيًا (انظر أدناه) |

ضمن وحدة التخزين `/data`:

| المسار | المحتويات | حرج؟ |
|---|---|---|
| `/data/uploads/`، و `/data/outputs/` | ملفات المستخدمين ونتائج المعالجة | نعم |
| `/data/ai/` | ملفات نماذج الذكاء الاصطناعي المنزّلة | لا (قابلة لإعادة التنزيل) |
| `/data/venv/` | بيئة Python الافتراضية | لا (تُعاد بناؤها عند البدء) |

### النسخ الاحتياطي لقاعدة البيانات {#database-backup}

استخدم `pg_dump` لعمل نسخة احتياطية من قاعدة البيانات أثناء تشغيل الحزمة:

```bash
# Dump the database
docker exec SnapOtter-postgres pg_dump -U snapotter snapotter > backup.sql

# Restore into a fresh database
cat backup.sql | docker exec -i SnapOtter-postgres psql -U snapotter snapotter
```

بدلًا من ذلك، أوقف الحزمة والتقط لقطة لوحدة التخزين `SnapOtter-pgdata`:

```bash
docker compose down
docker run --rm -v SnapOtter-pgdata:/data -v $(pwd)/backup:/backup \
  alpine tar czf /backup/snapotter-pgdata.tar.gz -C /data .
```

### النسخ الاحتياطي لملفات المستخدمين {#user-files-backup}

```bash
# Snapshot the app data volume (excluding re-downloadable AI models)
docker run --rm -v SnapOtter-data:/data -v $(pwd)/backup:/backup \
  alpine tar czf /backup/snapotter-files.tar.gz \
    --exclude='ai' --exclude='venv' -C /data .
```

يبلغ إجمالي نماذج الذكاء الاصطناعي نحو 24 جيجابايت عبر جميع الحزم. بما أنها قابلة لإعادة التنزيل، استبعد `/data/ai/` و `/data/venv/` من النسخ الاحتياطية لتوفير المساحة. قاعدة البيانات وملفات المستخدمين فقط هي الحرجة.

## أدوات الامتثال {#compliance-artifacts}

يتضمن كل إصدار من SnapOtter أدوات الأمان التالية:

| الأداة | التنسيق | أين تجدها |
|---|---|---|
| SBOM (CycloneDX) | JSON | أصل [إصدار GitHub](https://github.com/snapotter-hq/SnapOtter/releases): `snapotter-v{version}-sbom.cdx.json` |
| SBOM (SPDX) | JSON | أصل [إصدار GitHub](https://github.com/snapotter-hq/SnapOtter/releases): `snapotter-v{version}-sbom.spdx.json` |
| فحص الثغرات | Trivy JSON | أصل [إصدار GitHub](https://github.com/snapotter-hq/SnapOtter/releases): `snapotter-v{version}-trivy.json` |
| فحص الثغرات | SARIF | علامة تبويب [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security) |
| التحليل الساكن | CodeQL (JS/TS + Python) | علامة تبويب [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security)، يعمل أسبوعيًا + لكل PR |
| مراجعة التبعيات | أصلية في GitHub | فحص لكل PR، يفشل عند الإضافات عالية الخطورة |
| تدقيق تبعيات Python | pip-audit | سجل تشغيل CI عند كل دفع |
| سياسة الأمان | Markdown | [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) في المستودع |
| تحديثات التبعيات | Dependabot | طلبات PR أسبوعية آلية لـ npm، و pip، و Docker، و Actions |

**تشغيل الفحص الخاص بك:**

نزّل SBOM من الإصدار وافحصه بالأداة المفضلة لديك:

```bash
# Scan with Grype using the CycloneDX SBOM
grype sbom:snapotter-v1.17.2-sbom.cdx.json

# Scan with Trivy using the SPDX SBOM
trivy sbom snapotter-v1.17.2-sbom.spdx.json

# Scan the Docker image directly
trivy image snapotter/snapotter:1.17.2
```

::: info 
يعكس SBOM وفحص الثغرات الصورة الدقيقة المنشورة لذلك الإصدار. حزم نماذج الذكاء الاصطناعي المثبّتة بعد النشر ليست مضمّنة في SBOM لأنها تُنزَّل في وقت التشغيل.
:::
