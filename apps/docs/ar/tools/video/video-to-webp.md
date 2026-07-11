---
description: "تحويل مقطع فيديو إلى صورة WebP متحركة."
i18n_source_hash: 7b1a22459bd1
i18n_provenance: human
i18n_output_hash: fb8f049a0185
---

# Video to WebP {#video-to-webp}

تحويل مقطع فيديو إلى صورة WebP متحركة مع معدل إطارات وعرض وجودة قابلة للتهيئة.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-to-webp`

يقبل بيانات نموذج متعدد الأجزاء تحتوي على ملف فيديو وحقل JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fps | integer | No | `12` | معدل إطارات الإخراج (1-30) |
| width | integer | No | `480` | عرض الإخراج بالبكسل (16-1920). يتغير الارتفاع بشكل متناسب |
| quality | integer | No | `75` | جودة ضغط WebP (1-100) |
| loop | boolean | No | `true` | تكرار الرسوم المتحركة |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-webp \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"fps": 15, "width": 640, "quality": 80}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.webp",
  "originalSize": 12500000,
  "processedSize": 2800000
}
```

## Notes {#notes}

- ينتج WebP المتحرك ملفات أصغر من GIF مع دعم ألوان أفضل (لوحة 24 بت مقابل 8 بت).
- تنتج قيم `quality` الأقل ملفات أصغر على حساب دقة الصورة.
- اضبط `loop` على `false` للرسوم المتحركة التي يجب أن تُشغَّل مرة واحدة وتتوقف.
