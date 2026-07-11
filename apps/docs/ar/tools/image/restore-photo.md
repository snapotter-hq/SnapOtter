---
description: "إصلاح الخدوش والتمزقات والتلف في الصور القديمة عبر خط ذكاء اصطناعي للترميم وتحسين الوجوه واللون."
i18n_source_hash: 3de13284216c
i18n_provenance: human
i18n_output_hash: e4d077a7a10e
---

# ترميم الصور {#photo-restoration}

أصلح الخدوش والتمزقات والتلف في الصور القديمة باستخدام خط ذكاء اصطناعي متعدد الخطوات. يجمع بين إصلاح الخدوش وتحسين الوجوه وإزالة الضوضاء والتلوين الاختياري.

## نقطة نهاية الـ API {#api-endpoint}

`POST /api/v1/tools/image/restore-photo`

**المعالجة:** غير متزامنة (تُرجع 202، استعلم عن `/api/v1/jobs/{jobId}/progress` لمعرفة الحالة عبر SSE)

**حزمة النموذج:** `photo-restoration` (4-5 غيغابايت)

## المعاملات {#parameters}

| المعامل | النوع | مطلوب | القيمة الافتراضية | الوصف |
|-----------|------|----------|---------|-------------|
| file | file | نعم | - | ملف الصورة (متعدد الأجزاء) |
| scratchRemoval | boolean | لا | `true` | إزالة الخدوش وتلف السطح |
| faceEnhancement | boolean | لا | `true` | تحسين الوجوه في الصورة المرمّمة |
| fidelity | number | لا | `0.7` | دقة تحسين الوجه (0-1). القيم الأعلى تحافظ على الملامح الأصلية أكثر |
| denoise | boolean | لا | `true` | تطبيق إزالة الضوضاء على النتيجة المرمّمة |
| denoiseStrength | number | لا | `25` | شدة إزالة الضوضاء (0-100) |
| colorize | boolean | لا | `false` | تلوين الصورة المرمّمة (للصور بتدرّج الرمادي) |
| colorizeStrength | number | لا | `85` | شدة التلوين (0-100) |

## مثال على الطلب {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/restore-photo \
  -F "file=@damaged-old-photo.jpg" \
  -F 'settings={"scratchRemoval":true,"faceEnhancement":true,"fidelity":0.6,"colorize":true}'
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
data: {"phase":"processing","stage":"Removing scratches...","percent":30}
```

```
event: progress
data: {"phase":"processing","stage":"Enhancing faces...","percent":60}
```

### النتيجة النهائية (عبر SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/damaged-old-photo_restored.jpg",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 200000,
    "processedSize": 350000,
    "width": 1200,
    "height": 900,
    "steps": ["scratch_removal", "face_enhancement", "denoise", "colorize"],
    "scratchCoverage": 12.5,
    "facesEnhanced": 2,
    "isGrayscale": true,
    "colorized": true
  }
}
```

## ملاحظات {#notes}

- يتطلب تثبيت حزمة النموذج `photo-restoration` (4-5 غيغابايت).
- يُشغّل الخط خطوات ذكاء اصطناعي متعددة بالتتابع: إصلاح الخدوش، وتحسين الوجوه (GFPGAN)، وإزالة الضوضاء، والتلوين اختياريًا.
- تُظهر مصفوفة `steps` في النتيجة خطوات المعالجة التي نُفِّذت فعليًا.
- `scratchCoverage` هو نسبة مئوية مقدَّرة من مساحة الصورة التي بها تلف بالخدوش.
- يتحكم `fidelity` في مدى قوة تحسين الوجوه مقابل الحفاظ على المظهر الأصلي. القيم الأدنى تنتج تحسينًا أكثر قوة؛ والقيم الأعلى أكثر تحفظًا.
- يكتشف خيار `colorize` تلقائيًا ما إذا كانت الصورة بتدرّج الرمادي. تؤكد الراية `isGrayscale` في النتيجة هذا الاكتشاف.
- تطابق صيغة الإخراج صيغة الإدخال تلقائيًا.
- يدعم صيغ الإدخال HEIC/HEIF وRAW وTGA وPSD وEXR وHDR وAVIF عبر فك الترميز التلقائي.
