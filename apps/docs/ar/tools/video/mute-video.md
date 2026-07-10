---
description: "إزالة مسار الصوت من الفيديو."
i18n_source_hash: 9a0c60bbcaa3
i18n_provenance: human
i18n_output_hash: ac094aea5382
---

# Mute Video {#mute-video}

إزالة مسار الصوت من الفيديو، مع الإبقاء على التدفق المرئي فقط.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/mute-video`

يقبل بيانات نموذج متعدد الأجزاء تحتوي على ملف فيديو. لا توجد إعدادات قابلة للتهيئة لهذه الأداة.

## Parameters {#parameters}

لا توجد معلمات لهذه الأداة. تزيل مسار الصوت من الفيديو المرفوع.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/mute-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 8900000
}
```

## Notes {#notes}

- يُنسَخ تدفق الفيديو دون إعادة ترميز، لذا لا يوجد فقد في الجودة.
- إذا لم يكن للفيديو المُدخَل مسار صوتي، يُرجَع الملف دون تغيير.
