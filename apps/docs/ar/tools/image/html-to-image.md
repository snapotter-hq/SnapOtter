---
description: "التقاط صفحات الويب أو مقتطفات HTML كصور عالية الجودة مع محاكاة الأجهزة."
i18n_source_hash: 307493f63631
i18n_provenance: machine
i18n_output_hash: ebfe4b36eaff
i18n_hash_version: 2
---

# HTML إلى صورة {#html-to-image}

التقط عنوان URL لصفحة ويب أو محتوى HTML خام كصورة لقطة شاشة. يدعم محاكاة الأجهزة (سطح المكتب، الجهاز اللوحي، الهاتف المحمول)، والتقاط الصفحة الكاملة، وصيغ مخرجات متعددة.

## نقطة نهاية API {#api-endpoint}

`POST /api/v1/tools/image/html-to-image`

يقبل **جسم JSON** (وليس multipart). لا حاجة لرفع ملف.

## المعاملات {#parameters}

| المعامل | النوع | مطلوب | الافتراضي | الوصف |
|-----------|------|----------|---------|-------------|
| url | string | مشروط | - | عنوان URL للالتقاط (يجب أن يكون عنوان URL صالحاً) |
| html | string | مشروط | - | محتوى HTML خام للتصيير (1 إلى 5,000,000 حرف) |
| format | string | لا | `"png"` | صيغة المخرجات: `jpg`، `png`، `webp` |
| quality | number | لا | `90` | جودة المخرجات للصيغ ذات الفقدان (1 إلى 100) |
| fullPage | boolean | لا | `false` | التقاط الصفحة القابلة للتمرير بالكامل، وليس منفذ العرض فقط |
| devicePreset | string | لا | `"desktop"` | محاكاة الجهاز: `desktop`، `tablet`، `mobile`، `custom` |
| viewportWidth | number | لا | `1280` | عرض منفذ العرض المخصص بالبكسل (320 إلى 3840، يُستخدم عندما يكون devicePreset هو `custom`) |
| viewportHeight | number | لا | `720` | ارتفاع منفذ العرض المخصص بالبكسل (320 إلى 2160، يُستخدم عندما يكون devicePreset هو `custom`) |
| clientJobId | string | لا | - | معرّف المهمة الخاص بك، ليتسنى لك فتح تدفق التقدّم قبل وصول الاستجابة |

يجب توفير `url` أو `html`، لكن ليس كليهما.

### إعدادات الأجهزة المسبقة {#device-presets}

| الإعداد المسبق | العرض | الارتفاع | UA الجوال |
|--------|-------|--------|-----------|
| `desktop` | 1280 | 720 | لا |
| `tablet` | 768 | 1024 | لا |
| `mobile` | 375 | 812 | نعم |
| `custom` | (يحدده المستخدم) | (يحدده المستخدم) | لا |

## مثال على طلب {#example-request}

التقاط صفحة ويب:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/html-to-image \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com", "format": "png", "fullPage": true, "devicePreset": "desktop"}'
```

تصيير محتوى HTML:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/html-to-image \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"html": "<div style=\"padding: 20px; background: #f0f0f0;\"><h1>Hello</h1></div>", "format": "png"}'
```

## مثال على استجابة {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/screenshot.png",
  "originalSize": 0,
  "processedSize": 145000
}
```

### الصفحات البطيئة {#slow-pages}

يعمل الالتقاط كمهمة في قائمة الانتظار. الالتقاط الذي ينتهي ضمن نافذة الانتظار المتزامن يردّ بالرمز `200` مع النتيجة الموضحة أعلاه. أما الأبطأ فيردّ بالرمز `202` مع معرّف مهمة:

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true,
  "statusUrl": "/api/v1/jobs/a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "progressUrl": "/api/v1/jobs/a1b2c3d4-e5f6-7890-abcd-ef1234567890/progress"
}
```

تابع `progressUrl` (Server-Sent Events) حتى تكتمل المهمة. يحمل حدث الاكتمال كائن النتيجة نفسه الموجود في استجابة `200`. يمكنك إلغاء المهمة باستخدام `POST /api/v1/jobs/{jobId}/cancel`.

::: warning تغيّر بعد 2.3.0
حتى الإصدار 2.3.0 كانت نقطة النهاية هذه تُبقي الطلب مفتوحًا دائمًا حتى ينتهي الالتقاط ثم تردّ بالرمز `200`. السكربتات التي تعالج `200` فقط ينبغي أن تعالج `202` أيضًا.
:::

## ملاحظات {#notes}

- يتطلب تثبيت Chromium على الخادم. يُرجع HTTP 503 إذا لم تكن خدمة المتصفح متاحة.
- يتم التحقق من عناوين URL ضد هجمات SSRF (يتم حظر عناوين الشبكة الخاصة/الداخلية).
- نقطة النهاية هذه محدودة المعدل إلى 120 طلباً في الساعة.
- `originalSize` يكون دائماً 0 لأن هذه الأداة تولّد صوراً من عناوين URL/HTML.
- اسم ملف المخرجات هو `screenshot.<format>`.
- إذا استغرقت الصفحة وقتاً طويلاً في التحميل، يفشل الالتقاط مع HTTP 504 (مهلة البوابة).
- إذا تعطلت خدمة المتصفح مراراً، يتم تعطيلها مؤقتاً ويفشل الالتقاط مع HTTP 503 والرمز `BROWSER_CRASHED`.
- يُعاد تنفيذ الطلب مرة واحدة عند تعطل المتصفح (HTTP 503) قبل الإبلاغ عن الفشل، كغيره من مهام الصور في قائمة الانتظار. أما مهلة تحميل الصفحة فلا يُعاد تنفيذها.
- الالتقاط الذي ردّ بالفعل بالرمز `202` يُبلّغ عن الفشل في تدفق التقدّم الخاص به بدلاً من حالة HTTP.
