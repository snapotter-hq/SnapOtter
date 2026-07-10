---
description: "تغيير حجم الفيديو إلى دقة جديدة أو حجم مُعَدّ مسبقاً."
i18n_source_hash: bb1f67871fea
i18n_provenance: human
i18n_output_hash: 920828e251a8
---

# Resize Video {#resize-video}

تغيير حجم الفيديو إلى دقة جديدة باستخدام أبعاد بكسل مخصصة أو إعداد مسبق قياسي.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/resize-video`

يقبل بيانات نموذج متعدد الأجزاء تحتوي على ملف فيديو وحقل JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| width | integer | No | - | العرض المستهدف بالبكسل (16-7680) |
| height | integer | No | - | الارتفاع المستهدف بالبكسل (16-4320) |
| preset | string | No | `"custom"` | إعداد الدقة المسبق: `custom` أو `2160p` أو `1440p` أو `1080p` أو `720p` أو `480p` أو `360p` |

عندما تكون `preset` هي `"custom"`، يجب توفير واحد على الأقل من `width` أو `height`. يتغير البُعد الآخر بشكل متناسب.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/resize-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"preset": "720p"}'
```

تغيير الحجم إلى أبعاد مخصصة:

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/resize-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"width": 1280, "height": 720}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 25000000,
  "processedSize": 8500000
}
```

## Notes {#notes}

- تُطابِق قيم الإعداد المسبق ارتفاعات قياسية (مثلاً `720p` = 1280x720، `1080p` = 1920x1080). يتغير العرض بشكل متناسب من نسبة العرض إلى الارتفاع للمصدر.
- تُقرَّب الأبعاد إلى أرقام زوجية كما تتطلب معظم برامج ترميز الفيديو.
- أقصى دقة مدعومة هي 7680x4320 (8K UHD).
