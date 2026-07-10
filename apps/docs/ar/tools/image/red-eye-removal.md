---
description: "كشف وتصحيح العين الحمراء الناتجة عن فلاش الكاميرا مدعوم بالذكاء الاصطناعي."
i18n_source_hash: 647c6ff1ef7c
i18n_provenance: human
i18n_output_hash: b549adab4fa6
---

# إزالة العين الحمراء {#red-eye-removal}

كشف وتصحيح العين الحمراء الناتجة عن فلاش الكاميرا مدعوم بالذكاء الاصطناعي.

## نقطة نهاية الـ API {#api-endpoint}

`POST /api/v1/tools/image/red-eye-removal`

**المعالجة:** غير متزامنة (تُرجع 202، استعلم عن `/api/v1/jobs/{jobId}/progress` لمعرفة الحالة عبر SSE)

**حزمة النموذج:** `face-detection` (200-300 ميغابايت)

## المعاملات {#parameters}

| المعامل | النوع | مطلوب | القيمة الافتراضية | الوصف |
|-----------|------|----------|---------|-------------|
| file | file | نعم | - | ملف الصورة (متعدد الأجزاء) |
| sensitivity | number | لا | `50` | حساسية كشف العين الحمراء (0-100). القيم الأعلى تكشف احمرارًا أكثر دقة |
| strength | number | لا | `70` | شدة التصحيح (0-100). مدى قوة تحييد الاحمرار |
| format | string | لا | - | صيغة الإخراج (تجاوز اختياري) |
| quality | number | لا | `90` | جودة الإخراج (1-100) |

## مثال على الطلب {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/red-eye-removal \
  -F "file=@flash-photo.jpg" \
  -F 'settings={"sensitivity":60,"strength":80}'
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
data: {"phase":"processing","stage":"Detecting red eyes...","percent":40}
```

### النتيجة النهائية (عبر SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/flash-photo_redeye_fixed.png",
    "originalSize": 280000,
    "processedSize": 290000,
    "facesDetected": 2,
    "eyesCorrected": 4
  }
}
```

## ملاحظات {#notes}

- يتطلب تثبيت حزمة النموذج `face-detection` (200-300 ميغابايت).
- يكشف الوجوه أولًا، ثم يحدد مناطق العينين داخل كل وجه، وأخيرًا يحدد بكسلات العين الحمراء ويصححها.
- يشير عدد `facesDetected` إلى عدد الوجوه التي عُثر عليها؛ و `eyesCorrected` هو إجمالي عدد العيون المفردة التي صُحِّح فيها الاحمرار.
- الإخراج دائمًا PNG للحفاظ على أقصى جودة.
- يدعم صيغ الإدخال HEIC/HEIF وRAW وTGA وPSD وEXR وHDR عبر فك الترميز التلقائي.
