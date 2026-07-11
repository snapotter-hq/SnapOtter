---
description: "تحسين تلقائي بنقرة واحدة يحلّل الصورة ويصحّح التعرّض والتباين وتوازن الأبيض والتشبّع والحدة."
i18n_source_hash: 42b6ab956f91
i18n_provenance: human
i18n_output_hash: ce9f6d93e33c
---

# تحسين الصورة {#image-enhancement}

تحسين تلقائي بنقرة واحدة مع تحليل ذكي. يحلّل الصورة ويطبّق تصحيحات التعرّض والتباين وتوازن الأبيض والتشبّع والحدة وإزالة التشويش.

## نقطة نهاية API {#api-endpoint}

`POST /api/v1/tools/image/image-enhancement`

**المعالجة:** متزامنة (تستخدم مصنع `createToolRoute`، تُرجع النتيجة مباشرة)

**حزمة النموذج:** لا شيء مطلوب للتحسين الأساسي. تُستخدم حزمة `upscale-enhance` (5-6 جيجابايت) فقط عند تفعيل `deepEnhance` (لإزالة التشويش بالذكاء الاصطناعي عبر SCUNet).

## المعاملات {#parameters}

| المعامل | النوع | مطلوب | الافتراضي | الوصف |
|-----------|------|----------|---------|-------------|
| file | file | نعم | - | ملف الصورة (multipart) |
| mode | string | لا | `"auto"` | وضع التحسين: `auto`، `portrait`، `landscape`، `low-light`، `food`، `document` |
| intensity | number | لا | `50` | شدة التحسين الإجمالية (0-100) |
| corrections | object | لا | جميعها `true` | التصحيحات الانتقائية للتطبيق (انظر أدناه) |
| deepEnhance | boolean | لا | `false` | تفعيل إزالة التشويش المدعومة بالذكاء الاصطناعي (يتطلب تثبيت أداة `noise-removal`) |

### كائن التصحيحات {#corrections-object}

| الحقل | النوع | الافتراضي | الوصف |
|-------|------|---------|-------------|
| exposure | boolean | `true` | تصحيح التعرّض تلقائياً |
| contrast | boolean | `true` | تصحيح التباين تلقائياً |
| whiteBalance | boolean | `true` | تصحيح توازن الأبيض تلقائياً |
| saturation | boolean | `true` | تصحيح التشبّع تلقائياً |
| sharpness | boolean | `true` | زيادة الحدة تلقائياً |
| denoise | boolean | `true` | إزالة تشويش خفيفة |

## مثال على طلب {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-enhancement \
  -F "file=@photo.jpg" \
  -F 'settings={"mode":"portrait","intensity":70,"corrections":{"exposure":true,"contrast":true,"sharpness":false}}'
```

## الاستجابة (200 OK) {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/{jobId}/photo.jpg",
  "originalSize": 300000,
  "processedSize": 310000
}
```

## نقطة نهاية التحليل {#analyze-endpoint}

`POST /api/v1/tools/image/image-enhancement/analyze`

يحلّل صورة ويُرجع توصيات التصحيح دون تطبيقها.

### المعاملات {#parameters-1}

| المعامل | النوع | مطلوب | الوصف |
|-----------|------|----------|-------------|
| file | file | نعم | ملف الصورة (multipart) |

### مثال على طلب {#example-request-1}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-enhancement/analyze \
  -F "file=@photo.jpg"
```

### الاستجابة (200 OK) {#response-200-ok-1}

```json
{
  "corrections": {
    "exposure": { "value": 0.3, "direction": "brighten" },
    "contrast": { "value": 0.2, "direction": "increase" },
    "whiteBalance": { "value": 200, "direction": "warmer" },
    "saturation": { "value": 0.1, "direction": "increase" },
    "sharpness": { "value": 0.4, "direction": "sharpen" }
  }
}
```

## ملاحظات {#notes}

- تستخدم هذه الأداة مصنع `createToolRoute` المتزامن، لذا تُرجع استجابة قياسية (وليس 202 غير متزامنة).
- يضبط معامل `mode` كيفية ترجيح التصحيحات (مثلاً، وضع البورتريه ألطف على درجات لون البشرة، ووضع المناظر الطبيعية يعزّز التشبّع).
- عند تفعيل `deepEnhance` وتثبيت أداة `noise-removal` (SCUNet)، يُطبَّق تمرير إضافي لإزالة التشويش بالذكاء الاصطناعي بعد التصحيحات القياسية.
- نقطة نهاية التحليل مفيدة لمعاينة التصحيحات التي ستُطبَّق قبل الالتزام بها.
- تدعم صيغ الإدخال HEIC/HEIF وRAW وTGA وPSD وEXR وHDR عبر فك الترميز التلقائي.
