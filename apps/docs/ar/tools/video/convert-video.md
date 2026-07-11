---
description: "تحويل مقاطع الفيديو بين MP4 وMOV وWebM وAVI وMKV."
i18n_source_hash: 8f9e6418b1c6
i18n_provenance: human
i18n_output_hash: d637982bbc69
---

# Convert Video {#convert-video}

تحويل مقاطع الفيديو بين صيغ MP4 وMOV وWebM وAVI وMKV مع إعدادات جودة مسبقة قابلة للتهيئة.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/convert-video`

يقبل بيانات نموذج متعدد الأجزاء تحتوي على ملف فيديو وحقل JSON `settings`. هذه نقطة نهاية غير متزامنة - تُرجع `202 Accepted` فوراً ويُبَثّ التقدم عبر SSE على `GET /api/v1/jobs/{jobId}/progress`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | No | `"mp4"` | صيغة الإخراج: `mp4` أو `mov` أو `webm` أو `avi` أو `mkv` |
| quality | string | No | `"balanced"` | إعداد الجودة المسبق: `high` أو `balanced` أو `small` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/convert-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"format": "webm", "quality": "balanced"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- يُنتج إعداد الجودة المسبق `high` أفضل دقة صورة لكن بملفات أكبر. يضغط الإعداد المسبق `small` بقوة للحصول على أصغر حجم ملف.
- يستخدم إخراج WebM ترميز VP9. يستخدم MP4 وMOV ترميز H.264. تتوفر AVI وMKV لسير العمل القديم أو الأرشفة.
- تحديثات التقدم متاحة عبر SSE على `GET /api/v1/jobs/{jobId}/progress` حتى تكتمل المهمة.
