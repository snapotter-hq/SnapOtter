---
description: "دليل تعزيز أمان SnapOtter. أمان الحاويات وعزل الشبكة وأسرار Docker ونشر Kubernetes ووثائق الامتثال."
i18n_source_hash: c682d19a84ce
i18n_provenance: human
i18n_output_hash: 30782635985e
---

# الأمان والتعزيز {#security-hardening}

يعالج SnapOtter الملفات بالكامل على بنيتك التحتية. يرسل افتراضياً تحليلات منتج مجهولة وخالية من المحتوى وتقارير أعطال للمساعدة في تحسين المشروع. ولا يرسل أبداً ملفاتك أو أسماء ملفاتك أو محتويات ملفاتك أو مخرجات OCR أو بيانات الصور الوصفية أو نصوص المستندات. تُرسَل التعليقات الاختيارية فقط بعد أن يقدّمها المستخدم، وفقط عندما تكون التحليلات مفعّلة، وتُضمَّن حقول الاتصال فقط بموافقة اتصال صريحة. يمكن للمسؤول إيقاف التحليلات والتقاط التعليقات بنقرة واحدة تحت Settings > System > Privacy، دون الحاجة إلى إعادة بناء. تبقى معالجة الملفات دائماً داخل حاويتك.

تعمل الحاوية بمستخدم غير جذر مخصّص (`snapotter`) مع إسقاط جميع قدرات Linux باستثناء الحدّ الأدنى من المجموعة المطلوبة. للاطّلاع على السياسة الكاملة للإفصاح عن الثغرات وبنية الأمان، انظر [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) على GitHub.

## تعزيز الحاويات {#container-hardening}

يتضمّن [ملف docker-compose.yml الافتراضي](https://github.com/snapotter-hq/SnapOtter/blob/main/docker/docker-compose.yml) تعزيز الأمان الإنتاجي. إليك تفصيل كل خيار وسبب أهميته:

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

### لماذا لا يُضبَط `no-new-privileges` {#why-no-new-privileges-is-not-set}

يُحذَف `security_opt: [no-new-privileges:true]` عمداً. تبدأ نقطة الدخول بصلاحيات الجذر لإصلاح ملكية الحجم، ثم تنزل إلى المستخدم `snapotter` عبر [gosu](https://github.com/tianon/gosu)، الذي يتطلّب setuid. وبمجرّد اكتمال إسقاط الامتيازات، تعمل العملية بوصفها `snapotter` مع إزالة جميع القدرات باستثناء القدرات الخمس المذكورة أعلاه.

إذا استخدمت Kubernetes أو راية `--user` في Docker للتشغيل بوصفك غير جذر مباشرة (متجاوزاً gosu)، فمن الآمن تفعيل `no-new-privileges`.

### لماذا لا يُضبَط `read_only` {#why-read-only-is-not-set}

لا يُضبَط `read_only: true` لأنّ إعادة تعيين PUID/PGID تكتب إلى `/etc/passwd` و`/etc/group` عند بدء التشغيل. إذا استخدمت راية `--user` في Docker أو `runAsUser` في Kubernetes بدلاً من PUID/PGID، فيمكنك تفعيل نظام ملفات جذر للقراءة فقط بأمان.

## عزل الشبكة {#network-isolation}

أثناء التشغيل العادي، لا تُجري الحاوية **أي اتصالات شبكة صادرة**. تجري كل معالجة الملفات محلياً باستخدام مكتبات مضمّنة.

```
Browser  -->  Reverse Proxy (TLS)  -->  SnapOtter container  -->  (nothing)
```

الاستثناء الوحيد هو **تنزيلات نماذج الذكاء الاصطناعي**: عندما يثبّت المستخدم حزمة ميزة ذكاء اصطناعي عبر الواجهة، تنزّل الحاوية ملفات النماذج من GitHub Releases وPyPI. تحدث هذه التنزيلات مرة واحدة لكل حزمة وتُخزَّن في الحجم `/data`.

**توصيات جدار الحماية:**

| السيناريو | قاعدة الصادر |
|---|---|
| معزول عن الشبكة (بلا ذكاء اصطناعي) | احظر كل حركة المرور الصادرة من الحاوية |
| حزم الذكاء الاصطناعي مطلوبة | اسمح بـHTTPS إلى `github.com` و`objects.githubusercontent.com` و`pypi.org` و`files.pythonhosted.org` أثناء التثبيت، ثم احظره |
| بعد تثبيت الذكاء الاصطناعي | احظر كل حركة المرور الصادرة، فالنماذج مخزّنة محلياً |

لإعداد الوكيل العكسي (Nginx وTraefik وCaddy وCloudflare Tunnels)، انظر [دليل النشر](/ar/guide/deployment#reverse-proxy).

## أسرار Docker {#docker-secrets}

لعمليات النشر الإنتاجية، تجنّب تمرير الأسرار كمتغيرات بيئة بنصّ صريح. تدعم نقطة الدخول اصطلاح `_FILE` في Docker: ركّب سرّاً كملف واضبط المتغير المقابل `_FILE` على مساره.

**الأسرار المدعومة:**

| المتغير | ما يعادله بـ`_FILE` |
|---|---|
| `DEFAULT_PASSWORD` | `DEFAULT_PASSWORD_FILE` |
| `COOKIE_SECRET` | `COOKIE_SECRET_FILE` |
| `OIDC_CLIENT_SECRET` | `OIDC_CLIENT_SECRET_FILE` |
| `S3_ACCESS_KEY_ID` | `S3_ACCESS_KEY_ID_FILE` |
| `S3_SECRET_ACCESS_KEY` | `S3_SECRET_ACCESS_KEY_FILE` |
| `SNAPOTTER_LICENSE_KEY` | `SNAPOTTER_LICENSE_KEY_FILE` |

**مثال باستخدام أسرار Docker Compose:**

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
تتطلّب أسرار Docker Compose (بدون Swarm) الإصدار Compose v2.23 أو أحدث.
:::

## نشر Kubernetes {#kubernetes-deployment}

تكتشف نقطة الدخول متى تعمل الحاوية بالفعل بوصفها غير جذر (مثلاً عبر `runAsUser` في Kubernetes) وتتخطّى إسقاط امتياز gosu تلقائياً. في هذه الحالة لا يمكنها تغيير ملكية الحجوم المركّبة بنفسها، لذا تتحقّق من أنها قابلة للكتابة وتخرج مبكراً مع إرشادات قابلة للتنفيذ إن لم تكن كذلك. انظر [أذونات التخزين](/ar/guide/deployment#storage-permissions) لإعدادات `fsGroup` وإعدادات UID الأجنبي (TrueNAS وOpenShift).

**SecurityContext الموصى به للـPod:**

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

بما أنّ `runAsUser: 999` مضبوط على مستوى الـpod، تتخطّى نقطة الدخول gosu كلياً. يسمح هذا بقدرتَي `allowPrivilegeEscalation: false` و`drop: [ALL]` دون تعارض.

لتحديد حجم الموارد، انظر [متطلبات الأجهزة](/ar/guide/deployment#hardware-requirements).

## النسخ الاحتياطي والاسترجاع {#backup-and-recovery}

تنقسم الحالة الدائمة عبر حجمين:

| الحجم | المحتويات | حرِج؟ |
|---|---|---|
| `SnapOtter-pgdata` | قاعدة بيانات PostgreSQL (المستخدمون والإعدادات والمسارات والمهام وسجل التدقيق) | نعم |
| `/data` (حجم التطبيق) | الملفات المرفوعة من المستخدم ونماذج الذكاء الاصطناعي وبيئة Python الافتراضية | جزئياً (انظر أدناه) |

داخل الحجم `/data`:

| المسار | المحتويات | حرِج؟ |
|---|---|---|
| `/data/uploads/` و`/data/outputs/` | ملفات المستخدم ونتائج المعالجة | نعم |
| `/data/ai/` | ملفات نماذج الذكاء الاصطناعي المنزَّلة | لا (قابلة لإعادة التنزيل) |
| `/data/venv/` | بيئة Python الافتراضية | لا (يُعاد بناؤها عند البدء) |

### النسخ الاحتياطي لقاعدة البيانات {#database-backup}

استخدم `pg_dump` لأخذ نسخة احتياطية من قاعدة البيانات أثناء تشغيل الحزمة:

```bash
# Dump the database
docker exec SnapOtter-postgres pg_dump -U snapotter snapotter > backup.sql

# Restore into a fresh database
cat backup.sql | docker exec -i SnapOtter-postgres psql -U snapotter snapotter
```

بدلاً من ذلك، أوقف الحزمة وخذ لقطة للحجم `SnapOtter-pgdata`:

```bash
docker compose down
docker run --rm -v SnapOtter-pgdata:/data -v $(pwd)/backup:/backup \
  alpine tar czf /backup/snapotter-pgdata.tar.gz -C /data .
```

### النسخ الاحتياطي لملفات المستخدم {#user-files-backup}

```bash
# Snapshot the app data volume (excluding re-downloadable AI models)
docker run --rm -v SnapOtter-data:/data -v $(pwd)/backup:/backup \
  alpine tar czf /backup/snapotter-files.tar.gz \
    --exclude='ai' --exclude='venv' -C /data .
```

يصل مجموع نماذج الذكاء الاصطناعي إلى نحو 24 غيغابايت عبر جميع الحزم. وبما أنها قابلة لإعادة التنزيل، فاستبعِد `/data/ai/` و`/data/venv/` من النسخ الاحتياطية لتوفير المساحة. قاعدة البيانات وملفات المستخدم فقط هي الحرِجة.

## وثائق الامتثال {#compliance-artifacts}

يتضمّن كل إصدار من SnapOtter وثائق الأمان التالية:

| الوثيقة | التنسيق | أين تجدها |
|---|---|---|
| SBOM (CycloneDX) | JSON | أصل [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases): `snapotter-v{version}-sbom.cdx.json` |
| SBOM (SPDX) | JSON | أصل [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases): `snapotter-v{version}-sbom.spdx.json` |
| فحص الثغرات | Trivy JSON | أصل [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases): `snapotter-v{version}-trivy.json` |
| فحص الثغرات | SARIF | علامة تبويب [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security) |
| التحليل الساكن | CodeQL (JS/TS + Python) | علامة تبويب [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security)، تعمل أسبوعياً + لكل PR |
| مراجعة التبعيات | أصلية في GitHub | فحص لكل PR، يفشل عند إضافات عالية الخطورة |
| تدقيق تبعيات Python | pip-audit | سجل تشغيل CI عند كل دفعة |
| سياسة الأمان | Markdown | [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) في المستودع |
| تحديثات التبعيات | Dependabot | طلبات سحب أسبوعية آلية لـnpm وpip وDocker وActions |

**تشغيل فحصك الخاص:**

نزّل SBOM من الإصدار وافحصه بأداتك المفضّلة:

```bash
# Scan with Grype using the CycloneDX SBOM
grype sbom:snapotter-v1.17.2-sbom.cdx.json

# Scan with Trivy using the SPDX SBOM
trivy sbom snapotter-v1.17.2-sbom.spdx.json

# Scan the Docker image directly
trivy image snapotter/snapotter:1.17.2
```

::: info 
يعكس SBOM وفحص الثغرات الصورة الدقيقة المنشورة لذلك الإصدار. لا تُضمَّن حزم نماذج الذكاء الاصطناعي المثبّتة بعد النشر في SBOM لأنها تُنزَّل في وقت التشغيل.
:::
