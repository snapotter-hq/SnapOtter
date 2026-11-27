---
i18n_source_hash: 919652d75ac6
i18n_provenance: machine
i18n_output_hash: 77ceb24c80c3
i18n_hash_version: 2
---
# الإعدادات منخفضة الموارد {#low-resource-setups}

يعمل SnapOtter جيداً على العتاد الصغير: Raspberry Pi 4 أو 5، أو حاسوب محمول قديم، أو VPS بذاكرة 2 GB. هذه الصفحة هي الدليل العملي لتلك الأجهزة: ما الذي يمكن توقعه، وإعداد جاهز للنسخ مع حدود معقولة، والميزات التي يُفضَّل تجاوزها. توجد بيانات القياس الكاملة وراء هذه الأرقام في [متطلبات العتاد](/ar/guide/deployment#hardware-requirements).

قيدان صارمان في البداية:

- **64 بت فقط.** الصورة مبنية لـ `linux/amd64` و`linux/arm64`. معمارية ARM بنظام 32 بت (`armv7`/`armhf`) غير مدعومة، لذا فإن الأجيال الأولى من Pi وعائلة Pi Zero غير صالحة.
- **حد أدنى للذاكرة 2 GB (للأدوات غير المعتمدة على الذكاء الاصطناعي).** لا يمكن لـ 512 MB تشغيل الحزمة، ويفشل 1 GB مع الدفعات متعددة الملفات. يمثل 2 GB مع نواتين أصغر إعداد يشغّل الأدوات غير المعتمدة على الذكاء الاصطناعي بارتياح.

## ما الذي يعمل جيداً على العتاد الصغير {#what-runs-well}

تعمل كل أداة غير معتمدة على الذكاء الاصطناعي على جهاز بذاكرة 2 GB ونواتين: قسما الصور والملفات بالكامل، وأدوات PDF، وعمليات الفيديو والصوت بنسخ التدفق (القص الزمني، كتم الصوت، إعادة تغليف الحاوية). تنتهي معظمها في أقل من ثانية.

هناك حِملان استثنائيان:

- **إعادة ترميز الفيديو** (التحويل بين الترميزات) يعتمد على وحدة المعالجة المركزية. مقطع 1080p يستغرق نحو 40 ثانية على معالج مكتبي سريع قد يستغرق عدة دقائق على معالج بمستوى Pi. تبقى عمليات نسخ التدفق فورية.
- **أدوات الذكاء الاصطناعي** لها حدود دنيا لذاكرة وحدة المعالجة المركزية لكل حزمة: 2 GB من ذاكرة المضيف (0.5 GB فارغة) لاكتشاف الوجوه وOCR السريع المدمج، و4 GiB من الذاكرة الفعلية المضبوطة لـ OCR الدقيق، و4 GB من ذاكرة المضيف (2 إلى 3 GB فارغة) للتفريغ النصي، وماسحة الكائنات والتلوين، وإزالة الخلفية، والتكبير والتحسين، واستعادة الصور، و8 GB من ذاكرة المضيف (6 GB فارغة) للإصلاح الداخلي عالي الجودة. لا يستطيع جهاز بذاكرة 2 GB تشغيل Whisper أو RealESRGAN أو rembg أو LaMa دون أن تُنهى العملية بسبب نفاد الذاكرة (OOM)، لذلك يفحص SnapOtter الذاكرة الفارغة قبل الإرسال إلى Python sidecar ويرفض فوراً التشغيلات الأقل من حد الحزمة.

لا يُثبَّت أي منهما ولا يعمل ما لم تستخدمه: دون تثبيت أي حزم ذكاء اصطناعي يبقى التطبيق خاملاً عند نحو 360 MB، ولا تُنزَّل حزم الذكاء الاصطناعي إلا عندما يفعّلها المسؤول.

## شرح Raspberry Pi / الحاسوب المحمول القديم {#walkthrough}

هذا هو تثبيت Compose القياسي من [البدء](/ar/guide/getting-started)، مع حدود للموارد وسقوف متحفظة. يفترض نظام تشغيل 64 بت (على Pi: Raspberry Pi OS 64-bit أو Ubuntu Server arm64).

```yaml
services:
  snapotter:
    image: snapotter/snapotter:latest
    ports:
      - "1349:1349"
    volumes:
      - ./snapotter-data:/data
    environment:
      - DATABASE_URL=postgres://${POSTGRES_APP_USER:-snapotter_app}:${POSTGRES_APP_PASSWORD:-snapotter_app}@db:5432/${POSTGRES_DB:-snapotter}
      - DATABASE_MIGRATION_URL=postgres://${POSTGRES_USER:-snapotter}:${POSTGRES_PASSWORD:-snapotter}@db:5432/${POSTGRES_DB:-snapotter}
      - REDIS_URL=redis://redis:6379
      # Small-box profile: see the table below for what each cap does.
      - CONCURRENT_JOBS=1
      - MAX_WORKER_THREADS=2
      - MAX_BATCH_SIZE=5
      - MAX_UPLOAD_SIZE_MB=100
      - MAX_MEGAPIXELS=50
      - MAX_VIDEO_DURATION_S=300
    deploy:
      resources:
        limits:
          cpus: "2"
          memory: 2G
    depends_on:
      - db
      - redis
    restart: unless-stopped

  db:
    image: postgres:17-alpine
    environment:
      - POSTGRES_USER=${POSTGRES_USER:-snapotter}
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-snapotter}     # Change this for non-local deployments
      - POSTGRES_DB=${POSTGRES_DB:-snapotter}
    volumes:
      - ./postgres-data:/var/lib/postgresql/data
    restart: unless-stopped

  redis:
    image: redis:8-alpine
    command: redis-server --maxmemory 256mb --maxmemory-policy noeviction
    restart: unless-stopped
```

ملاحظات لأجهزة بمستوى Pi:

- **فضّل قرص SSD عبر USB على بطاقة SD** لوحدة تخزين البيانات وPostgres. تجري مساحات عمل المهام عمليات إدخال وإخراج فعلية على القرص، وبطاقات SD بطيئة وتبلى سريعاً.
- **تعمل الحاوية الواحدة الشاملة هنا أيضاً** (Postgres وRedis مضمَّنتان عند عدم ضبط [`DATABASE_URL`](/ar/guide/configuration#env-database-url)/[`REDIS_URL`](/ar/guide/configuration#env-redis-url))، وعلى مضيف محدود الذاكرة ينبغي خفض سقف Redis المضمَّن فيها باستخدام [`REDIS_MAXMEMORY`](/ar/guide/configuration#env-redis-maxmemory) (راجع [الإعدادات](/ar/guide/configuration)). يمنحك Compose تحكماً أدق لكل خدمة، ولهذا يستخدمه هذا الشرح.
- **أضف swap على الأجهزة بذاكرة 2 GB.** فهو يمنع الارتفاعات العرضية (ملف PDF كبير، أو دفعة نسيت تحديد سقفها) من الانتهاء بإنهاء بسبب نفاد الذاكرة. zram هو الخيار الملائم لبطاقات SD.
- صورة arm64 تعمل على CPU فقط؛ لا يوجد CUDA على لوحات ARM.

## مفاتيح الضبط {#tuning-knobs}

جميع الحدود هي متغيرات بيئة، موثقة بالكامل في [الإعدادات](/ar/guide/configuration). `0` تعني غير محدود أو تلقائي. أهم المتغيرات على العتاد الصغير:

| المتغير | اقتراح للجهاز الصغير | ما الذي يحميه |
|---|---|---|
| [`CONCURRENT_JOBS`](/ar/guide/configuration#env-concurrent-jobs) | `1` | عدد المهام التي تعمل بالتوازي. يستخدم الاكتشاف التلقائي عدد أنوية CPU ناقص واحد، وهذا مناسب للأجهزة الكبيرة لكنه متحمس أكثر من اللازم على جهاز بنواتين تحت ضغط الذاكرة. |
| [`MAX_WORKER_THREADS`](/ar/guide/configuration#env-max-worker-threads) | `2` | مجمّع خيوط معالجة الصور. |
| [`AI_SIDECAR_IDLE_TIMEOUT`](/ar/guide/configuration#env-ai-sidecar-idle-timeout) | `120` | المدة التي تبقى فيها عملية Python الخاصة بالذكاء الاصطناعي وبيئة OCR محمّلتين بعد آخر طلب. تحتفظان بـ 1-2 GB أثناء التسخين، لذا تعيد المدة الأقصر الذاكرة أسرع على حساب بضع ثوانٍ في استدعاء الذكاء الاصطناعي التالي. اخفض [`AI_SESSION_IDLE_TIMEOUT`](/ar/guide/configuration#env-ai-session-idle-timeout) أيضاً، لأن خروج العملية يتخلص من النماذج المخزنة مؤقتاً. |
| [`MAX_BATCH_SIZE`](/ar/guide/configuration#env-max-batch-size) | `5` | الدفعات هي أول ما يستنفد ذاكرة الأجهزة ذات 1-2 GB. |
| [`MAX_UPLOAD_SIZE_MB`](/ar/guide/configuration#env-max-upload-size-mb) | `100` | يمنع ملفاً ضخماً واحداً من احتلال مساحة العمل كلها. |
| [`MAX_MEGAPIXELS`](/ar/guide/configuration#env-max-megapixels) | `50` | فك ترميز صورة بأكثر من 100 ميغابكسل يستهلك ذاكرة RAM بغض النظر عن حجم الملف. تُرفض الصور التي تتجاوز نحو 268 ميغابكسل حتى عند `0`. |
| [`MAX_VIDEO_DURATION_S`](/ar/guide/configuration#env-max-video-duration-s) | `300` | تحتكر عمليات الترميز الطويلة معالجاً صغيراً لدقائق إلى ساعات. |
| [`JOB_TIMEOUT_LONG_S`](/ar/guide/configuration#env-job-timeout-long-s) | `3600` | سقف صارم لمهام الذكاء الاصطناعي والوسائط، بحيث تحرر المهمة الجامحة الجهاز في النهاية. القيمة الافتراضية ساعتان. تتوقف مهام الصور والمستندات أصلاً عند [`JOB_TIMEOUT_FAST_S`](/ar/guide/configuration#env-job-timeout-fast-s) (120 ثانية افتراضياً). |

تنطبق هذه الحدود على ما يقبله الخادم، لذا اضبطها بما يتناسب مع ما تستخدمه فعلاً بدلاً من جعلها أصغر ما يمكن. إذا كنت لا تلمس الفيديو أبداً، فإن سقف `MAX_VIDEO_DURATION_S` لا يكلّف شيئاً؛ وإذا كنت تمسح المستندات يومياً فلا تضع سقفاً على [`MAX_PDF_PAGES`](/ar/guide/configuration#env-max-pdf-pages).

## ما الذي يجب تجاوزه {#what-to-skip}

- **حزم الذكاء الاصطناعي الثقيلة.** تحتاج أدوات التكبير واستعادة الصور وإزالة الخلفية إلى GPU أو معالج سريع متعدد الأنوية، وتكلّف كل حزمة 4-5 GB من القرص. على جهاز صغير، لا تثبّتها ببساطة؛ تعرض الأدوات التي حزمتها غير موجودة مطالبة تثبيت بدلاً من التشغيل.
- **إعادة ترميز الفيديو كحِمل روتيني.** لا بأس بعمليات الترميز العرضية (هي بطيئة فحسب)؛ أما طابور ترميز مستمر فيحتاج إلى أنوية CPU، لا إلى Pi.
- **الأدوات غير المستخدمة عموماً.** يمكن للمسؤول إيقاف أدوات فردية من الإعدادات، فتُزال من الواجهة وتتوقف عن تسجيل مسارات API الخاصة بها. لا يوفر ذلك ذاكرة بحد ذاته، لكنه يمنع استخدام نسخة صغيرة مشتركة في الحِمل الوحيد الذي لا يتحمله العتاد.

إذا نقلت النسخة لاحقاً إلى عتاد أكبر، فأزل الحدود (أعدها إلى `0`) وستنتقل وحدة تخزين البيانات نفسها معك.