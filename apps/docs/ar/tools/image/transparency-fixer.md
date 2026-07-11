---
description: "إصلاح ملفات PNG الشفافة الزائفة بالمطّ بالذكاء الاصطناعي (BiRefNet) لإنتاج شفافية حقيقية، مع تنظيف حواف بإزالة الأطراف."
i18n_source_hash: 7eb748b80f93
i18n_provenance: human
i18n_output_hash: 3956e0e60365
---

# مصلح شفافية PNG {#png-transparency-fixer}

أصلح ملفات PNG الشفافة الزائفة بنقرة واحدة. يستخدم المطّ بالذكاء الاصطناعي (نموذج BiRefNet HR Matting) لإنتاج شفافية ألفا حقيقية، مع معالجة لاحقة لإزالة الأطراف لتنظيف الحواف.

## نقطة نهاية API {#api-endpoint}

`POST /api/v1/tools/image/transparency-fixer`

**المعالجة:** غير متزامنة (تُرجع 202، مع استقصاء `/api/v1/jobs/{jobId}/progress` للحالة عبر SSE)

**حزمة النموذج:** `background-removal` (4-5 غيغابايت)

## المعاملات {#parameters}

| المعامل | النوع | مطلوب | الافتراضي | الوصف |
|-----------|------|----------|---------|-------------|
| file | file | نعم | - | ملف الصورة (متعدد الأجزاء) |
| defringe | number | لا | `30` | شدة إزالة الأطراف (0-100). يزيل بكسلات الأطراف شبه الشفافة حول الحواف |
| outputFormat | string | لا | `"png"` | صيغة المخرجات: `png` أو `webp` |
| removeWatermark | boolean | لا | `false` | تطبيق معالجة مسبقة لإزالة العلامة المائية (مرشح وسيط) |

## مثال طلب {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/transparency-fixer \
  -F "file=@fake-transparent.png" \
  -F 'settings={"defringe":40,"outputFormat":"png"}'
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
data: {"phase":"processing","stage":"Processing transparency...","percent":50}
```

### النتيجة النهائية (عبر SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/fake-transparent_fixed.png",
    "originalSize": 180000,
    "processedSize": 150000,
    "filename": "fake-transparent.png"
  }
}
```

## ملاحظات {#notes}

- يتطلب تثبيت حزمة النموذج `background-removal` (4-5 غيغابايت).
- يستخدم `birefnet-hr-matting` كنموذج أساسي لمطّ ألفا عالي الجودة. يعود إلى `birefnet-general` إذا نفدت ذاكرة نموذج HR.
- يزيل خيار `defringe` بكسلات الأطراف شبه الشفافة التي يتركها أحيانًا المطّ بالذكاء الاصطناعي حول الشعر والفراء والحواف الدقيقة. يعمل بتمويه قناة ألفا وتصفير البكسلات منخفضة الثقة.
- يطبّق خيار `removeWatermark` خطوة معالجة مسبقة بمرشح وسيط. إنه خفض أساسي للعلامة المائية، وليس أداة مخصصة لإزالة العلامات المائية.
- يُخرج ملفات PNG أو WebP عديمة الفقد فقط (كلاهما يدعم شفافية ألفا).
- يدعم صيغ المدخلات HEIC/HEIF وRAW وTGA وPSD وEXR وHDR عبر فك الترميز التلقائي.
