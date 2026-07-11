---
description: "إزالة الكائنات غير المرغوبة من الصور بالطلاء التصحيحي بالذكاء الاصطناعي (LaMa)، بتوجيه من قناع للمنطقة المراد محوها."
i18n_source_hash: 8e2e42a5e4f9
i18n_provenance: human
i18n_output_hash: be557633a7a0
---

# Object Eraser {#object-eraser}

أزِل الكائنات غير المرغوبة من الصور بالطلاء التصحيحي بالذكاء الاصطناعي (نموذج LaMa). يقبل صورة وقناعًا يشير إلى المنطقة المراد محوها.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/erase-object`

**المعالجة:** غير متزامنة (تُعيد 202، استعلِم من `/api/v1/jobs/{jobId}/progress` عن الحالة عبر SSE)

**حزمة النموذج:** `object-eraser-colorize` (1-2 غيغابايت)

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | ملف الصورة المصدر (multipart) |
| mask | file | Yes | - | صورة القناع (الأبيض = المنطقة المراد محوها، الأسود = الاحتفاظ). يجب رفعها باسم الحقل `mask` |
| format | string | No | `"auto"` | صيغة الإخراج: `auto`، `png`، `jpg`، `jpeg`، `webp`، `tiff`، `gif`، `avif`، `heic`، `heif`، `jxl` |
| quality | integer | No | `95` | جودة الإخراج (1-100) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/erase-object \
  -F "file=@photo.jpg" \
  -F "mask=@mask.png" \
  -F "format=png" \
  -F "quality=95"
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
data: {"phase":"processing","stage":"Inpainting...","percent":70}
```

### Final Result (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/photo_erased.png",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 245000,
    "processedSize": 230000
  }
}
```

## Notes {#notes}

- يتطلب تثبيت حزمة النموذج `object-eraser-colorize` (1-2 غيغابايت).
- يجب أن يكون القناع بالأبعاد نفسها للصورة المصدر. البكسلات البيضاء تشير إلى المناطق المراد محوها؛ يملؤها الذكاء الاصطناعي بمحتوى معقول.
- يستخدم LaMa (Large Mask Inpainting) لإزالة الكائنات بجودة عالية.
- لصيغ الإخراج غير القابلة للمعاينة في المتصفح، تُولَّد معاينة WebP إلى جانب الإخراج الرئيسي.
- يدعم صيغ الإدخال HEIC/HEIF وRAW وTGA وPSD وEXR وHDR عبر فكّ الشفرة التلقائي.
