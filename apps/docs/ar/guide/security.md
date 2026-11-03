---
description: "دليل تحصين الأمان لـ SnapOtter. أمان الحاويات، وعزل الشبكة، وأسرار Docker، والنشر على Kubernetes، وأدلة الامتثال."
i18n_source_hash: 5cf773ddb4c0
i18n_provenance: machine
i18n_output_hash: e43a10056ba6
i18n_hash_version: 2
---

# الأمان والتحصين {#security-hardening}

يعالج SnapOtter الملفات بالكامل على بنيتك التحتية. ويرسل افتراضياً تحليلات منتج وتقارير أعطال مجهولة وخالية من المحتوى للمساعدة في تحسين المشروع. ولا يرسل أبداً ملفاتك أو أسماء ملفاتك أو محتوياتها أو مخرجات OCR أو بيانات الصور الوصفية أو نصوص المستندات. لا تُرسل الملاحظات الاختيارية إلا بعد أن يقدّمها المستخدم، وفقط عند تفعيل التحليلات، ولا تُضمَّن حقول الاتصال إلا بموافقة صريحة على الاتصال. يمكن للمسؤول إيقاف التحليلات وجمع الملاحظات بنقرة واحدة ضمن Settings > System > Privacy دون إعادة بناء. تبقى معالجة الملفات دائماً داخل حاويتك.

تعمل الحاوية بمستخدم مخصص غير root (`snapotter`) مع إسقاط جميع قدرات Linux باستثناء الحد الأدنى المطلوب. للاطلاع على سياسة الإفصاح الكاملة عن الثغرات والبنية الأمنية، راجع [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) على GitHub.

## تحصين الحاوية {#container-hardening}

ملفا Compose المعتمدان لـ [CPU](https://github.com/snapotter-hq/SnapOtter/blob/v2.3.0/docker/docker-compose.yml) و[GPU](https://github.com/snapotter-hq/SnapOtter/blob/v2.3.0/docker/docker-compose-gpu.yml) هما المرجع الأساسي. لا تنسخ مثالاً مختصراً إلى بيئة الإنتاج؛ انشر الملف من وسم الإصدار الذي تحققت منه.

تطبق الحزمتان الضوابط التالية:

- تحتوي حدود الذاكرة والمبادلة وCPU وPID المعالجة الأصلية الجامحة.
- تُسقط كل خدمة جميع قدرات Linux. ويعيد التطبيق إضافة `CHOWN, SETUID, SETGID, DAC_OVERRIDE, FOWNER, KILL` فقط لملكية وحدات التخزين، وإسقاط الهوية أحادي الاتجاه `gosu`، وتمرير الإشارات بسلاسة. أما PostgreSQL وRedis فتحصلان فقط على المجموعة الفرعية التي تحتاجها نقاط الدخول الرسمية لهما.
- يمنع `security_opt: [no-new-privileges:true]` العمليات في حاويات التطبيق وPostgreSQL وRedis من اكتساب صلاحيات إضافية. ويظل هذا متوافقاً مع `gosu`: تبدأ نقطة الدخول بصلاحيات root، وتجهّز وحدات التخزين، ثم تنتقل فقط إلى المستخدم المخصص `snapotter`.
- مدخلات صورتي PostgreSQL وRedis مثبَّتة بواسطة digest. وينبغي كذلك تثبيت التطبيق على وسم إصدار أو digest تم التحقق منه بدلاً من `latest`.
- تُعرَّف فحوص السلامة، وتدوير سجلات JSON المحدود، وRedis AOF الدائم، وسياسة إعادة التشغيل مركزياً في الملفات المعتمدة.

للنشر المواجه للإنترنت، اربط المنفذ 1349 بواجهة loopback وأنهِ TLS عند وكيل عكسي مُصان. أنشئ بيانات اعتماد فريدة لـ PostgreSQL وRedis، واحفظ الأسرار في ملفات محمية أو مدير أسرار، وغيّر كلمة مرور المسؤول الأولية فوراً.

### لماذا لم يُضبط `read_only` {#why-read-only-is-not-set}

لم يُضبط `read_only: true` لأن إعادة تعيين PUID/PGID تكتب إلى `/etc/passwd` و`/etc/group` عند بدء التشغيل. إذا استخدمت علَم Docker ‏`--user` أو `runAsUser` في Kubernetes بدلاً من PUID/PGID، فيمكنك تفعيل نظام ملفات جذر للقراءة فقط بأمان.

## عزل الشبكة {#network-isolation}

معالجة الملفات محلية، لكن التثبيت الافتراضي **ليس نظاماً خالياً من حركة الخروج**. تستخدم تحليلات المنتج المجهولة PostHog ويستخدم الإبلاغ عن الأعطال Sentry عند تفعيل القياس عن بُعد. اضبط `SNAPOTTER_TELEMETRY=0` (أو عطّل التحليلات ضمن Settings > System > Privacy) لإيقاف كليهما. لا يضمّن SnapOtter أبداً الملفات المرفوعة أو أسماء الملفات أو مخرجات OCR أو نصوص المستندات أو أي محتويات ملفات أخرى في تلك الأحداث.

الحركة الصادرة الأخرى مرتبطة بالميزات: يُنزّل تثبيت حزم/نماذج الذكاء الاصطناعي مدخلات إصدار موقَّعة؛ ويجلب استيراد URL عنوان URL عاماً يطلبه المستخدم؛ وتتصل تكاملات OIDC وSAML وOpenTelemetry وwebhooks والتخزين المتوافق مع S3 أو ما يشابهها، عند ضبطها صراحةً، بالوجهات التي يختارها المسؤول. تنزيلات النماذج أثناء التشغيل معطلة افتراضياً. اضبط `SNAPOTTER_ALLOW_MODEL_DOWNLOAD=1` فقط للموافقة صراحةً على التنزيلات الاحتياطية التلقائية. يمكن لـ [استيراد الحزم دون اتصال](/ar/guide/deployment) توفير ميزات الذكاء الاصطناعي دون حركة خروج لتنزيل النماذج أثناء التشغيل.

**توصيات جدار الحماية:**

| السيناريو | قاعدة الحركة الصادرة |
|---|---|
| معزول عن الشبكة (Air-gapped) | اضبط `SNAPOTTER_TELEMETRY=0` و`SNAPOTTER_ALLOW_MODEL_DOWNLOAD=0`، واستخدم استيراد حزم الذكاء الاصطناعي دون اتصال، وعطّل استيراد URL والتكاملات الخارجية، ثم احجب حركة الخروج |
| القياس عن بُعد الافتراضي | اسمح بنقاط نهاية PostHog وSentry المدرجة في سجلات المتصفح/الشبكة لديك؛ وعطّل القياس عن بُعد إذا كانت السياسة لا تسمح بها |
| الحاجة إلى حزم الذكاء الاصطناعي | أثناء التثبيت، اسمح بـ HTTPS إلى `huggingface.co, *.xethub.hf.co, cdn-lfs.huggingface.co, github.com, objects.githubusercontent.com, storage.googleapis.com, pypi.org, files.pythonhosted.org`؛ ثم احجب تلك المضيفات |
| التكاملات الخارجية | اسمح فقط بوجهات OIDC/SAML/OTLP/webhook/التخزين الكائني التي ضبطها المسؤول بالضبط |

تُقدَّم أرشيفات الحزم من تخزين Xet التابع لـ Hugging Face، الذي ينقل عبر نقاط النهاية `*.xethub.hf.co` بالتوازي، وهو ما يجعل تنزيل الحزم متعددة الغيغابايت سريعاً. إذا كان جدار الحماية لديك يسمح بـ `huggingface.co` لكنه يحجب `*.xethub.hf.co`، فتنجح عمليات التثبيت لكنها تعود إلى تنزيل أبطأ بتدفق واحد، لذا أضف مضيفات Xet إلى قائمة السماح للبقاء على المسار السريع. يمكن للتثبيتات غير المتصلة تماماً تجاوز كل ذلك واستخدام [استيراد الحزم دون اتصال](/ar/guide/deployment) بدلاً منه.

لإعداد الوكيل العكسي (Nginx وTraefik وCaddy وأنفاق Cloudflare)، راجع [دليل النشر](/ar/guide/deployment#reverse-proxy).

## أسرار Docker {#docker-secrets}

في عمليات النشر الإنتاجية، تجنب تمرير الأسرار كمتغيرات بيئة بنص صريح. تدعم نقطة الدخول اصطلاح `_FILE` في Docker: اربط السر كملف واضبط المتغير المقابل `_FILE` على مساره.

**الأسرار المدعومة:**

| المتغير | المكافئ في `_FILE` |
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
تتطلب أسرار Docker Compose (دون Swarm) الإصدار Compose v2.23 أو أحدث.
:::

## النشر على Kubernetes {#kubernetes-deployment}

تكتشف نقطة الدخول متى كانت الحاوية تعمل أصلاً بمستخدم غير root (مثلاً عبر `runAsUser` في Kubernetes) وتتخطى إسقاط الصلاحيات عبر gosu تلقائياً. في هذه الحالة لا تستطيع تنفيذ chown على وحدات التخزين المربوطة بنفسها، لذا تتحقق من إمكانية الكتابة عليها وتخرج مبكراً مع إرشادات قابلة للتنفيذ إن لم تكن كذلك. راجع [أذونات التخزين](/ar/guide/deployment#storage-permissions) لإعدادات `fsGroup` والـ UID الغريب (TrueNAS وOpenShift).

**SecurityContext الموصى به للـ Pod:**

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

بما أن `runAsUser: 999` مضبوط على مستوى الـ Pod، تتخطى نقطة الدخول gosu بالكامل. وهذا يتيح قدرتي `allowPrivilegeEscalation: false` و`drop: [ALL]` دون تعارض.

لتحديد حجم الموارد، راجع [متطلبات العتاد](/ar/guide/deployment#hardware-requirements).

## النسخ الاحتياطي والاستعادة {#backup-and-recovery}

تعرّف حزمة Compose الإنتاجية أربع وحدات تخزين. أوقف الحركة الواردة ودع المهام النشطة تنتهي قبل أخذ نسخة احتياطية منسقة بحيث تصف PostgreSQL وRedis وحالة الملفات اللحظة الزمنية نفسها.

| وحدة التخزين | المحتويات | التعامل عند الاستعادة |
|---|---|---|
| `SnapOtter-pgdata` | مستخدمو PostgreSQL والإعدادات وخطوط المعالجة والمهام وبيانات الملفات الوصفية وسجل التدقيق | حرجة؛ استخدم تفريغاً منطقياً سريع الفشل للاستعادة القابلة للنقل |
| `SnapOtter-data` | كائنات المكتبة المحفوظة والسجلات وحالة الذكاء الاصطناعي (`/data/files, /data/logs, /data/ai, /data/ai/venv`) | انسخ وحدة التخزين بالكامل؛ ولتوفير المساحة، استبعد حالة الذكاء الاصطناعي كلها عمداً وأعد تثبيت حزمها |
| `SnapOtter-redisdata` | Redis AOF لحالة طابور BullMQ الدائمة | انسخها بعد إيقاف التطبيق مؤقتاً وفرض `SAVE`؛ مطلوبة لاستئناف العمل المصفوف بدقة |
| `SnapOtter-workspace` | مفاتيح التخزين الكائني المؤقتة (`/tmp/workspace/uploads, /tmp/workspace/outputs`) | لا تنسخها احتياطياً بعد تصريف كل المهام أو إلغائها؛ ولا تتخلص منها أبداً بينما المهام نشطة |

يضيف Compose عادةً اسم المشروع كبادئة لأسماء وحدات التخزين. استخرج وحدة التخزين المصدر الفعلية من الحاوية المربوطة بدلاً من افتراض أن اسماً معروضاً مثل `SnapOtter-data` هو اسم وحدة تخزين Docker.

### النسخ الاحتياطي لقاعدة البيانات {#database-backup}

استخدم صيغة الأرشيف المخصصة في PostgreSQL وتحقق من الأرشيف قبل اعتبار النسخة الاحتياطية مكتملة:

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

اختبر كل نسخة احتياطية باستعادتها في حزمة معزولة، وتحقق من سجلات قاعدة البيانات ومجاميع التحقق للملفات، ثم شغّل التطبيق. يؤتمت `tests/qa/backup-restore-drill.sh` في المستودع بوابة الإصدار هذه مقابل `QA_IMAGE` صريح.

إذا كانت منصتك تأخذ لقطات وحدات تخزين متسقة عند الانهيار بدلاً من ذلك، فأوقف الحزمة بأكملها أولاً والتقط لقطات لجميع وحدات التخزين الحرجة كمجموعة واحدة. نسخ دليل بيانات PostgreSQL الخام من حاوية قيد التشغيل ليس نسخة منطقية احتياطية مدعومة.

### النسخ الاحتياطي للملفات والطابور {#file-and-queue-backup}

أوقف التطبيق مؤقتاً قبل التقاط وحدات تخزين الملفات والطابور. استخدم `docker inspect` لاستخراج اسم وحدة التخزين الفعلي، وأجبر Redis على حفظ حالته الحالية، وأرشِف مع الحفاظ على الملكية والأذونات:

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

أعد تشغيل Redis قبل التطبيق. إذا استبعدت `/data/ai` عمداً، فأزل شجرة الذكاء الاصطناعي كاملة بدلاً من الإبقاء على سجل `installed.json` دون نماذجه أو بيئته الافتراضية. أبقِ ملفات النسخ الاحتياطي مشفرة وخاضعة للتحكم في الوصول ومنفصلة عن المضيف الذي يشغّل SnapOtter.

## أدلة الامتثال {#compliance-artifacts}

يتضمن كل إصدار من SnapOtter الأدلة الأمنية التالية:

| الدليل | الصيغة | أين تجده |
|---|---|---|
| ربط موضوع الإصدار | JSON قانوني + شهادة GitHub | أصل في [إصدار GitHub](https://github.com/snapotter-hq/SnapOtter/releases): `snapotter-v{version}-release-subjects.json` |
| SBOM للأرشيف | CycloneDX وSPDX JSON | أصول الإصدار: `snapotter-v{version}-archive-linux-{arch}-sbom.{cdx,spdx}.json` |
| SBOM للصورة | CycloneDX وSPDX JSON | أصول الإصدار: `snapotter-v{version}-image-linux-{arch}-sbom.{cdx,spdx}.json` |
| فحوص الثغرات | Trivy JSON | أصول الإصدار ببادئات `archive-linux-{arch}` أو `image-linux-{arch}` المطابقة |
| فحص الثغرات | SARIF | علامة تبويب [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security) |
| التحليل الساكن | CodeQL (JS/TS + Python) | علامة تبويب [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security)، يعمل أسبوعياً ومع كل PR |
| مراجعة التبعيات | GitHub الأصلي | فحص لكل PR، يفشل عند إضافات عالية الخطورة |
| تدقيق تبعيات Python | pip-audit | سجل تشغيل CI عند كل دفع |
| سياسة الأمان | Markdown | [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) في المستودع |
| تحديثات التبعيات | Dependabot | طلبات PR أسبوعية آلية لـ npm وpip وDocker وActions |

**تشغيل فحصك الخاص:**

نزّل بيان موضوع الإصدار وتحقق من أن سير عمل الإصدار قد صدّق عليه:

```bash
gh attestation verify snapotter-v2.3.0-release-subjects.json \
  --repo snapotter-hq/SnapOtter \
  --signer-workflow snapotter-hq/SnapOtter/.github/workflows/release.yml
```

يسجّل البيان `releaseTag` و`releaseCommit` و`workflowTriggerCommit` بشكل منفصل. تحقق من أن `releaseCommit` هو الـ commit المستخرج من الوسم غير القابل للتغيير، ثم تحقق من digest بصيغة SHA-256 للأرشيف أو الصورة أو SBOM أو الفحص الذي تستهلكه مقابل مدخله في `subjects`. هذا التمييز مقصود: فسحب commit إصدار أُنشئ حديثاً لا يغيّر هوية الـ commit في بيانات اعتماد OIDC الخاصة بسير العمل.

يمكنك أيضاً فحص SBOM منزَّل أو الصورة مباشرة:

```bash
# Scan with Grype using the CycloneDX SBOM
grype sbom:snapotter-v2.3.0-image-linux-amd64-sbom.cdx.json

# Scan with Trivy using the SPDX SBOM
trivy sbom snapotter-v2.3.0-image-linux-amd64-sbom.spdx.json

# Scan the Docker image directly
trivy image snapotter/snapotter:2.3.0
```

::: info 
تعكس SBOM وفحوص الصورة الصورة الخاصة بمعمارية معينة والمنشورة بالضبط لذلك الإصدار. أما SBOM وفحوص الأرشيف فتصف الأرشيف المبني مسبقاً بشكل منفصل. لا تُدرَج حزم نماذج الذكاء الاصطناعي المثبَّتة بعد النشر في هذه SBOM لأنها تُنزَّل أثناء التشغيل.
:::