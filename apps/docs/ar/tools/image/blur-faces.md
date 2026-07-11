---
description: "اكتشاف الوجوه وتمويهها تلقائيًا في الصور بكشف الوجوه بالذكاء الاصطناعي حفاظًا على الخصوصية والتجهيل المتوافق مع GDPR."
i18n_source_hash: fb861c12aea5
i18n_provenance: human
i18n_output_hash: 285d3d7226d6
---

# تمويه الوجوه / المعلومات الشخصية {#face-pii-blur}

اكتشف الوجوه وموّهها تلقائيًا في الصور باستخدام كشف الوجوه المدعوم بالذكاء الاصطناعي (MediaPipe).

## نقطة نهاية API {#api-endpoint}

`POST /api/v1/tools/image/blur-faces`

**المعالجة:** غير متزامنة (تُرجع 202، استعلِم عن `/api/v1/jobs/{jobId}/progress` لمعرفة الحالة عبر SSE)

**حزمة النموذج:** `face-detection` (200-300 ميغابايت)

## المعاملات {#parameters}

| المعامل | النوع | مطلوب | الافتراضي | الوصف |
|-----------|------|----------|---------|-------------|
| file | file | نعم | - | ملف صورة (multipart) |
| blurRadius | number | لا | `30` | نصف قطر التمويه المطبّق على الوجوه المكتشَفة (1-100) |
| sensitivity | number | لا | `0.5` | حساسية كشف الوجوه (0-1). القيم الأدنى تكتشف وجوهًا أقل بثقة أعلى |

## مثال على الطلب {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/blur-faces \
  -F "file=@group-photo.jpg" \
  -F 'settings={"blurRadius":40,"sensitivity":0.3}'
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
data: {"phase":"processing","stage":"Detecting faces...","percent":40}
```

### النتيجة النهائية (عبر SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/group-photo_blurred.jpg",
    "originalSize": 450000,
    "processedSize": 420000,
    "facesDetected": 3,
    "faces": [
      {"x": 100, "y": 50, "w": 80, "h": 80},
      {"x": 300, "y": 60, "w": 75, "h": 75},
      {"x": 500, "y": 55, "w": 85, "h": 85}
    ]
  }
}
```

### لم تُكتشَف وجوه {#no-faces-detected}

إذا لم يُعثَر على أي وجوه، تتضمّن النتيجة تحذيرًا:

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "facesDetected": 0,
    "warning": "No faces detected in this image. Try increasing detection sensitivity."
  }
}
```

## ملاحظات {#notes}

- يتطلّب تثبيت حزمة النموذج `face-detection` (200-300 ميغابايت).
- تطابِق صيغة المخرجات صيغة الإدخال تلقائيًا.
- تحتوي المصفوفة `faces` على إحداثيات مربّع الإحاطة (x، y، width، height) لكل وجه مكتشَف.
- ارفع قيمة `sensitivity` (أقرب إلى 1.0) لاكتشاف مزيد من الوجوه، بما فيها الوجوه المحجوبة جزئيًا.
- يدعم صيغ الإدخال HEIC/HEIF وRAW وTGA وPSD وEXR وHDR عبر الفكّ التلقائي.
