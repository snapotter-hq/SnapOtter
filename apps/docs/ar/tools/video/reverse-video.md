---
description: "تشغيل مقطع فيديو بالعكس."
i18n_source_hash: 98226f4e092d
i18n_provenance: human
i18n_output_hash: 5c5b50cb3701
---

# Reverse Video {#reverse-video}

تشغيل مقطع فيديو بالعكس. يُعكَس مسار الصوت أيضاً.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/reverse-video`

يقبل بيانات نموذج متعدد الأجزاء تحتوي على ملف فيديو. لا توجد إعدادات قابلة للتهيئة لهذه الأداة.

## Parameters {#parameters}

لا توجد معلمات لهذه الأداة. تعكس الفيديو بأكمله.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/reverse-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12600000
}
```

## Notes {#notes}

- محدود بمقاطع تصل مدتها إلى 5 دقائق. تُرفَض مقاطع الفيديو الأطول بخطأ 400.
- يُعكَس مسار الفيديو والصوت معاً. لعكس الفيديو دون صوت، اكتم صوته أولاً.
