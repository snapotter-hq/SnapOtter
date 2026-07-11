---
description: "تكبير الصور من 2x إلى 4x بدقة فائقة من Real-ESRGAN بالذكاء الاصطناعي مع الحفاظ على التفاصيل الدقيقة."
i18n_source_hash: 150032e99476
i18n_provenance: human
i18n_output_hash: f469cd14aa46
---

# تكبير الصورة {#image-upscaling}

تحسين بدقة فائقة بالذكاء الاصطناعي باستخدام Real-ESRGAN. يكبّر الصور من 2x إلى 4x مع الحفاظ على التفاصيل.

## نقطة نهاية API {#api-endpoint}

`POST /api/v1/tools/image/upscale`

**المعالجة:** غير متزامنة (تُرجع 202، مع استقصاء `/api/v1/jobs/{jobId}/progress` للحالة عبر SSE)

**حزمة النموذج:** `upscale-enhance` (5-6 غيغابايت)

## المعاملات {#parameters}

| المعامل | النوع | مطلوب | الافتراضي | الوصف |
|-----------|------|----------|---------|-------------|
| file | file | نعم | - | ملف الصورة (متعدد الأجزاء) |
| scale | number | لا | `2` | عامل التكبير (مثل 2، 3، 4) |
| model | string | لا | `"auto"` | النموذج المراد استخدامه (مثل `auto`، أسماء نماذج محددة) |
| faceEnhance | boolean | لا | `false` | تطبيق تحسين الوجه أثناء التكبير |
| denoise | number | لا | `0` | قوة خفض الضوضاء (0 = معطّل) |
| format | string | لا | `"auto"` | صيغة المخرجات: `auto`، `png`، `jpg`، `webp`، `tiff`، `gif`، `avif`، `heic`، `heif`، `jxl` |
| quality | number | لا | `95` | جودة المخرجات (1-100) |

## مثال طلب {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/upscale \
  -F "file=@photo.jpg" \
  -F 'settings={"scale":4,"model":"auto","faceEnhance":true,"format":"png"}'
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
data: {"phase":"processing","stage":"Upscaling...","percent":60}
```

### النتيجة النهائية (عبر SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/photo_4x.png",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 120000,
    "processedSize": 2400000,
    "width": 4096,
    "height": 4096,
    "method": "realesrgan-x4plus"
  }
}
```

## ملاحظات {#notes}

- يتطلب تثبيت حزمة النموذج `upscale-enhance` (5-6 غيغابايت).
- يستخدم Real-ESRGAN عند توفره؛ ويعود إلى استيفاء Lanczos إذا لم يكن نموذج الذكاء الاصطناعي متاحًا.
- يطبّق خيار `faceEnhance` استعادة الوجه بـ GFPGAN أثناء التكبير للحصول على جودة وجه أفضل.
- بالنسبة لصيغ المخرجات التي يتعذّر معاينتها في المتصفح (HEIC، JXL، TIFF)، تُولَّد معاينة WebP إلى جانب المخرجات الرئيسية.
- يدعم صيغ المدخلات HEIC/HEIF وRAW وTGA وPSD وEXR وHDR عبر فك الترميز التلقائي.
