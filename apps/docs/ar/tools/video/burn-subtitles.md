---
description: "عرض الترجمات بشكل دائم على إطارات الفيديو."
i18n_source_hash: 2d3111589db0
i18n_provenance: human
i18n_output_hash: 7051d851c7a9
---

# Burn Subtitles {#burn-subtitles}

عرض (تثبيت) الترجمات بشكل دائم من ملف SRT أو VTT أو ASS على كل إطار من إطارات الفيديو.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/burn-subtitles`

يقبل بيانات نموذج متعدد الأجزاء تحتوي على ملف فيديو وملف ترجمة. هذه نقطة نهاية غير متزامنة - تُرجع `202 Accepted` فوراً ويُبَثّ التقدم عبر SSE على `GET /api/v1/jobs/{jobId}/progress`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fontSize | integer | No | `24` | حجم خط الترجمة بالبكسل (8-72) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/burn-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F "file=@subtitles.srt" \
  -F 'settings={"fontSize": 28}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- ارفع ملفين: يجب أن يكون الأول فيديو، ويجب أن يكون الثاني ملف ترجمة (.srt أو .vtt أو .ass).
- الترجمات المثبّتة تصبح جزءاً دائماً من الفيديو ولا يمكن للمشاهد إيقافها. للحصول على ترجمات قابلة للتبديل، استخدم أداة Embed Subtitles بدلاً من ذلك.
- تحديثات التقدم متاحة عبر SSE على `GET /api/v1/jobs/{jobId}/progress` حتى تكتمل المهمة.
