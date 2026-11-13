---
description: "مخطط قاعدة بيانات PostgreSQL والجداول وعمليات الترحيل وإجراءات النسخ الاحتياطي في SnapOtter."
i18n_source_hash: 2150213f21da
i18n_provenance: machine
i18n_output_hash: 91226ffe5e79
i18n_hash_version: 2
---

# قاعدة البيانات {#database}

يستخدم SnapOtter قاعدة بيانات PostgreSQL 17 مع [Drizzle ORM](https://orm.drizzle.team/) (pg-core / node-postgres) لحفظ البيانات. يُعرَّف المخطط في `apps/api/src/db/schema.ts`.

يُضبط الاتصال عبر متغير البيئة `DATABASE_URL` (القيمة الافتراضية `postgres://snapotter:snapotter@postgres:5432/snapotter`). في Docker Compose تخزّن حاوية Postgres بياناتها في الوحدة المسماة `SnapOtter-pgdata`. تُخدَّم الطلبات بدور يستطيع قراءة الصفوف وكتابتها فقط، ويُشرح ذلك ضمن [الأدوار ذات الحد الأدنى من الصلاحيات](#least-privilege-roles) أدناه.

## الجداول {#tables}

### users {#users}

يخزّن حسابات المستخدمين. يُنشأ تلقائيًا عند أول تشغيل من `DEFAULT_USERNAME` و`DEFAULT_PASSWORD`.

| العمود | النوع | ملاحظات |
|---|---|---|
| `id` | uuid | المفتاح الأساسي |
| `username` | varchar | فريد، مطلوب |
| `passwordHash` | varchar | تجزئة scrypt |
| `role` | varchar | `admin` أو `editor` أو `user` |
| `mustChangePassword` | boolean | علامة إعادة تعيين كلمة المرور الإلزامية |
| `createdAt` | timestamp | وقت الإنشاء |
| `updatedAt` | timestamp | وقت آخر تحديث |

### sessions {#sessions}

جلسات تسجيل الدخول النشطة. يربط كل صف رمز جلسة بمستخدم.

| العمود | النوع | ملاحظات |
|---|---|---|
| `id` | varchar | المفتاح الأساسي (رمز الجلسة) |
| `userId` | uuid | مفتاح خارجي يشير إلى `users.id` |
| `expiresAt` | timestamp | وقت انتهاء الصلاحية |
| `createdAt` | timestamp | وقت الإنشاء |

### teams {#teams}

مجموعات لتنظيم المستخدمين. يستطيع المشرفون تعيين المستخدمين إلى الفرق.

| العمود | النوع | الوصف |
|--------|------|-------------|
| `id` | uuid | المفتاح الأساسي |
| `name` | varchar (فريد، بحد أقصى 50 حرفًا) | اسم الفريق |
| `createdAt` | timestamp | وقت الإنشاء |

### api_keys {#api-keys}

مفاتيح API للوصول البرمجي. يُعرض المفتاح الخام مرة واحدة عند الإنشاء، ولا تُخزَّن إلا تجزئته.

| العمود | النوع | ملاحظات |
|---|---|---|
| `id` | uuid | المفتاح الأساسي |
| `userId` | uuid | مفتاح خارجي يشير إلى `users.id` |
| `keyHash` | varchar | تجزئة scrypt للمفتاح |
| `name` | varchar | تسمية يحددها المستخدم |
| `createdAt` | timestamp | وقت الإنشاء |
| `lastUsedAt` | timestamp | يُحدَّث مع كل طلب موثَّق |

تبدأ المفاتيح بالبادئة `si_` يتبعها 96 حرفًا سداسيًا عشريًا (48 بايتًا عشوائيًا).

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

مكتبة الملفات الدائمة. يُدرج التعديل المحفوظ افتراضيًا كصف جذري مستقل ("حفظ كنسخة جديدة": `version` تساوي 1 و`parentId` فارغة، فيبقى الأصل ظاهرًا في القائمة)، أو كإصدار مرتبط بأصله عند الكتابة فوق الملف الأصلي (تُعيَّن `parentId` وتزداد `version`، فيحلّ محله). يسجّل العمود `toolChain` الأدوات المطبقة.

| العمود | النوع | الوصف |
|--------|------|-------------|
| `id` | uuid | المفتاح الأساسي |
| `userId` | uuid | مفتاح خارجي إلى users (حذف تتابعي) |
| `originalName` | varchar | اسم ملف الرفع الأصلي |
| `storedName` | varchar | اسم الملف على القرص |
| `mimeType` | varchar | نوع MIME |
| `size` | integer | حجم الملف بالبايت |
| `width` | integer | عرض الصورة بالبكسل |
| `height` | integer | ارتفاع الصورة بالبكسل |
| `version` | integer | رقم الإصدار (1 = الأصل) |
| `parentId` | uuid أو null | مفتاح خارجي إلى user_files (الإصدار الأب) |
| `toolChain` | jsonb | معرّفات الأدوات المطبقة بالترتيب لإنتاج هذا الإصدار |
| `createdAt` | timestamp | وقت الإنشاء |

### jobs {#jobs}

يتتبع مهام المعالجة لأغراض عرض التقدم والتنظيف.

| العمود | النوع | ملاحظات |
|---|---|---|
| `id` | uuid | المفتاح الأساسي |
| `type` | varchar | معرّف الأداة أو خط المعالجة |
| `status` | varchar | `queued` أو `processing` أو `completed` أو `failed` |
| `progress` | real | كسر من 0.0 إلى 1.0 |
| `inputFiles` | jsonb | مصفوفة بمسارات ملفات الإدخال |
| `outputPath` | varchar | مسار ملف النتيجة |
| `settings` | jsonb | إعدادات الأداة المستخدمة |
| `error` | varchar | رسالة الخطأ عند الفشل |
| `createdAt` | timestamp | وقت الإنشاء |
| `completedAt` | timestamp | وقت الاكتمال |

### settings {#settings}

مخزن مفتاح وقيمة لإعدادات الخادم العامة التي يستطيع المشرفون تغييرها من الواجهة.

| العمود | النوع | ملاحظات |
|---|---|---|
| `key` | varchar | المفتاح الأساسي |
| `value` | varchar | قيمة الإعداد |
| `updatedAt` | timestamp | وقت آخر تحديث |

### roles {#roles}

أدوار مخصصة بصلاحيات دقيقة.

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

حالة الواجهة لكل مستخدم، مفهرسة باسم التفضيل. تدعم الأدوات المثبتة في لوحة التحكم عبر `PUT /api/v1/preferences`.

| العمود | النوع | ملاحظات |
|---|---|---|
| `userId` | text | مفتاح خارجي إلى users، يُحذف تتابعيًا. مفتاح أساسي مع `key` |
| `key` | text | اسم التفضيل. مفتاح أساسي مع `userId` |
| `value` | jsonb | حمولة التفضيل |
| `updatedAt` | timestamp | وقت آخر كتابة |

## عمليات الترحيل {#migrations}

يتولى Drizzle ترحيلات المخطط. توجد ملفات الترحيل في `apps/api/drizzle/`. أثناء التطوير:

```bash
cd apps/api
npx drizzle-kit generate   # generate a migration from schema changes
npx drizzle-kit migrate    # apply pending migrations
```

في بيئة الإنتاج تُطبَّق الترحيلات المعلقة تلقائيًا عند بدء التشغيل.

## الأدوار ذات الحد الأدنى من الصلاحيات {#least-privilege-roles}

دوران، ولكل منهما مهمة. يخدم `DATABASE_URL` الطلبات ويملك `SELECT` و`INSERT` و`UPDATE` و`DELETE` على جداول التطبيق، إضافة إلى `USAGE` و`SELECT` على تسلسلاتها. هذه هي القائمة كاملة. فلا يستطيع إنشاء جدول أو حذفه، ولا تثبيت امتداد، ولا `TRUNCATE`، ولا قراءة `pg_authid`، ولا إنشاء قاعدة بيانات، ولا تعديل دور، ولا لمس المخطط `drizzle` الذي يوجد فيه سجل الترحيل.

أما `DATABASE_MIGRATION_URL` فهو الدور المميز. يشغّل الترحيلات ويمنح الصلاحيات لدور وقت التشغيل أثناء الإقلاع، ثم يُغلق قبل أن يُخدَّم أي طلب.

يصدر هذا الفصل مع SnapOtter 2.3.0. ابتداءً من ذلك الإصدار تُهيَّأ ملفات Compose الموجودة في المستودع والصورة الشاملة بهذه الطريقة، بما في ذلك عمليات التثبيت القائمة: عند الإقلاع ينشئ SnapOtter دور وقت التشغيل إن لم يكن موجودًا، ويمنحه الصلاحيات، ثم ينفّذ الترحيل، ثم يمرّر الصلاحيات إلى الجداول التي كانت موجودة من قبل. الترقية لا تتطلب أي SQL يدوي.

لا تقرأ صورة 2.2.0 إلا سلسلة اتصال وقت التشغيل ولا تنشئ الدور الثاني أبدًا، لذا إذا زوّدتها بالفصل فلن تعمل: يُظهر سجل التطبيق فشل مصادقة كلمة المرور لذلك الدور، ويُظهر سجل Postgres أن الدور غير موجود. حدّث الصورة إلى 2.3.0 أو أحدث قبل أن تحوّل ملف Compose إلى الفصل.

ترك `DATABASE_MIGRATION_URL` فارغًا يشغّل النظام بدور واحد، فيؤدي `DATABASE_URL` المهمتين معًا تمامًا كما كان قبل الفصل. هذا إعداد مدعوم وليس مهجورًا. وهو الحل المناسب مع Postgres المُدار، حيث لا يكون إنشاء الأدوار غالبًا من صلاحياتك.

### Postgres الخارجي والمُدار {#external-and-managed-postgres}

على RDS أو Supabase أو Cloud SQL أو أي عنقود تديره بنفسك، يكون الفصل اختياريًا. أنشئ دور وقت التشغيل مرة واحدة:

```sql
CREATE ROLE snapotter_app LOGIN PASSWORD 'choose-a-strong-password'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
```

ثم زوّد SnapOtter بسلسلتي الاتصال معًا، تشيران إلى المضيف والمنفذ وقاعدة البيانات نفسها:

```bash
DATABASE_URL=postgres://snapotter_app:choose-a-strong-password@db.example.com:5432/snapotter
DATABASE_MIGRATION_URL=postgres://snapotter:the-owner-password@db.example.com:5432/snapotter
```

توقف عند هذا الحد. يطبّق SnapOtter الصلاحيات بنفسه ويعيد تطبيقها بعد كل ترحيل، فيشمل ذلك أي جدول يضيفه إصدار مستقبلي دون أن يشغّل أحد SQL من أجله.

يجب أن يمتلك الدور في `DATABASE_MIGRATION_URL` جداول SnapOtter، لأن مالك الجدول وحده يستطيع المنح عليه. في عملية تثبيت قائمة يعني ذلك الدور الذي كنت تشغّل SnapOtter به، وليس دورًا جديدًا أُنشئ لهذا الغرض. إذا وجّهته إلى دور جديد لا يملك شيئًا فسيفشل الإقلاع بخطأ ينصّ على هذا تحديدًا. كما يحتاج إلى `CREATEROLE` لإنشاء دور وقت التشغيل وصيانته، وإلى حق إنشاء المخطط `drizzle`.

إذا سمّيت الدور نفسه في العنوانين فإن الفصل يتعطل، ويذكر SnapOtter ذلك في السجل بدل التظاهر بغيره. وإذا لم يوفر لك مزوّدك دورًا يستطيع امتلاك الجداول وحمل `CREATEROLE` معًا، فشغّل بدور واحد.

### لماذا لا تُمس صلاحية المستخدم المميز {#why-the-superuser-bit-is-left-alone}

لا ينزع SnapOtter `SUPERUSER` من أي دور من تلقاء نفسه. في عملية تثبيت أُنشئت قبل الفصل يكون `snapotter` هو المستخدم المميز الوحيد في العنقود، وخفض صلاحيته سيترك العنقود بلا أي مستخدم مميز، ولا يمكن استرداده إلا عبر وضع المستخدم الواحد والخادم متوقف. بدلًا من ذلك تأتي الحماية من نقل الاتصال طويل الأمد إلى الدور المقيّد. يكون المستخدم المميز على السلك لثوانٍ معدودة أثناء الإقلاع ثم يختفي.

عمليات التثبيت الشاملة الجديدة لا تواجه هذه المشكلة. تحصل على ثلاثة أدوار: `postgres` (المستخدم المميز للتهيئة، غائب عن كل سلاسل الاتصال التي يستخدمها SnapOtter)، و`snapotter` (`NOSUPERUSER`، يملك البيانات ولا يتصل إلا أثناء الإقلاع)، و`snapotter_app` (صفوف فقط، يخدم الطلبات).

لخفض صلاحية `snapotter` أقدم رغم ذلك، أنشئ مستخدمًا مميزًا ثانيًا أولًا وسجّل الدخول به للتأكد من أنه يعمل. ثم `ALTER ROLE snapotter NOSUPERUSER`.

## النسخ الاحتياطي والاستعادة {#backup-and-restore}

توجد قاعدة البيانات العلائقية في وحدة `SnapOtter-pgdata` التابعة لحاوية Postgres، وليس في وحدة `/data` التابعة للتطبيق.

**نسخة احتياطية منطقية مع تحقق (موصى بها)**

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

يتصل الأمران كلاهما بصفة `snapotter`، وهو المالك، وينبغي أن يستمرا على ذلك. لا يرى دور وقت التشغيل المخطط `drizzle`، فيخرج التفريغ المأخوذ بذلك الدور ناقصًا. يترك `--no-owner` الكائنات المستعادة مملوكة لمن يشغّل الاستعادة، فتشغيلها بصفة المالك يضع الملكية حيث تتوقعها الصلاحيات. ملاحظة واحدة على عنقود جديد: `pg_dump` يحمل الصلاحيات لكنه لا يحمل الأدوار التي تسميها، لذا أنشئ `snapotter_app` قبل الاستعادة وإلا توقف `--exit-on-error` عند أول `GRANT`. يعيد SnapOtter تطبيق الصلاحيات عند إقلاعه التالي في كل الأحوال.

لا يحتوي تفريغ قاعدة البيانات هذا على كائنات المكتبة المحفوظة في `/data/files` ولا على حالة BullMQ الدائمة في Redis. انسخ هذه احتياطيًا واستعدها بالإجراء المنسّق الموضح في [الأمان والتحصين](/ar/guide/security#backup-and-recovery).

**لقطة وحدة تخزين باردة**

```bash
# Stop every service first, then use your storage platform to snapshot the
# PostgreSQL, app-data, and Redis volumes as one crash-consistent set.
docker compose -f docker/docker-compose.yml stop
```

لا تنسخ دليل بيانات PostgreSQL وهو قيد التشغيل باستخدام `tar`. يضيف Compose بادئة المشروع إلى أسماء الوحدات، لذا استخرج معرّفات الوحدات المركّبة من `docker inspect` أو من منصة التخزين لديك بدل افتراض التسمية الحرفية `SnapOtter-pgdata`.

### الترحيل من 1.x (SQLite) {#migrating-from-1-x-sqlite}

للترقية من SnapOtter 1.x دليل خاص: راجع [الترقية من 1.x إلى 2.0](./upgrading). باختصار، أعد استخدام وحدة `/data` القائمة وسيكتشف 2.0 الملف `/data/snapotter.db` ويستورده تلقائيًا عند أول إقلاع (أو عيّن `SQLITE_MIGRATE_PATH` للإشارة إليه صراحةً). انسخ احتياطيًا وحدة `/data` بأكملها أولًا، وليس `snapotter.db` وحده: يستخدم 1.x وضع SQLite WAL، لذا غالبًا ما تترك الحاوية المتوقفة معظم بياناتها في `snapotter.db-wal` بجوار `snapotter.db` شبه فارغ.