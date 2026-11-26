---
description: "استخراج مسار الترجمة من الفيديو كملف SRT أو WebVTT أو ASS."
i18n_source_hash: 5af4dad67936
i18n_provenance: machine
i18n_output_hash: cec86451d84c
i18n_hash_version: 2
---

# Extract Subtitles {#extract-subtitles}

استخراج مسار الترجمة المدمج من حاوية الفيديو وتنزيله كملف SRT أو WebVTT أو ASS.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/extract-subtitles`

يقبل بيانات نموذج متعدد الأجزاء تحتوي على ملف فيديو وسلسلة JSON اختيارية `settings`.

## Parameters {#parameters}

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `format` | string | `"srt"` | صيغة الإخراج: `srt` أو `vtt` (WebVTT) أو `ass` |

يُستخرَج أول مسار ترجمة يُعثَر عليه في حاوية الفيديو.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/extract-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"format":"vtt"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.vtt",
  "originalSize": 12500000,
  "processedSize": 4500
}
```

## Notes {#notes}

- يجب أن يحتوي الفيديو على مسار ترجمة مدمج. إذا لم يُعثَر على مسار ترجمة، يُرجع الطلب خطأ 400.
- إذا كان للفيديو عدة مسارات ترجمة، يُستخرَج الأول.
- تتحوّل المسارات النصية (SubRip وASS وmov_text وWebVTT) إلى أي من صيغ الإخراج الثلاث. ويؤدي تحويل مسار ASS إلى SRT أو WebVTT إلى فقدان تموضعه وتأثيراته.
- لا يمكن تحويل المسارات القائمة على الصور (Blu-ray PGS وDVD VobSub) إلى نص دون OCR، ويُرجع الطلب معها خطأ 422.
