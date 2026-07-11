---
description: "استخراج مسار الترجمة من الفيديو كملف SRT."
i18n_source_hash: 48db860f6676
i18n_provenance: human
i18n_output_hash: 3a1d345bdc4a
---

# Extract Subtitles {#extract-subtitles}

استخراج مسار الترجمة المدمج من حاوية الفيديو وتنزيله كملف SRT.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/extract-subtitles`

يقبل بيانات نموذج متعدد الأجزاء تحتوي على ملف فيديو. لا توجد إعدادات قابلة للتهيئة لهذه الأداة.

## Parameters {#parameters}

لا توجد معلمات لهذه الأداة. تستخرج أول مسار ترجمة يُعثَر عليه في حاوية الفيديو.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/extract-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.srt",
  "originalSize": 12500000,
  "processedSize": 4500
}
```

## Notes {#notes}

- يجب أن يحتوي الفيديو على مسار ترجمة مدمج. إذا لم يُعثَر على مسار ترجمة، يُرجع الطلب خطأ 400.
- إذا كان للفيديو عدة مسارات ترجمة، يُستخرَج الأول.
- صيغة الإخراج هي SRT بغض النظر عن صيغة الترجمة الأصلية في الحاوية.
