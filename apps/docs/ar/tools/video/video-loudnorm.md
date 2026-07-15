---
description: "تسوية مستوى صوت الفيديو إلى معيار البث."
i18n_source_hash: c7a53b5faf1b
i18n_provenance: human
i18n_output_hash: 3f821e929306
---

# تسوية صوت الفيديو {#normalize-audio}

تسوية مستوى صوت الفيديو إلى معيار جهارة البث EBU R128.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-loudnorm`

يقبل بيانات نموذج متعدد الأجزاء تحتوي على ملف فيديو. لا توجد إعدادات قابلة للتهيئة لهذه الأداة.

## Parameters {#parameters}

لا توجد معلمات لهذه الأداة. تطبق تسوية جهارة EBU R128 على مسار الصوت.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-loudnorm \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12500000
}
```

## Notes {#notes}

- تستخدم مرشح `loudnorm` في FFmpeg مستهدفةً جهارة متكاملة قدرها -16 LUFS مع ذروة حقيقية -1.5 dBTP ونطاق جهارة 11 LU (معيار البث EBU R128).
- يُحفَظ معدل عينات الصوت المصدر في الإخراج.
- إذا لم يكن للفيديو مسار صوتي، يُرجع الطلب خطأ 400.
