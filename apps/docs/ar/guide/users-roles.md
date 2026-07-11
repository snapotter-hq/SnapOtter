---
description: "إدارة المستخدمين، والأدوار المدمجة والمخصصة، والأذونات، ومفاتيح API، والفرق، والجلسات، وسجل التدقيق في SnapOtter."
i18n_source_hash: 5e28af686c96
i18n_provenance: human
i18n_output_hash: 2d5801eeb616
---

# المستخدمون والأدوار والأذونات {#users-roles-permissions}

يأتي SnapOtter مزوَّداً بثلاثة أدوار مدمجة، و17 إذناً دقيقاً، ودعم للأدوار المخصصة مع التحكم الاختياري في الوصول لكل أداة. تغطي هذه الصفحة نموذج التفويض الكامل، وتحديد نطاق مفاتيح API، وإدارة الفرق، وتسجيل التدقيق.

::: tip صفحات ذات صلة
[OIDC / SSO](/ar/guide/oidc) | [SAML SSO](/ar/guide/saml) | [توفير SCIM](/ar/guide/scim) | [الأمان والتحصين](/ar/guide/security)
:::

## المستخدمون {#users}

### إنشاء المستخدمين {#creating-users}

يمكن للمسؤولين إنشاء المستخدمين عبر لوحة الإدارة أو نقطة النهاية `POST /api/auth/register`. لكل مستخدم اسم مستخدم ودور وتعيين فريق وعنوان بريد إلكتروني اختياري.

### المسؤول الافتراضي {#default-admin}

عند أول بدء تشغيل، يُنشئ SnapOtter حساب مسؤول افتراضياً. تأتي بيانات الاعتماد من متغيرات البيئة:

| المتغير | الافتراضي | الوصف |
|---|---|---|
| `DEFAULT_USERNAME` | `admin` | اسم المستخدم لحساب المسؤول الأولي |
| `DEFAULT_PASSWORD` | `admin` | كلمة المرور لحساب المسؤول الأولي |

يُطلب من المسؤول الافتراضي تغيير كلمة مروره عند أول تسجيل دخول.

### مزودو المصادقة {#authentication-providers}

يمكن للمستخدمين المصادقة عبر عدة طرق:

- **محلي** - اسم مستخدم وكلمة مرور مُخزَّنان في قاعدة بيانات SnapOtter
- **OIDC** - أي مزود OpenID Connect (انظر [OIDC / SSO](/ar/guide/oidc))
- **SAML** - مزودو هوية SAML 2.0 (انظر [SAML SSO](/ar/guide/saml))
- **SCIM** - توفير آلي من مزود هوية (انظر [توفير SCIM](/ar/guide/scim))

### تعطيل المصادقة {#disabling-authentication}

اضبط `AUTH_ENABLED=false` لتعطيل المصادقة بالكامل. في هذا الوضع، يُستخدَم مستخدم مجهول اصطناعي بدور `admin` لجميع الطلبات. لا يلزم تسجيل الدخول.

::: warning 
يمنح تعطيل المصادقة وصول المسؤول الكامل لأي شخص يمكنه الوصول إلى النسخة. استخدم هذا فقط في البيئات الموثوقة.
:::

## الأدوار المدمجة {#built-in-roles}

يتضمن SnapOtter ثلاثة أدوار مدمجة. لا يمكن تعديلها أو حذفها.

### المسؤول (Admin) {#admin}

جميع الأذونات الـ 17. تحكم كامل في النسخة.

`tools:use` `files:own` `files:all` `apikeys:own` `apikeys:all` `pipelines:own` `pipelines:all` `settings:read` `settings:write` `users:manage` `teams:manage` `features:manage` `system:health` `audit:read` `compliance:manage` `webhooks:manage` `security:manage`

### المحرر (Editor) {#editor}

7 أذونات. يمكنه استخدام جميع الأدوات وإدارة جميع الملفات وخطوط الأنابيب، لكن لا يمكنه الوصول إلى وظائف الإدارة.

`tools:use` `files:own` `files:all` `apikeys:own` `pipelines:own` `pipelines:all` `settings:read`

### المستخدم (User) {#user}

5 أذونات. يمكنه استخدام الأدوات وإدارة موارده الخاصة.

`tools:use` `files:own` `apikeys:own` `pipelines:own` `settings:read`

## مرجع الأذونات {#permissions-reference}

| الإذن | الوصف |
|---|---|
| `tools:use` | استخدام أي أداة معالجة |
| `files:own` | عرض وإدارة الملفات الخاصة |
| `files:all` | عرض وإدارة ملفات جميع المستخدمين |
| `apikeys:own` | إنشاء وإدارة مفاتيح API الخاصة |
| `apikeys:all` | عرض مفاتيح API لجميع المستخدمين |
| `pipelines:own` | إنشاء وإدارة خطوط الأنابيب الخاصة |
| `pipelines:all` | عرض وإدارة خطوط أنابيب جميع المستخدمين |
| `settings:read` | عرض إعدادات النسخة |
| `settings:write` | تعديل إعدادات النسخة |
| `users:manage` | إنشاء وتحديث وحذف حسابات المستخدمين |
| `teams:manage` | إنشاء وتحديث وحذف الفرق |
| `features:manage` | تثبيت وإدارة حزم ميزات الذكاء الاصطناعي |
| `system:health` | الوصول إلى نقاط نهاية الصحة والجاهزية |
| `audit:read` | عرض سجل التدقيق وسرد الأدوار |
| `compliance:manage` | إدارة دورة حياة GDPR وميزات الامتثال |
| `webhooks:manage` | تكوين خطافات الويب الصادرة |
| `security:manage` | إدارة إعدادات الأمان (قائمة IP المسموح بها، فرض SSO) |

## الأدوار المخصصة {#custom-roles}

يمكن للمسؤولين الذين يملكون إذن `security:manage` إنشاء أدوار مخصصة عبر لوحة الإدارة أو واجهة برمجة الأدوار. يتطلب سرد الأدوار `audit:read`.

### إنشاء دور مخصص {#creating-a-custom-role}

```bash
curl -X POST http://localhost:1349/api/v1/roles \
  -H "Authorization: Bearer si_..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "reviewer",
    "description": "Can use tools and view all files",
    "permissions": ["tools:use", "files:own", "files:all", "settings:read"]
  }'
```

يجب أن تكون أسماء الأدوار من 2 إلى 30 حرفاً، أحرف وأرقام صغيرة مع شرطات وشرطات سفلية.

### الأذونات المحجوزة للمسؤول {#admin-reserved-permissions}

ثلاثة أذونات محجوزة للأدوار المدمجة ولا يمكن تعيينها للأدوار المخصصة:

- `compliance:manage`
- `webhooks:manage`
- `security:manage`

ترفض واجهة برمجة الأدوار أي طلب يتضمن هذه الأذونات. فقط الدور المدمج `admin` لديه الوصول إليها.

### الأذونات على مستوى الأداة {#tool-level-permissions}

يمكن للأدوار المخصصة اختيارياً تقييد الأدوات التي يمكن للمستخدمين الوصول إليها. يتوفر وضعان:

| الوضع | السلوك | متطلب الترخيص |
|---|---|---|
| `category` | التقييد حسب النمط (صورة، فيديو، صوت، مستند، ملف) | لا شيء (مجاني) |
| `tool` | التقييد حسب معرّف الأداة الفردية | يتطلب ميزة `per_tool_permissions` للمؤسسات |

عند ضبط وضع `tool` لكن ميزة المؤسسات غير متاحة، يتراجع SnapOtter بلطف ويسمح بالوصول إلى جميع الأدوات.

```json
{
  "name": "image-only",
  "permissions": ["tools:use", "files:own"],
  "toolPermissions": {
    "mode": "category",
    "allowed": ["image"]
  }
}
```

### حذف دور مخصص {#deleting-a-custom-role}

عند حذف دور مخصص، يُعاد تعيين جميع المستخدمين المُخصَّصين له تلقائياً إلى الدور `user`.

## الفرق {#teams}

تُجمّع الفرق المستخدمين لإدارة التخزين والاحتفاظ. يُنشأ فريق `Default` عند أول بدء تشغيل.

| الحقل | النوع | الوصف |
|---|---|---|
| `name` | string | اسم فريق فريد (1-50 حرفاً) |
| `storageQuota` | number | حد تخزين لكل فريق بالبايت (يعمل دون المؤسسات) |
| `retentionHours` | number | حذف تلقائي للمخرجات بعد هذا العدد من الساعات (يتطلب `team_retention_overrides`، للمؤسسات) |
| `legalHold` | boolean | منع الحذف التلقائي لملفات أعضاء الفريق (يتطلب `legal_hold`، للمؤسسات) |

::: info 
لا يمكن حذف فريق `Default`. لا يمكن حذف الفرق التي لا تزال بها أعضاء. أعِد تعيين الأعضاء أولاً.
:::

## مفاتيح API {#api-keys}

يمكن للمستخدمين توليد مفاتيح API للوصول البرمجي. يستخدم كل مفتاح البادئة `si_` ويُعرَض مرة واحدة فقط وقت الإنشاء.

### الأذونات ذات النطاق {#scoped-permissions}

يمكن لمفاتيح API اختيارياً حمل مصفوفة `permissions`. عند ضبطها، تكون الأذونات الفعّالة للطلب هي **تقاطع** أذونات دور المستخدم والأذونات ذات النطاق للمفتاح. يعني هذا أن مفتاح API لا يمكنه قط التصعيد بما يتجاوز أذونات المستخدم نفسه.

```bash
curl -X POST http://localhost:1349/api/v1/api-keys \
  -H "Authorization: Bearer si_..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "CI pipeline key",
    "permissions": ["tools:use", "files:own"],
    "expiresAt": "2027-01-01T00:00:00Z"
  }'
```

### انتهاء الصلاحية {#expiration}

تقبل المفاتيح طابعاً زمنياً اختيارياً `expiresAt`. تُرفض المفاتيح منتهية الصلاحية وقت المصادقة.

## سجل التدقيق {#audit-log}

يسجّل SnapOtter الأحداث ذات الصلة بالأمان في سجل تدقيق مُهيكَل مُخزَّن في جدول قاعدة البيانات `audit_log`.

### عرض سجل التدقيق {#viewing-the-audit-log}

```
GET /api/v1/audit-log?page=1&limit=50&action=LOGIN_FAILED&from=2026-01-01T00:00:00Z&to=2026-12-31T23:59:59Z
```

يتطلب الإذن `audit:read`. يدعم الترقيم (`page`، `limit`) والمرشحات (`action`، `ip`، `from`، `to`).

### تدقيق عمليات الأدوات {#tool-operation-auditing}

::: warning 
أحداث `TOOL_EXECUTED` **لا** تُسجَّل افتراضياً. هي اختيارية عبر أحد مسارين:

1. اضبط إعداد المسؤول `auditToolOperations` إلى `true`.
2. احمل ترخيصاً نشطاً بميزة `audit_export` (متاح على خطتي الفريق والمؤسسات).

دون أحد هذين، لا تُسجَّل عمليات تنفيذ الأدوات الفردية في سجل التدقيق.
:::

### التصدير {#exporting}

```
GET /api/v1/enterprise/audit/export?format=csv&from=2026-01-01T00:00:00Z
```

يتطلب الإذن `audit:read` وميزة `audit_export` للمؤسسات (متاحة على خطتي الفريق والمؤسسات). يدعم تنسيقي CSV وJSON، مُرشَّحاً حسب `action` و`actorId` و`targetType` و`targetId` و`from` و`to`.

### التوقيع المقاوم للتلاعب {#tamper-resistant-signing}

عند التمكين، يُوقَّع كل إدخال في سجل التدقيق بـ HMAC مُشتَق من `DATA_ENCRYPTION_KEY`. يتطلب هذا:

1. ضبط `DATA_ENCRYPTION_KEY` في بيئتك.
2. تمكين إعداد المسؤول `tamperResistantAudit`.
3. ترخيص مؤسسات بميزة `tamper_resistant_audit`.

### الاحتفاظ {#retention}

اضبط `AUDIT_RETENTION_DAYS` لتطهير الإدخالات القديمة تلقائياً. الافتراضي هو `0`، مما يعني الاحتفاظ بالإدخالات إلى أجل غير مسمى.

### مرجع الأحداث {#event-reference}

| الحدث | الفئة |
|---|---|
| `LOGIN_SUCCESS`، `LOGIN_FAILED` | المصادقة |
| `OIDC_LOGIN_SUCCESS`، `OIDC_LOGIN_FAILED` | المصادقة |
| `SAML_LOGIN_SUCCESS`، `SAML_LOGIN_FAILED` | المصادقة |
| `LOGOUT` | المصادقة |
| `USER_CREATED`، `USER_UPDATED`، `USER_DELETED` | إدارة المستخدمين |
| `PASSWORD_CHANGED`، `PASSWORD_RESET` | إدارة المستخدمين |
| `MFA_ENROLLED`، `MFA_DISABLED`، `MFA_VERIFIED`، `MFA_VERIFY_FAILED` | MFA |
| `MFA_CHALLENGE_ISSUED`، `MFA_RECOVERY_USED`، `MFA_RESET` | MFA |
| `ROLE_CREATED`، `ROLE_UPDATED`، `ROLE_DELETED` | الأدوار |
| `API_KEY_CREATED`، `API_KEY_DELETED` | مفاتيح API |
| `SETTINGS_UPDATED`، `IP_ALLOWLIST_UPDATED` | الإعدادات |
| `FILE_UPLOADED`، `FILE_DELETED` | الملفات |
| `TOOL_EXECUTED` | الأدوات (اختياري) |
| `SCIM_USER_PROVISIONED`، `SCIM_USER_UPDATED`، `SCIM_USER_DEPROVISIONED` | SCIM |
| `SCIM_GROUP_SYNCED` | SCIM |
| `LEGAL_HOLD_APPLIED`، `LEGAL_HOLD_RELEASED` | الامتثال |
| `GDPR_EXPORT_INITIATED`، `GDPR_USER_PURGED`، `GDPR_TEAM_PURGED` | الامتثال |
| `CONFIG_EXPORTED`، `CONFIG_IMPORTED` | التكوين |

## إدارة الجلسات {#session-management}

الجلسات مبنية على ملفات تعريف الارتباط، ويتحكم بها `SESSION_DURATION_HOURS` (الافتراضي: 168 ساعة / 7 أيام).

### تغييرات الأدوار تُبطل الجلسات {#role-changes-invalidate-sessions}

عندما يغيّر المسؤول دور مستخدم، تُحذف جميع جلسات ذلك المستخدم النشطة. يجب على المستخدم تسجيل الدخول مجدداً لاستلام أذوناته الجديدة.

### حراس السلامة {#safety-guards}

- **حماية آخر مسؤول**: لا يمكن خفض رتبة آخر مسؤول متبقٍّ إلى دور أدنى. تعيد واجهة API خطأً إن حاولت.
- **منع الحذف الذاتي**: لا يمكن للمسؤولين حذف حساباتهم الخاصة عبر واجهة API.
