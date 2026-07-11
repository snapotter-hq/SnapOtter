---
description: "تلوين الصور بالأبيض والأسود أو بتدرّج الرمادي تلقائيًا باستخدام نموذج الذكاء الاصطناعي DDColor."
i18n_source_hash: 688aa3abbdae
i18n_provenance: human
i18n_output_hash: 8f952ccbb441
---

# AI Colorization {#ai-colorization}

حوّل الصور بالأبيض والأسود أو بتدرّج الرمادي إلى ألوان كاملة باستخدام الذكاء الاصطناعي (نموذج DDColor مع OpenCV DNN كخيار احتياطي).

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/colorize`

**المعالجة:** غير متزامنة (تُعيد 202، استعلِم من `/api/v1/jobs/{jobId}/progress` عن الحالة عبر SSE)

**حزمة النموذج:** `object-eraser-colorize` (1-2 غيغابايت)

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | ملف الصورة (multipart) |
| intensity | number | No | `1.0` | شدة اللون (0-1). القيم الأقل تنتج تلوينًا أكثر خفوتًا |
| model | string | No | `"auto"` | النموذج المستخدم: `auto`، `ddcolor`، `opencv` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/colorize \
  -F "file=@old-bw-photo.jpg" \
  -F 'settings={"intensity":0.9,"model":"auto"}'
```

## Response {#response}

### Initial Response (202 Accepted) {#initial-response-202-accepted}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### Progress (SSE at `/api/v1/jobs/{jobId}/progress`) {#progress-sse-at-api-v1-jobs-jobid-progress}

```
event: progress
data: {"phase":"processing","stage":"Colorizing...","percent":55}
```

### Final Result (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/old-bw-photo_colorized.jpg",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 180000,
    "processedSize": 210000,
    "width": 1920,
    "height": 1080,
    "method": "ddcolor"
  }
}
```

## Notes {#notes}

- يتطلب تثبيت حزمة النموذج `object-eraser-colorize` (1-2 غيغابايت).
- ينتج DDColor نتائج أعلى جودة لكنه أبطأ؛ وOpenCV DNN أسرع بجودة أقل قليلًا. يستخدم `auto` نموذج DDColor عند توفره مع OpenCV كخيار احتياطي.
- يمزج المُعامِل `intensity` بين النسخة الأصلية بتدرّج الرمادي والنتيجة الملوّنة بالذكاء الاصطناعي. استخدم 1.0 للون الكامل، والقيم الأقل لمظهر عتيق جزئي التشبّع.
- صيغة الإخراج تطابق صيغة الإدخال تلقائيًا.
- لصيغ الإخراج غير القابلة للمعاينة في المتصفح، تُولَّد معاينة WebP إلى جانب الإخراج الرئيسي.
- يدعم صيغ الإدخال HEIC/HEIF وRAW وTGA وPSD وEXR وHDR عبر فكّ الشفرة التلقائي.
