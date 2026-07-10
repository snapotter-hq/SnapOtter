---
description: "تحويل مجموعة من الصور إلى فيديو عرض شرائح."
i18n_source_hash: 2c6f183feb6d
i18n_provenance: human
i18n_output_hash: 3efcccb81efa
---

# Images to Video {#images-to-video}

تحويل مجموعة من الصور إلى فيديو عرض شرائح مع مدة قابلة للتهيئة لكل صورة، ودقة، ومعدل إطارات.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/images-to-video`

يقبل بيانات نموذج متعدد الأجزاء تحتوي على ملفي صورة أو أكثر وحقل JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| secondsPerImage | number | No | `2` | مدة عرض كل صورة بالثواني (0.5-10) |
| resolution | string | No | `"720p"` | دقة الإخراج: `1080p` أو `720p` أو `square` |
| fps | integer | No | `30` | معدل إطارات الإخراج (10-60) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/images-to-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@slide1.jpg" \
  -F "file=@slide2.jpg" \
  -F "file=@slide3.jpg" \
  -F "file=@slide4.jpg" \
  -F 'settings={"secondsPerImage": 3, "resolution": "1080p"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/slideshow.mp4",
  "originalSize": 3500000,
  "processedSize": 1200000
}
```

## Notes {#notes}

- يقبل 2-60 ملف صورة لكل طلب. تظهر الصور في الفيديو بترتيب الرفع.
- تُغيَّر أبعاد الصور وتُبطَّن لتلائم الدقة المستهدفة مع الحفاظ على نسبة العرض إلى الارتفاع.
- ينتج خيار الدقة `square` فيديو بأبعاد 1080x1080، وهو مفيد لوسائل التواصل الاجتماعي.
- صيغة الإخراج دائماً MP4 (H.264).
