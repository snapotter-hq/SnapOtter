---
description: "دمج مسار ترجمة داخل حاوية الفيديو."
i18n_source_hash: be272730fff5
i18n_provenance: human
i18n_output_hash: decbcfe0e0d9
---

# Embed Subtitles {#embed-subtitles}

دمج ملف ترجمة داخل حاوية الفيديو كمسار ترجمة مرن يمكن للمشاهدين تشغيله أو إيقافه.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/embed-subtitles`

يقبل بيانات نموذج متعدد الأجزاء تحتوي على ملف فيديو وملف ترجمة، بالإضافة إلى حقل JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| language | string | No | `"eng"` | رمز لغة ISO 639-2/B (3 أحرف صغيرة، مثل `"eng"` أو `"fra"` أو `"deu"`) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/embed-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F "file=@subtitles.srt" \
  -F 'settings={"language": "fra"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12520000
}
```

## Notes {#notes}

- ارفع ملفين: يجب أن يكون الأول فيديو، ويجب أن يكون الثاني ملف ترجمة (.srt أو .vtt أو .ass).
- يمكن للمشاهد تبديل الترجمات المدمجة (المرنة) في مشغل الوسائط الخاص به. للحصول على ترجمات ظاهرة بشكل دائم، استخدم أداة Burn Subtitles بدلاً من ذلك.
- يُخزَّن رمز اللغة كبيانات وصفية في الحاوية ويساعد مشغلات الوسائط على تصنيف مسار الترجمة.
