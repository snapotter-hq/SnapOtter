---
description: "مخطط قاعدة بيانات PostgreSQL، والجداول، وعمليات الترحيل، وإجراءات النسخ الاحتياطي في SnapOtter."
i18n_source_hash: a68264552836
i18n_provenance: machine
i18n_output_hash: 2ee3b1bee0e9
i18n_hash_version: 2
---

# قاعدة البيانات {#database}

يستخدم SnapOtter قاعدة بيانات PostgreSQL 17 مع [Drizzle ORM](https://orm.drizzle.team/) (pg-core / node-postgres) لاستمرارية البيانات. المخطط معرَّف في `apps/api/src/db/schema.ts`.

يُضبَط الاتصال عبر متغير البيئة `DATABASE_URL` (القيمة الافتراضية `postgres://snapotter:snapotter@postgres:5432/snapotter`). في Docker Compose، تخزّن حاوية Postgres بياناتها في وحدة التخزين المسماة `SnapOtter-pgdata`.

## الجداول {#tables}

### users {#users}

يخزّن حسابات المستخدمين. يُنشأ تلقائيًا عند التشغيل الأول من `DEFAULT_USERNAME` و `DEFAULT_PASSWORD`.

| العمود | النوع | ملاحظات |
|---|---|---|
| `id` | uuid | المفتاح الأساسي |
| `username` | varchar | فريد، مطلوب |
| `passwordHash` | varchar | تجزئة scrypt |
| `role` | varchar | `admin`، أو `editor`، أو `user` |
| `mustChangePassword` | boolean | علامة إعادة تعيين كلمة المرور القسرية |
| `createdAt` | timestamp | وقت الإنشاء |
| `updatedAt` | timestamp | وقت آخر تحديث |

### sessions {#sessions}

جلسات تسجيل الدخول النشطة. يربط كل صف رمز جلسة بمستخدم.

| العمود | النوع | ملاحظات |
|---|---|---|
| `id` | varchar | المفتاح الأساسي (رمز الجلسة) |
| `userId` | uuid | مفتاح خارجي إلى `users.id` |
| `expiresAt` | timestamp | وقت انتهاء الصلاحية |
| `createdAt` | timestamp | وقت الإنشاء |

### teams {#teams}

مجموعات لتنظيم المستخدمين. يمكن للمسؤولين إسناد المستخدمين إلى فرق.

| العمود | النوع | الوصف |
|--------|------|-------------|
| `id` | uuid | المفتاح الأساسي |
| `name` | varchar (فريد، بحد أقصى 50 حرفًا) | اسم الفريق |
| `createdAt` | timestamp | وقت الإنشاء |

### api_keys {#api-keys}

مفاتيح API للوصول البرمجي. يُعرَض المفتاح الخام مرة واحدة عند الإنشاء؛ ولا يُخزَّن سوى التجزئة (hash).

| العمود | النوع | ملاحظات |
|---|---|---|
| `id` | uuid | المفتاح الأساسي |
| `userId` | uuid | مفتاح خارجي إلى `users.id` |
| `keyHash` | varchar | تجزئة scrypt للمفتاح |
| `name` | varchar | تسمية يوفّرها المستخدم |
| `createdAt` | timestamp | وقت الإنشاء |
| `lastUsedAt` | timestamp | يُحدَّث عند كل طلب مصادَق عليه |

تُسبَق المفاتيح بـ `si_` متبوعًا بـ 96 حرفًا ست عشريًا (48 بايتًا عشوائيًا).

### pipelines {#pipelines}

سلاسل الأدوات المحفوظة التي ينشئها المستخدمون في الواجهة.

| العمود | النوع | ملاحظات |
|---|---|---|
| `id` | uuid | المفتاح الأساسي |
| `name` | varchar | اسم خط المعالجة |
| `description` | varchar | وصف اختياري |
| `steps` | jsonb | مصفوفة من كائنات `{ toolId, settings }` |
| `createdAt` | timestamp | وقت الإنشاء |

### user_files {#user-files}

مكتبة ملفات دائمة. يُدرَج التعديل المحفوظ افتراضيًا كصف جذري مستقل ("الحفظ كملف جديد": `version` يساوي 1، و`parentId` يساوي null، بحيث يظل الأصل مدرجًا)، أو كإصدار مرتبط بالأب عند الكتابة فوق الأصل (يُضبَط `parentId`، ويُزاد `version`، ليَحُلّ محل الأصل). يسجّل العمود `toolChain` الأدوات المطبَّقة.

| العمود | النوع | الوصف |
|--------|------|-------------|
| `id` | uuid | المفتاح الأساسي |
| `userId` | uuid | مفتاح خارجي إلى users (حذف متتالٍ CASCADE DELETE) |
| `originalName` | varchar | اسم ملف الرفع الأصلي |
| `storedName` | varchar | اسم الملف على القرص |
| `mimeType` | varchar | نوع MIME |
| `size` | integer | حجم الملف بالبايت |
| `width` | integer | عرض الصورة بالبكسل |
| `height` | integer | ارتفاع الصورة بالبكسل |
| `version` | integer | رقم الإصدار (1 = الأصل) |
| `parentId` | uuid أو null | مفتاح خارجي إلى user_files (الإصدار الأب) |
| `toolChain` | jsonb | معرّفات الأدوات المطبَّقة بالترتيب لإنتاج هذا الإصدار |
| `createdAt` | timestamp | وقت الإنشاء |

### jobs {#jobs}

يتتبّع مهام المعالجة لإعداد تقارير التقدم والتنظيف.

| العمود | النوع | ملاحظات |
|---|---|---|
| `id` | uuid | المفتاح الأساسي |
| `type` | varchar | معرّف الأداة أو خط المعالجة |
| `status` | varchar | `queued`، أو `processing`، أو `completed`، أو `failed` |
| `progress` | real | كسر من 0.0 إلى 1.0 |
| `inputFiles` | jsonb | مصفوفة من مسارات ملفات الإدخال |
| `outputPath` | varchar | مسار ملف النتيجة |
| `settings` | jsonb | إعدادات الأداة المستخدمة |
| `error` | varchar | رسالة الخطأ في حال الفشل |
| `createdAt` | timestamp | وقت الإنشاء |
| `completedAt` | timestamp | وقت الاكتمال |

### settings {#settings}

مخزن مفتاح-قيمة للإعدادات على مستوى الخادم التي يمكن للمسؤولين تغييرها من الواجهة.

| العمود | النوع | ملاحظات |
|---|---|---|
| `key` | varchar | المفتاح الأساسي |
| `value` | varchar | قيمة الإعداد |
| `updatedAt` | timestamp | وقت آخر تحديث |

### roles {#roles}

أدوار مخصّصة بصلاحيات دقيقة.

| العمود | النوع | ملاحظات |
|---|---|---|
| `id` | uuid | المفتاح الأساسي |
| `name` | varchar | اسم دور فريد |
| `description` | varchar | وصف اختياري |
| `permissions` | jsonb | مصفوفة من سلاسل الصلاحيات |
| `createdAt` | timestamp | وقت الإنشاء |

### audit_log {#audit-log}

سجل الإجراءات ذات الصلة بالأمان.

| العمود | النوع | ملاحظات |
|---|---|---|
| `id` | uuid | المفتاح الأساسي |
| `userId` | uuid | مفتاح خارجي إلى users |
| `action` | varchar | نوع الإجراء |
| `details` | jsonb | بيانات خاصة بالإجراء |
| `createdAt` | timestamp | وقت الإجراء |

### user_preferences {#user-preferences}

حالة الواجهة لكل مستخدم، مفهرسة باسم التفضيل. تخزن الأدوات المثبّتة في الصفحة الرئيسية، وتُكتب عبر `PUT /api/v1/preferences`.

| العمود | النوع | ملاحظات |
|---|---|---|
| `userId` | text | مفتاح خارجي إلى users، مع حذف متتالٍ. جزء من المفتاح الأساسي مع `key` |
| `key` | text | اسم التفضيل. جزء من المفتاح الأساسي مع `userId` |
| `value` | jsonb | محتوى التفضيل |
| `updatedAt` | timestamp | وقت آخر كتابة |

## عمليات الترحيل {#migrations}

يتولى Drizzle ترحيلات المخطط. تقع ملفات الترحيل في `apps/api/drizzle/`. أثناء التطوير:

```bash
cd apps/api
npx drizzle-kit generate   # generate a migration from schema changes
npx drizzle-kit migrate    # apply pending migrations
```

في بيئة الإنتاج، تُطبَّق عمليات الترحيل المعلَّقة تلقائيًا عند بدء التشغيل.

## النسخ الاحتياطي واستعادة {#backup-and-restore}

توجد قاعدة البيانات العلائقية في حجم `SnapOtter-pgdata` الخاص بحاوية Postgres، وليس في حجم `/data` الخاص بالتطبيق.

** النسخ الاحتياطي المنطقي مع التحقق من الصحة (مستحسن) **

```bash
# Dump into PostgreSQL's portable custom archive format
docker exec SnapOtter-postgres \
  pg_dump --format=custom --no-owner -U snapotter snapotter > snapotter.dump
test -s snapotter.dump
docker exec -i SnapOtter-postgres pg_restore --list < snapotter.dump >/dev/null

# Restore into a fresh/disposable target first and fail on the first SQL error
docker exec -i SnapOtter-postgres \
  pg_restore --exit-on-error --clean --if-exists --no-owner \
  -U snapotter -d snapotter < snapotter.dump
```

لا يحتوي تفريغ قاعدة البيانات على كائنات المكتبة المحفوظة في `/data/files` أو حالة BullMQ الدائمة في Redis. قم بعمل نسخة احتياطية من تلك العناصر واستعادتها باستخدام الإجراء المنسق في [الأمان والتقوية](/ar/guide/security#backup-and-recovery).

**لقطة من الحجم البارد**

```bash
# Stop every service first, then use your storage platform to snapshot the
# PostgreSQL, app-data, and Redis volumes as one crash-consistent set.
docker compose -f docker/docker-compose.yml stop
```

لا تقم بنسخ دليل بيانات PostgreSQL المباشر باستخدام `tar`. أنشئ أسماء وحدات التخزين البادئة حسب المشروع، لذا قم بحل معرفات وحدات التخزين المحملة من `docker inspect` أو منصة التخزين الخاصة بك بدلاً من افتراض التسمية الحرفية `SnapOtter-pgdata`.

### الترحيل من 1.x (SQLite) {#migrating-from-1-x-sqlite}

للترقية من SnapOtter 1.x دليل خاص بها: انظر [الترقية من 1.x إلى 2.0](./upgrading). باختصار، أعد استخدام وحدة تخزين `/data` الموجودة لديك، وسيكتشف الإصدار 2.0 تلقائيًا `/data/snapotter.db` ويستوردها عند التشغيل الأول (أو اضبط `SQLITE_MIGRATE_PATH` للإشارة إليها بشكل صريح). انسخ وحدة تخزين `/data` بأكملها احتياطيًا أولًا، وليس `snapotter.db` فقط: يستخدم الإصدار 1.x وضع SQLite WAL، لذا كثيرًا ما تترك الحاوية المتوقفة معظم بياناتها في `snapotter.db-wal` بجوار `snapotter.db` شبه الفارغ.
