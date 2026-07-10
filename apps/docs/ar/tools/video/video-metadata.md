---
description: "إزالة البيانات الوصفية من الفيديو والإبلاغ عما عُثر عليه."
i18n_source_hash: 69621bfb98ca
i18n_provenance: human
i18n_output_hash: e2c4f2698237
---

# Clean Video Metadata {#clean-video-metadata}

إزالة البيانات الوصفية (تاريخ الإنشاء، إحداثيات GPS، طراز الكاميرا، وسوم البرامج، إلخ) من الفيديو والإبلاغ عما أُزيل.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-metadata`

يقبل بيانات نموذج متعدد الأجزاء تحتوي على ملف فيديو. لا توجد إعدادات قابلة للتهيئة لهذه الأداة.

## Parameters {#parameters}

لا توجد معلمات لهذه الأداة. تزيل جميع البيانات الوصفية من حاوية الفيديو.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip_clean.mp4",
  "originalSize": 12500000,
  "processedSize": 12480000,
  "metadata": {
    "container": "mov,mp4,m4a,3gp,3g2,mj2",
    "durationS": 42.5,
    "bitrateKbps": 2350,
    "streams": [
      { "type": "video", "codec": "h264", "width": 1920, "height": 1080 },
      { "type": "audio", "codec": "aac", "sampleRate": 48000 }
    ]
  }
}
```

## Notes {#notes}

- تشمل البيانات الوصفية المُزالة طوابع وقت الإنشاء، وبيانات GPS/الموقع، ومعلومات الكاميرا/الجهاز، ووسوم البرامج.
- يُنسَخ تدفقا الفيديو والصوت دون إعادة ترميز، لذا لا يوجد فقد في الجودة.
- مفيدة للخصوصية قبل مشاركة مقاطع الفيديو علناً.
