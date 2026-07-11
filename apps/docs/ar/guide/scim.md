---
description: "إعداد توفير SCIM 2.0 لمزامنة المستخدمين والمجموعات من موفّر الهوية لديك إلى SnapOtter. يغطي Okta وAzure AD / Entra ID والتكاملات المخصّصة."
i18n_source_hash: bbd50119ec12
i18n_provenance: human
i18n_output_hash: 34bda4e59c79
---

# توفير SCIM {#scim-provisioning}

يطبّق SnapOtter معيار SCIM 2.0 (نظام إدارة الهوية عبر النطاقات) للتوفير الآلي للمستخدمين والمجموعات. يمكن لموفّر الهوية لديك إنشاء حسابات المستخدمين وتحديثها وتعطيلها وإعادة تنشيطها ومزامنة عضويات المجموعات تلقائياً.

::: tip ميزة للمؤسسات
يتطلّب توفير SCIM ترخيص **enterprise** مع ميزة `scim`. وهو غير متاح في خطة الفريق. وبدون هذه الميزة، تُعيد جميع نقاط نهاية SCIM (باستثناء الاكتشاف) رمز الحالة 403.
:::

## المتطلبات المسبقة {#prerequisites}

- مثيل SnapOtter قيد التشغيل يمكن الوصول إليه عبر عنوان URL عام
- مفتاح ترخيص enterprise مع ميزة `scim`
- وصول المسؤول إلى SnapOtter (يلزم الإذن `users:manage` لإنشاء رمز SCIM أو إبطاله)
- وصول المسؤول إلى إعدادات التوفير لدى موفّر الهوية

## بداية سريعة {#quick-start}

1. أنشئ رمز حامل SCIM:

```bash
curl -X POST https://photos.example.com/api/v1/enterprise/scim/token \
  -H "Cookie: snapotter-session=YOUR_SESSION" \
  -H "Content-Type: application/json"
```

تحتوي الاستجابة على الرمز. احفظه فوراً؛ لا يمكن استرجاعه مرة أخرى.

```json
{
  "token": "a1b2c3d4e5f6...",
  "message": "Save this token - it cannot be retrieved again"
}
```

2. في موفّر الهوية لديك، اضبط توفير SCIM باستخدام:
   - **عنوان URL الأساسي**: `https://photos.example.com/api/v1/scim/v2`
   - **المصادقة**: رمز حامل (الصق الرمز من الخطوة 1)

## المصادقة {#authentication}

تستخدم نقاط نهاية SCIM رمز حامل مخصّصاً، منفصلاً عن جلسات المستخدمين ومفاتيح API.

### إنشاء رمز {#generating-a-token}

يُنشئ `POST /api/v1/enterprise/scim/token` رمز SCIM جديداً. تتطلّب نقطة النهاية هذه جلسة صالحة مع الإذن `users:manage`.

يُعاد الرمز بنصّ صريح مرة واحدة فقط. يخزّن SnapOtter تجزئة scrypt فقط. إذا فقدت الرمز، فأبطِله وأنشئ رمزاً جديداً.

لا يكون سوى رمز SCIM واحد نشطاً في كل مرة. يؤدّي إنشاء رمز جديد إلى استبدال الرمز السابق.

### إبطال رمز {#revoking-a-token}

يبطل `DELETE /api/v1/enterprise/scim/token` رمز SCIM الحالي. تتطلّب نقطة النهاية هذه أيضاً `users:manage`.

### تحديد المعدّل {#rate-limiting}

تُقيّد نقاط نهاية SCIM بمعدّل 1000 طلب في الدقيقة لكل رمز. يؤدّي تجاوز هذا الحدّ إلى إعادة رمز الحالة HTTP 429.

## الموارد المدعومة {#supported-resources}

| مورد SCIM | مفهوم SnapOtter | إنشاء | قراءة | تحديث | حذف |
|---|---|---|---|---|---|
| المستخدم | حساب المستخدم | نعم | نعم | نعم | حذف مبدئي |
| المجموعة | الفريق | نعم | نعم | نعم | نعم |

::: warning 
تُطابَق مجموعات SCIM مع **فرق** SnapOtter، لا مع الأدوار. لا يستطيع SCIM ضبط دور المستخدم. يُخصَّص جميع المستخدمين المنشأين عبر SCIM للدور `user`. لتغيير دور المستخدم، استخدم واجهة مسؤول SnapOtter.
:::

## عمليات المستخدم {#user-operations}

### إنشاء مستخدم {#create-user}

`POST /api/v1/scim/v2/Users`

يُنشئ حساب مستخدم جديداً مع ضبط `authProvider` على `scim` والدور `user`. يُخصَّص المستخدم للفريق الافتراضي. إذا كان `active` يساوي `false`، فيُضبَط الدور على `disabled` بدلاً من ذلك.

السمات المطلوبة: `userName`. الاختيارية: `externalId` و`emails` و`active` (القيمة الافتراضية `true`).

### سرد المستخدمين وتصفيتهم {#list-and-filter-users}

`GET /api/v1/scim/v2/Users`

يُعيد قائمة مصفّحة بالمستخدمين. يدعم معاملَي الاستعلام `startIndex` و`count` (بحدّ أقصى 200 نتيجة لكل صفحة).

تدعم التصفية `eq` (يساوي) فقط، على هذه السمات:

- `userName eq "jane"`
- `externalId eq "ext-12345"`

تُعيد عوامل التصفية والسمات الأخرى رمز الحالة HTTP 400.

### جلب مستخدم {#get-user}

`GET /api/v1/scim/v2/Users/:id`

يُعيد مستخدماً واحداً بحسب معرّف مستخدم SnapOtter الخاص به.

### استبدال مستخدم {#replace-user}

`PUT /api/v1/scim/v2/Users/:id`

يستبدل سمات المستخدم. يدعم `userName` و`externalId` و`emails` و`active`. تُفحَص تغييرات اسم المستخدم بحثاً عن التعارضات (409 إذا كان اسم المستخدم الجديد مأخوذاً من قِبل مستخدم آخر).

### تصحيح مستخدم {#patch-user}

`PATCH /api/v1/scim/v2/Users/:id`

تحديث جزئي باستخدام SCIM PatchOp. العمليات المدعومة:

| العملية | المسارات |
|---|---|
| `replace` | `active` و`userName` و`externalId` و`emails` و`emails[type eq "work"].value` و`name.formatted` و`displayName` |
| `add` | نفس `replace` |
| `remove` | `externalId` و`emails` |

يُقبَل المساران `name.formatted` و`displayName` لأغراض التوافق لكن ليس لهما أثر دائم (لا يخزّن SnapOtter اسم عرض منفصلاً).

تُدعَم أيضاً عمليات `replace` عديمة القيمة (حيث تكون القيمة كائناً بلا `path`)، بالمفاتيح `userName` و`externalId` و`emails` و`active`.

### تعطيل مستخدم (حذف مبدئي) {#deactivate-user-soft-delete}

`DELETE /api/v1/scim/v2/Users/:id`

لا يحذف SnapOtter المستخدمين حذفاً نهائياً عبر SCIM. بدلاً من ذلك، تنفّذ عملية DELETE تعطيلاً مبدئياً:

1. يُغيَّر دور المستخدم من قيمته الحالية (مثل `editor`) إلى `disabled:editor`، مع الحفاظ على الدور الأصلي.
2. تُمحى كلمة مرور المستخدم.
3. تُلغى جميع الجلسات النشطة.
4. تُلغى جميع مفاتيح API.

لم يعُد بإمكان المستخدم تسجيل الدخول أو استخدام أي مفاتيح API. تُحفَظ بياناته (الملفات والسجل).

### إعادة تنشيط مستخدم {#reactivate-user}

لإعادة تنشيط مستخدم مُعطَّل سابقاً، أرسِل طلب `PUT` أو `PATCH` مع `active: true`. يستعيد SnapOtter الدور الأصلي من قبل التعطيل (مثلاً يعود `disabled:editor` إلى `editor` مرة أخرى). إذا تعذّر تحديد الدور الأصلي، فيُستخدَم `user` كبديل.

::: details مثال: التعطيل وإعادة التنشيط عبر PATCH
```json
// Deactivate
{
  "schemas": ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
  "Operations": [
    { "op": "replace", "path": "active", "value": false }
  ]
}

// Reactivate
{
  "schemas": ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
  "Operations": [
    { "op": "replace", "path": "active", "value": true }
  ]
}
```
:::

## عمليات المجموعة {#group-operations}

تُطابَق مجموعات SCIM مع فرق SnapOtter. يؤدّي إنشاء مجموعة إلى إنشاء فريق. تتحكّم عضوية المجموعة في الفريق الذي ينتمي إليه المستخدم.

### إنشاء مجموعة {#create-group}

`POST /api/v1/scim/v2/Groups`

مطلوب: `displayName`. اختياري: `members` (مصفوفة من `{ value: userId }`).

### سرد المجموعات وتصفيتها {#list-and-filter-groups}

`GET /api/v1/scim/v2/Groups`

تدعم التصفية `displayName eq "..."` فقط. مصفّحة بـ`startIndex` و`count` (بحدّ أقصى 200 نتيجة لكل صفحة).

### جلب مجموعة {#get-group}

`GET /api/v1/scim/v2/Groups/:id`

### استبدال مجموعة {#replace-group}

`PUT /api/v1/scim/v2/Groups/:id`

يستبدل اسم المجموعة وقائمة العضوية الكاملة. يُنقَل الأعضاء الحاليون غير الموجودين في القائمة الجديدة إلى الفريق الافتراضي.

### تصحيح مجموعة {#patch-group}

`PATCH /api/v1/scim/v2/Groups/:id`

يدعم هذه العمليات:

| العملية | المسار | الأثر |
|---|---|---|
| `add` | `members` | يضيف المستخدمين إلى الفريق |
| `remove` | `members[value eq "userId"]` | ينقل المستخدم إلى الفريق الافتراضي |
| `replace` | `displayName` | يعيد تسمية الفريق |
| `replace` | `members` | يستبدل جميع الأعضاء (يُنقَل الأعضاء المزالون إلى الفريق الافتراضي) |

### حذف مجموعة {#delete-group}

`DELETE /api/v1/scim/v2/Groups/:id`

يحذف الفريق. يُنقَل جميع أعضاء الفريق المحذوف إلى الفريق الافتراضي. لا يُعطَّل المستخدمون ولا يُحذفون.

## إعداد موفّر الهوية {#idp-setup}

### Okta {#okta}

1. في وحدة تحكّم مسؤول Okta، افتح تطبيق SnapOtter لديك (أو أنشئ واحداً).
2. انتقل إلى علامة التبويب **Provisioning** وانقر على **Configure API Integration**.
3. حدّد **Enable API Integration** وأدخِل:
   - **عنوان URL الأساسي**: `https://photos.example.com/api/v1/scim/v2`
   - **رمز API**: رمز حامل SCIM المُنشأ أعلاه
4. انقر على **Test API Credentials** ثم **Save**.
5. تحت **Provisioning > To App**، فعّل:
   - **Create Users**
   - **Update User Attributes**
   - **Deactivate Users**
6. تحت **Push Groups**، اضبط أي مجموعات Okta ستُزامَن كفرق SnapOtter.

### Azure AD / Entra ID {#azure-ad-entra-id}

1. في بوابة Azure، انتقل إلى تطبيق SnapOtter للمؤسسات لديك.
2. انتقل إلى **Provisioning** واضبط **Provisioning Mode** على **Automatic**.
3. تحت **Admin Credentials**، أدخِل:
   - **Tenant URL**: `https://photos.example.com/api/v1/scim/v2`
   - **Secret Token**: رمز حامل SCIM المُنشأ أعلاه
4. انقر على **Test Connection** ثم **Save**.
5. تحت **Mappings**، اضبط تعيينات سمات المستخدم والمجموعة. عادةً ما تعمل الإعدادات الافتراضية، لكن تأكّد من أن `userName` يُطابَق مع `userPrincipalName` أو `mail` حسب رغبتك.
6. اضبط **Provisioning Status** على **On** واحفظ.

يوفّر Azure المستخدمين والمجموعات على دورة مزامنة ثابتة (عادةً كل 40 دقيقة).

## نقاط نهاية الاكتشاف {#discovery-endpoints}

تتوفّر نقاط النهاية الثلاث هذه دون مصادقة وتصف قدرات خادم SCIM:

| نقطة النهاية | الوصف |
|---|---|
| `GET /api/v1/scim/v2/ServiceProviderConfig` | قدرات الخادم والميزات المدعومة |
| `GET /api/v1/scim/v2/Schemas` | تعريفات مخطّط المستخدم والمجموعة |
| `GET /api/v1/scim/v2/ResourceTypes` | أنواع الموارد المتاحة (User وGroup) |

يُعلن `ServiceProviderConfig` عن هذه القدرات:

| الميزة | مدعومة |
|---|---|
| Patch | نعم |
| Bulk | لا |
| Filter | نعم (بحدّ أقصى 200 نتيجة، والعامل `eq` فقط) |
| تغيير كلمة المرور | لا |
| Sort | لا |
| ETag | لا |

## القيود {#limitations}

- **التصفية**: يُدعَم العامل `eq` فقط. أما عوامل التصفية المركّبة وعاملا `and`/`or` و`co` (يحتوي) و`sw` (يبدأ بـ) فهي غير مطبَّقة.
- **العمليات المجمّعة**: غير مدعومة.
- **Sort وETag**: غير مدعومين.
- **الأدوار**: لا يستطيع SCIM تعيين أدوار SnapOtter. يحصل جميع المستخدمين المُوفَّرين على الدور `user`.
- **MAX_USERS**: لا يُفرَض حدّ متغيّر البيئة `MAX_USERS` على إنشاء مستخدم SCIM. إذا احتجت إلى تحديد سقف لأعداد المستخدمين، فأدِر التعيينات في موفّر الهوية لديك.
- **رمز واحد**: لا يمكن أن يكون سوى رمز SCIM واحد نشطاً في كل مرة. إذا احتاج عدة موفّري هوية إلى وصول SCIM، فعليهم مشاركة الرمز.
- **المجموعات هي فرق**: تقابل مجموعات SCIM الفرق، لا الأدوار أو مجموعات الأذونات.

## استكشاف الأخطاء وإصلاحها {#troubleshooting}

### 403 "SCIM provisioning requires an enterprise license with the scim feature" {#_403-scim-provisioning-requires-an-enterprise-license-with-the-scim-feature}

ترخيصك لا يتضمّن ميزة `scim`، أو لا يوجد ترخيص مضبوط. يتطلّب SCIM ترخيص خطة enterprise. تأكّد من ضبط `SNAPOTTER_LICENSE_KEY` ومن أن الترخيص يتضمّن ميزة `scim`.

### 401 "Bearer token required" {#_401-bearer-token-required}

لم يتضمّن طلب SCIM ترويسة `Authorization: Bearer <token>`. تحقّق من إعداد التوفير لدى موفّر الهوية.

### 401 "Invalid token" {#_401-invalid-token}

لا يطابق الرمز التجزئة المخزّنة. يحدث هذا إذا أُبطِل الرمز وأُعيد إنشاؤه. حدّث الرمز في إعدادات التوفير لدى موفّر الهوية.

### 401 "SCIM not configured" {#_401-scim-not-configured}

لم يُنشأ أي رمز SCIM بعد. استخدم نقطة النهاية `POST /api/v1/enterprise/scim/token` لإنشاء واحد.

### 409 "User already exists" / "userName already taken" {#_409-user-already-exists-username-already-taken}

يوجد مستخدم بنفس اسم المستخدم بالفعل. يمكن أن يحدث هذا عندما يعيد موفّر الهوية محاولة إنشاء فاشل. تحقّق من أسماء المستخدمين المكرّرة في لوحة مسؤول SnapOtter.

### 429 "SCIM rate limit exceeded" {#_429-scim-rate-limit-exceeded}

يرسل موفّر الهوية أكثر من 1000 طلب في الدقيقة. يحدث هذا عادةً أثناء المزامنة الأولية الكبيرة. تعيد معظم موفّري الهوية المحاولة تلقائياً بعد إعادة ضبط نافذة تحديد المعدّل. إذا استمرّت المشكلة، فتحقّق من فاصل مزامنة التوفير لدى موفّر الهوية.

### أُلغي توفير المستخدمين لكن لم يُزالوا من الواجهة {#users-deprovisioned-but-not-removed-from-the-ui}

عملية SCIM DELETE هي تعطيل مبدئي. يظلّ المستخدمون المُعطَّلون يظهرون في قائمة مستخدمي المسؤول بحالة معطّلة. هذا مقصود بالتصميم للحفاظ على بياناتهم. يظهر دورهم بوصفه `disabled:<original-role>`.
