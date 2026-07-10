---
description: "ضبط السطوع والتباين والتشبع وجاما في الفيديو."
i18n_source_hash: 40483b79d44b
i18n_provenance: human
i18n_output_hash: 42b8fe50ca72
---

# Video Color {#video-color}

ضبط السطوع والتباين والتشبع وتصحيح جاما في الفيديو.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-color`

يقبل بيانات نموذج متعدد الأجزاء تحتوي على ملف فيديو وحقل JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| brightness | number | No | `0` | ضبط السطوع (-1 إلى 1) |
| contrast | number | No | `1` | مضاعِف التباين (0-4) |
| saturation | number | No | `1` | مضاعِف التشبع (0-3). اضبطه على 0 للتدرج الرمادي |
| gamma | number | No | `1` | تصحيح جاما (0.1-10) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-color \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"brightness": 0.1, "contrast": 1.2, "saturation": 1.5}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12300000
}
```

## Notes {#notes}

- جميع القيم عند إعداداتها الافتراضية (السطوع 0، التباين 1، التشبع 1، جاما 1) لا تُحدث أي تغيير.
- تعيين التشبع على `0` يحوّل الفيديو إلى التدرج الرمادي.
- تُفتّح قيم جاما الأقل من 1 الظلال، بينما تُعتّمها القيم الأعلى من 1.
