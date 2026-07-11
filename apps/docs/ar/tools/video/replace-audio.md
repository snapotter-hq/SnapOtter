---
description: "استبدال مسار الصوت في الفيديو بملف آخر."
i18n_source_hash: fabc2a953103
i18n_provenance: human
i18n_output_hash: 42ed2fc6dddc
---

# Replace Audio {#replace-audio}

استبدال مسار الصوت في الفيديو بملف صوتي. ارفع فيديو وملف صوت معاً.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/replace-audio`

يقبل بيانات نموذج متعدد الأجزاء تحتوي على ملفين بالضبط: ملف فيديو يليه ملف صوت.

## Parameters {#parameters}

لا توجد معلمات إعدادات لهذه الأداة. ارفع ملف فيديو وملف صوت كجزأين `file`.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/replace-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F "file=@voiceover.mp3"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 13100000
}
```

## Notes {#notes}

- يجب رفع ملفين بالضبط: يجب أن يكون الأول فيديو، ويجب أن يكون الثاني ملف صوت.
- إذا كان ملف الصوت أطول من الفيديو، يُقتَص ليطابق مدة الفيديو. إذا كان أقصر، يُشغَّل ما تبقى من الفيديو بصمت.
- يُنسَخ تدفق الفيديو دون إعادة ترميز، لذا لا يوجد فقد في جودة الفيديو.
