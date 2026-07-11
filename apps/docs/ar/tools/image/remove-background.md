---
description: "إزالة الخلفية المدعومة بالذكاء الاصطناعي مع تأثيرات اختيارية (تمويه، ظل، تدرّج، خلفية مخصصة)."
i18n_source_hash: 326a91284529
i18n_provenance: human
i18n_output_hash: a3f56fd6f463
---

# إزالة الخلفية {#remove-background}

إزالة الخلفية المدعومة بالذكاء الاصطناعي مع تأثيرات اختيارية (تمويه، ظل، تدرّج، خلفية مخصصة).

## نقطة نهاية الـ API {#api-endpoint}

`POST /api/v1/tools/image/remove-background`

**المعالجة:** غير متزامنة (تُرجع 202، استعلم عن `/api/v1/jobs/{jobId}/progress` لمعرفة الحالة عبر SSE)

**حزمة النموذج:** `background-removal` (4-5 غيغابايت)

## المعاملات {#parameters}

| المعامل | النوع | مطلوب | القيمة الافتراضية | الوصف |
|-----------|------|----------|---------|-------------|
| file | file | نعم | - | ملف الصورة (متعدد الأجزاء) |
| model | string | لا | - | متغير نموذج الذكاء الاصطناعي المراد استخدامه |
| backgroundType | string | لا | `"transparent"` | أحد الخيارات: `transparent`، `color`، `gradient`، `blur`، `image` |
| backgroundColor | string | لا | - | لون hex للخلفية الصلبة |
| gradientColor1 | string | لا | - | لون التدرّج الأول |
| gradientColor2 | string | لا | - | لون التدرّج الثاني |
| gradientAngle | number | لا | - | زاوية التدرّج بالدرجات |
| blurEnabled | boolean | لا | - | تفعيل تأثير تمويه الخلفية |
| blurIntensity | number | لا | - | شدة التمويه (0-100) |
| shadowEnabled | boolean | لا | - | تفعيل الظل المُسقَط على الجسم |
| shadowOpacity | number | لا | - | تعتيم الظل (0-100) |
| outputFormat | string | لا | - | صيغة الإخراج: `png`، `webp`، أو `avif` |
| edgeRefine | integer | لا | - | مستوى تنقيح الحواف (0-3) |
| decontaminate | boolean | لا | - | إزالة تسرّب الألوان من الحواف |

## مثال على الطلب {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/remove-background \
  -F "file=@photo.jpg" \
  -F 'settings={"backgroundType":"transparent","edgeRefine":2,"outputFormat":"png"}'
```

## الاستجابة {#response}

### الاستجابة الأولية (202 Accepted) {#initial-response-202-accepted}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### التقدّم (SSE على `/api/v1/jobs/{jobId}/progress`) {#progress-sse-at-api-v1-jobs-jobid-progress}

```
event: progress
data: {"phase":"processing","stage":"Removing background...","percent":50}
```

### النتيجة النهائية (عبر SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/photo_mask.png",
    "maskUrl": "/api/v1/download/{jobId}/photo_mask.png",
    "originalUrl": "/api/v1/download/{jobId}/photo_original.png",
    "originalSize": 245000,
    "processedSize": 180000,
    "filename": "photo.jpg",
    "model": "rembg"
  }
}
```

## نقطة نهاية التأثيرات (المرحلة 2) {#effects-endpoint-phase-2}

`POST /api/v1/tools/image/remove-background/effects`

تُعيد تطبيق تأثيرات الخلفية دون إعادة تشغيل نموذج الذكاء الاصطناعي. تستخدم القناع والصورة الأصلية المخزّنين مؤقتًا من المرحلة 1.

### المعاملات {#parameters-1}

| المعامل | النوع | مطلوب | القيمة الافتراضية | الوصف |
|-----------|------|----------|---------|-------------|
| settings | JSON | نعم | - | JSON مع إعدادات التأثيرات (انظر أدناه) |
| backgroundImage | file | لا | - | صورة خلفية مخصصة (عندما يكون backgroundType هو `image`) |

#### حقول إعدادات JSON {#settings-json-fields}

| الحقل | النوع | مطلوب | الوصف |
|-------|------|----------|-------------|
| jobId | string | نعم | معرّف المهمة من المرحلة 1 |
| filename | string | نعم | اسم الملف الأصلي من المرحلة 1 |
| backgroundType | string | لا | `transparent`، `color`، `gradient`، `blur`، `image` |
| backgroundColor | string | لا | لون hex للخلفية الصلبة |
| gradientColor1 | string | لا | لون التدرّج الأول |
| gradientColor2 | string | لا | لون التدرّج الثاني |
| gradientAngle | number | لا | زاوية التدرّج بالدرجات |
| blurEnabled | boolean | لا | تفعيل تمويه الخلفية |
| blurIntensity | number | لا | شدة التمويه (0-100) |
| shadowEnabled | boolean | لا | تفعيل الظل المُسقَط |
| shadowOpacity | number | لا | تعتيم الظل (0-100) |
| outputFormat | string | لا | `png`، `webp`، أو `avif` |

### مثال على الطلب {#example-request-1}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/remove-background/effects \
  -F 'settings={"jobId":"a1b2c3d4-...","filename":"photo.jpg","backgroundType":"color","backgroundColor":"#FF5500","outputFormat":"png"}'
```

### الاستجابة (200 OK) {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/{jobId}/photo_nobg.png",
  "processedSize": 195000
}
```

## ملاحظات {#notes}

- يتطلب تثبيت حزمة النموذج `background-removal` (4-5 غيغابايت).
- تخزّن المرحلة 1 القناع الشفاف والصورة الأصلية مؤقتًا بحيث يمكن للمرحلة 2 (التأثيرات) إعادة تطبيق خلفيات مختلفة فورًا دون إعادة تشغيل نموذج الذكاء الاصطناعي.
- يدعم صيغ الإدخال HEIC/HEIF وRAW وTGA وPSD وEXR وHDR عبر فك الترميز التلقائي.
- يُصحَّح دوران EXIF تلقائيًا قبل المعالجة.
