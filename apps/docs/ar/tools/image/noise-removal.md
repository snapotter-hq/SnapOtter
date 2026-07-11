---
description: "إزالة الضوضاء والحبيبات المدعومة بالذكاء الاصطناعي مع خيارات جودة متعددة المستويات."
i18n_source_hash: f0dfc876e0e0
i18n_provenance: human
i18n_output_hash: 660ad3ea66a7
---

# إزالة الضوضاء {#noise-removal}

إزالة الضوضاء والحبيبات المدعومة بالذكاء الاصطناعي مع خيارات جودة متعددة المستويات، باستخدام الوحدة الجانبية لـ Python (نموذج SCUNet).

## نقطة نهاية الـ API {#api-endpoint}

`POST /api/v1/tools/image/noise-removal`

**المعالجة:** غير متزامنة (تُرجع 202، استعلم عن `/api/v1/jobs/{jobId}/progress` لمعرفة الحالة عبر SSE)

**حزمة النموذج:** `upscale-enhance` (5-6 غيغابايت)

## المعاملات {#parameters}

| المعامل | النوع | مطلوب | القيمة الافتراضية | الوصف |
|-----------|------|----------|---------|-------------|
| file | file | نعم | - | ملف الصورة (متعدد الأجزاء) |
| tier | string | لا | `"balanced"` | مستوى الجودة: `quick`، `balanced`، `quality`، `maximum` |
| strength | number | لا | `50` | شدة إزالة الضوضاء (0-100) |
| detailPreservation | number | لا | `50` | مقدار التفاصيل المراد الحفاظ عليها (0-100). القيم الأعلى تُبقي المزيد من الملمس |
| colorNoise | number | لا | `30` | شدة تقليل ضوضاء الألوان (0-100) |
| format | string | لا | `"original"` | صيغة الإخراج: `original`، `png`، `jpeg`، `webp`، `avif`، `jxl` |
| quality | number | لا | `90` | جودة ترميز الإخراج (1-100) |

## مثال على الطلب {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/noise-removal \
  -F "file=@noisy-photo.jpg" \
  -F 'settings={"tier":"quality","strength":60,"detailPreservation":70,"colorNoise":40}'
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
data: {"phase":"processing","stage":"Denoising...","percent":65}
```

### النتيجة النهائية (عبر SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/noisy-photo_denoised.jpg",
    "originalSize": 500000,
    "processedSize": 380000
  }
}
```

## ملاحظات {#notes}

- يتطلب تثبيت حزمة النموذج `upscale-enhance` (5-6 غيغابايت).
- تُوازن مستويات الجودة بين السرعة والجودة: `quick` هو الأسرع مع إزالة أساسية للضوضاء، بينما يستخدم `maximum` النهج الأكثر شمولًا متعدد المرات.
- يُعد المعامل `detailPreservation` حاسمًا للأجسام ذات الملمس (القماش، الشعر، أوراق النبات). القيم الأعلى تمنع مزيل الضوضاء من طمس التفاصيل الدقيقة.
- عند ضبط `format` على `"original"`، تطابق صيغة الإخراج صيغة ملف الإدخال.
- يدعم صيغ الإدخال HEIC/HEIF وRAW وTGA وPSD وEXR وHDR عبر فك الترميز التلقائي.
