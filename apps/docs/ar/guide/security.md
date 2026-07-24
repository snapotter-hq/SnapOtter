---
description: "دليل تعزيز أمان SnapOtter. أمان الحاويات، وعزل الشبكة، وأسرار Docker، ونشر Kubernetes، وأدوات الامتثال."
i18n_source_hash: 9ff337fa0417
i18n_provenance: machine
i18n_output_hash: dd2ace57860c
i18n_hash_version: 2
---

# الأمان والتعزيز {#security-hardening}

يعالج SnapOtter الملفات بالكامل على بنيتك التحتية. يرسل تحليلات منتج مجهولة وخالية من المحتوى وتقارير أعطال افتراضيًا للمساعدة في تحسين المشروع. لا يرسل أبدًا ملفاتك، ولا أسماء ملفاتك، ولا محتويات ملفاتك، ولا مخرجات OCR، ولا بيانات الصور الوصفية، ولا نص المستندات. تُرسَل الملاحظات الاختيارية فقط بعد أن يقدّمها المستخدم، وفقط عند تفعيل التحليلات، وتُضمَّن حقول جهة الاتصال فقط مع موافقة صريحة على الاتصال. يمكن للمسؤول إيقاف التحليلات والتقاط الملاحظات بنقرة واحدة ضمن Settings > System > Privacy، دون الحاجة لإعادة بناء. تبقى معالجة الملفات دائمًا داخل حاويتك.

تعمل الحاوية كمستخدم مخصص غير root (`snapotter`) مع إسقاط جميع قدرات Linux باستثناء المجموعة الدنيا المطلوبة. للاطلاع على سياسة الإفصاح الكاملة عن الثغرات ومعمارية الأمان، راجع [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) على GitHub.

## تصلب الحاويات {#container-hardening}

تعد ملفات الإنشاء الأساسية [CPU](https://github.com/snapotter-hq/SnapOtter/blob/main/docker/docker-compose.yml) و[GPU](https://github.com/snapotter-hq/SnapOtter/blob/main/docker/docker-compose-gpu.yml) مصدر الحقيقة. لا تنسخ مثالًا مختصرًا إلى الإنتاج؛ انشر الملف من علامة الإصدار التي قمت بالتحقق منها.

تطبق كلا المجموعتين عناصر التحكم التالية:

- تحتوي حدود الذاكرة والمبادلة ووحدة المعالجة المركزية وPID على معالجة أصلية هاربة.
- كل خدمة تسقط جميع إمكانيات Linux. يضيف التطبيق `CHOWN, SETUID, SETGID, DAC_OVERRIDE, FOWNER, KILL` فقط لملكية الحجم، وإسقاط هوية `gosu` أحادية الاتجاه، وإعادة توجيه الإشارة بسلاسة. يتلقى PostgreSQL وRedis فقط المجموعة الفرعية التي تحتاجها نقاط الدخول الرسمية الخاصة بهم.
- يمنع `security_opt: [no-new-privileges:true]` العمليات في حاويات التطبيق وPostgreSQL وRedis من الحصول على امتيازات إضافية. يظل هذا متوافقًا مع `gosu`: تبدأ نقطة الإدخال كجذر، وتقوم بإعداد وحدات التخزين، ولا تصل إلا إلى مستخدم `snapotter` المخصص.
- يتم تثبيت مدخلات صور PostgreSQL وRedis بواسطة الملخص. يجب أيضًا تثبيت التطبيق على علامة إصدار أو ملخص تم التحقق منه بدلاً من `latest`.
- يتم تحديد عمليات التحقق من الصحة وتدوير سجل JSON المحدود وRedis AOF الدائم وسياسة إعادة التشغيل مركزيًا في الملفات الأساسية.

بالنسبة للنشر الذي يواجه الإنترنت، قم بربط المنفذ 1349 للاسترجاع وإنهاء TLS في وكيل عكسي يتم الحفاظ عليه. قم بإنشاء بيانات اعتماد PostgreSQL وRedis فريدة، وقم بتخزين الأسرار في ملفات محمية أو مدير سري، وقم بتغيير كلمة مرور المسؤول الأولية على الفور.

### لماذا لم يتم تعيين `read_only` على {#why-read-only-is-not-set}

لم يتم تعيين `read_only: true` لأن إعادة تعيين PUID/PGID تكتب إلى `/etc/passwd` و`/etc/group` عند بدء التشغيل. إذا كنت تستخدم علامة Docker's `--user` أو Kubernetes `runAsUser` بدلاً من PUID/PGID، فيمكنك تمكين نظام ملفات جذر للقراءة فقط بأمان.

## عزل الشبكة {#network-isolation}

تتم معالجة الملفات محليًا، ولكن التثبيت الافتراضي **ليس نظامًا خاليًا من الخروج**. تستخدم تحليلات المنتج المجهولة PostHog وتستخدم تقارير الأعطال Sentry عند تمكين القياس عن بعد. قم بتعيين `SNAPOTTER_TELEMETRY=0` (أو قم بتعطيل التحليلات ضمن الإعدادات > النظام > الخصوصية) لإيقاف تشغيل كليهما. لا يتضمن SnapOtter أبدًا الملفات التي تم تحميلها أو أسماء الملفات أو مخرجات التعرف الضوئي على الحروف أو نص المستند أو محتويات الملفات الأخرى في تلك الأحداث.

تعتمد حركة المرور الصادرة الأخرى على الميزات: تنزيلات تثبيت حزمة/نموذج الذكاء الاصطناعي، ومدخلات الإصدار الموقعة؛ يؤدي استيراد عنوان URL إلى جلب عنوان URL عام يطلبه المستخدم؛ وOIDC، أو SAML، أو OpenTelemetry، أو webhooks، أو التخزين المتوافق مع S3، أو عمليات التكامل المماثلة التي تم تكوينها بشكل صريح، اتصل بالوجهات التي اختارها المسؤول. يتم تعطيل تنزيلات النماذج في وقت التشغيل افتراضيًا. اضبط `SNAPOTTER_ALLOW_MODEL_DOWNLOAD=1` فقط للاشتراك صراحةً في التنزيلات الاحتياطية التلقائية. يمكن لـ [استيراد الحزمة دون اتصال](/ar/guide/deployment) توفير ميزات الذكاء الاصطناعي دون الخروج من نموذج وقت التشغيل.

**توصيات جدار الحماية:**

|سيناريو|القاعدة الصادرة|
|---|---|
|فجوة الهواء|قم بتعيين `SNAPOTTER_TELEMETRY=0` و`SNAPOTTER_ALLOW_MODEL_DOWNLOAD=0`، واستخدم استيراد حزمة AI دون اتصال، وقم بتعطيل استيراد عنوان URL وعمليات التكامل الخارجية، ثم قم بحظر الخروج|
|القياس عن بعد الافتراضي|السماح بنقطتي نهاية PostHog وSentry المدرجة في سجلات المتصفح/الشبكة لديك؛ قم بتعطيل القياس عن بعد إذا كانت السياسة لا تسمح بذلك|
|هناك حاجة إلى حزم الذكاء الاصطناعي|أثناء التثبيت، اسمح بـ HTTPS إلى `huggingface.co, *.xethub.hf.co, cdn-lfs.huggingface.co, github.com, objects.githubusercontent.com, storage.googleapis.com, pypi.org, files.pythonhosted.org`؛ ثم قم بحظر هؤلاء المضيفين|
|التكاملات الخارجية|السماح فقط بوجهات OIDC/SAML/OTLP/webhook/object-storage التي تم تكوينها بواسطة المسؤول|

يتم تقديم أرشيفات الحزمة من خلال وحدة تخزين Xet الخاصة بـ Hugging Face، والتي تنقل عبر نقاط النهاية `*.xethub.hf.co` بالتوازي وهو ما يجعل تنزيلات الحزم متعددة الجيجابايت سريعة. إذا كان جدار الحماية الخاص بك يسمح بـ `huggingface.co` ولكنه يحظر `*.xethub.hf.co`، فستظل عمليات التثبيت ناجحة ولكنها تتراجع إلى تنزيل دفق واحد أبطأ، لذا قم بإدراج مضيفي Xet في القائمة المسموح بها للبقاء على المسار السريع. يمكن لعمليات التثبيت دون الاتصال بالإنترنت تخطي كل هذا واستخدام [Offline Bundle Import](/ar/guide/deployment) بدلاً من ذلك.

للحصول على تكوين الوكيل العكسي (Nginx، وTraefik، وCaddy، وCloudflare Tunnels)، راجع [دليل النشر](/ar/guide/deployment#reverse-proxy).

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

## النسخ الاحتياطي والاسترداد {#backup-and-recovery}

يحدد مكدس Compose الإنتاج أربعة مجلدات. أوقف الدخول واترك المهام النشطة تنتهي قبل أخذ نسخة احتياطية منسقة، بحيث تصف PostgreSQL وRedis وحالة الملف نفس النقطة الزمنية.

|مقدار|محتويات|علاج الانتعاش|
|---|---|---|
|`SnapOtter-pgdata`|مستخدمو PostgreSQL والإعدادات وخطوط الأنابيب والوظائف وبيانات تعريف الملف وسجل التدقيق|شديد الأهمية؛ استخدم تفريغًا منطقيًا سريع الفشل للاسترداد المحمول|
|`SnapOtter-data`|كائنات المكتبة المحفوظة والسجلات وحالة الذكاء الاصطناعي (`/data/files, /data/logs, /data/ai, /data/ai/venv`)|قم بعمل نسخة احتياطية من الحجم بأكمله؛ لتوفير المساحة، قم بحذف جميع حالات الذكاء الاصطناعي عمدًا وأعد تثبيت حزمها|
|`SnapOtter-redisdata`|Redis AOF لحالة قائمة انتظار BullMQ الدائمة|النسخ الاحتياطي بعد إيقاف التطبيق مؤقتًا وفرض `SAVE`؛ مطلوب لاستئناف العمل في قائمة الانتظار بالضبط|
|`SnapOtter-workspace`|مفاتيح تخزين الكائنات المؤقتة (`/tmp/workspace/uploads, /tmp/workspace/outputs`)|لا تقم بالنسخ الاحتياطي بعد استنزاف جميع المهام أو إلغائها؛ لا تتخلص منه أبدًا أثناء نشاط الوظائف|

إنشاء بادئات عادةً لأسماء وحدات التخزين مع اسم المشروع. قم بحل وحدة تخزين المصدر الحقيقية من الحاوية المحملة بدلاً من افتراض أن اسم العرض مثل `SnapOtter-data` هو اسم وحدة تخزين Docker.

### النسخ الاحتياطي لقاعدة البيانات {#database-backup}

استخدم تنسيق الأرشيف المخصص لـ PostgreSQL وتحقق من الأرشيف قبل التعامل مع النسخة الاحتياطية على أنها كاملة:

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

اختبر كل نسخة احتياطية عن طريق استعادتها إلى مكدس معزول، والتحقق من سجلات قاعدة البيانات والمجاميع الاختبارية للملفات، وبدء تشغيل التطبيق. يقوم `tests/qa/backup-restore-drill.sh` الخاص بالمستودع بأتمتة بوابة التحرير هذه مقابل `QA_IMAGE` الصريح.

إذا كان النظام الأساسي الخاص بك يأخذ لقطات حجمية متسقة مع الأعطال بدلاً من ذلك، فأوقف المجموعة بأكملها أولاً وقم بالتقاط لقطات لجميع وحدات التخزين المهمة كمجموعة واحدة. إن نسخة دليل بيانات PostgreSQL الأولية من حاوية قيد التشغيل ليست نسخة احتياطية منطقية مدعومة.

### النسخ الاحتياطي للملفات وقائمة الانتظار {#file-and-queue-backup}

قم بإيقاف التطبيق مؤقتًا قبل التقاط وحدات تخزين الملفات وقائمة الانتظار. استخدم `docker inspect` لحل اسم المجلد الفعلي، وإجبار Redis على الاستمرار في حالته الحالية، والأرشفة مع الاحتفاظ بالملكية والأذونات:

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

أعد تشغيل Redis قبل التطبيق. إذا قمت باستبعاد `/data/ai` عمدًا، فقم بإزالة الشجرة الفرعية AI بالكامل بدلاً من الاحتفاظ بسجل `installed.json` بدون نماذجه أو بيئته الافتراضية. احتفظ بملفات النسخ الاحتياطي مشفرة، ويمكن التحكم في الوصول إليها، ومنفصلة عن المضيف الذي يقوم بتشغيل SnapOtter.

## التحف الامتثال {#compliance-artifacts}

يتضمن كل إصدار من إصدارات SnapOtter عناصر الأمان التالية:

| قطعة أثرية | شكل | أين يمكن العثور عليه |
|---|---|---|
| الافراج عن موضوع ملزم | شهادة JSON + GitHub الكنسي | أصل [إصدار GitHub](https://github.com/snapotter-hq/SnapOtter/releases): `snapotter-v{version}-release-subjects.json` |
| أرشيف SBOM | CycloneDX وSPDX JSON | أصول الإصدار: `snapotter-v{version}-archive-linux-{arch}-sbom.{cdx,spdx}.json` |
| الصورة SBOM | CycloneDX وSPDX JSON | أصول الإصدار: `snapotter-v{version}-image-linux-{arch}-sbom.{cdx,spdx}.json` |
| عمليات فحص الثغرات الأمنية | Trivy JSON | قم بتحرير الأصول ذات البادئات المطابقة `archive-linux-{arch}` أو `image-linux-{arch}` |
| فحص الثغرات الأمنية | SARIF | علامة التبويب [أمان GitHub](https://github.com/snapotter-hq/SnapOtter/security). |
| التحليل الساكن | CodeQL (JS/TS + Python) | علامة التبويب [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security)، تعمل أسبوعيًا + لكل العلاقات العامة |
| مراجعة التبعية | GitHub مواطن | يفشل فحص كل PR في الإضافات عالية الخطورة |
| تدقيق التبعية Python | pip-audit | سجل تشغيل CI في كل دفعة |
| السياسة الأمنية | Markdown | [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) في المستودع |
| تحديثات التبعية | Dependabot | تقارير العلاقات العامة الأسبوعية الآلية لـ npm، pip، Docker، Actions |

**تشغيل الفحص الخاص بك:**

قم بتنزيل بيان موضوع الإصدار وتحقق من أنه تم التصديق عليه من خلال سير عمل الإصدار:

```bash
gh attestation verify snapotter-v2.1.0-release-subjects.json \
  --repo snapotter-hq/SnapOtter \
  --signer-workflow snapotter-hq/SnapOtter/.github/workflows/release.yml
```

يسجل البيان `releaseTag` و`releaseCommit` و`workflowTriggerCommit` بشكل منفصل. تحقق من أن `releaseCommit` هو الالتزام المستخرج من العلامة غير القابلة للتغيير، ثم تحقق من ملخص SHA-256 للأرشيف أو الصورة أو SBOM أو المسح الضوئي الذي تستهلكه مقابل إدخاله في `subjects`. هذا التمييز مقصود: لا يؤدي التحقق من التزام الإصدار الذي تم إنشاؤه حديثًا إلى تغيير هوية الالتزام في بيانات اعتماد OIDC لسير العمل.

يمكنك أيضًا إجراء مسح ضوئي لملف SBOM الذي تم تنزيله أو الصورة مباشرة:

```bash
# Scan with Grype using the CycloneDX SBOM
grype sbom:snapotter-v2.1.0-image-linux-amd64-sbom.cdx.json

# Scan with Trivy using the SPDX SBOM
trivy sbom snapotter-v2.1.0-image-linux-amd64-sbom.spdx.json

# Scan the Docker image directly
trivy image snapotter/snapotter:2.1.0
```

::: info
تعكس الصورة SBOMs والمسح الضوئي الصورة الدقيقة الخاصة بالبنية المنشورة لهذا الإصدار. يصف الأرشيف SBOMs وعمليات المسح الأرشيف الذي تم إنشاؤه مسبقًا بشكل منفصل. لا يتم تضمين حزم نماذج AI التي تم تثبيتها بعد النشر في SBOMs لأنه يتم تنزيلها في وقت التشغيل.
:::
