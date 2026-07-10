---
description: "تحويل صورة GIF متحركة إلى فيديو MP4 أو WebM أو MOV."
i18n_source_hash: c3737b31146d
i18n_provenance: human
i18n_output_hash: 316ac7005247
---

# GIF to Video {#gif-to-video}

تحويل صورة GIF متحركة إلى ملف فيديو MP4 أو WebM أو MOV مضغوط.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/gif-to-video`

يقبل بيانات نموذج متعدد الأجزاء تحتوي على ملف GIF وحقل JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | No | `"mp4"` | صيغة الإخراج: `mp4` أو `webm` أو `mov` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/gif-to-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@animation.gif" \
  -F 'settings={"format": "mp4"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/animation.mp4",
  "originalSize": 8500000,
  "processedSize": 950000
}
```

## Notes {#notes}

- عادةً ما يقلل تحويل GIF إلى فيديو حجم الملف بنسبة 80-90% مع الحفاظ على نفس جودة الصورة.
- تُقبَل ملفات GIF المتحركة فقط. يجب أن تستخدم الصور الثابتة أداة Convert للصور.
- يستخدم MP4 وMOV ترميز H.264، ويستخدم WebM ترميز VP9.
