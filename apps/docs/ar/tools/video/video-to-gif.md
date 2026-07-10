---
description: "تحويل مقطع فيديو إلى صورة GIF متحركة."
i18n_source_hash: f729dde8cd55
i18n_provenance: human
i18n_output_hash: 529548e3eae3
---

# Video to GIF {#video-to-gif}

تحويل مقطع فيديو إلى صورة GIF متحركة مع معدل إطارات وعرض ووقت بداية ومدة قابلة للتهيئة.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-to-gif`

يقبل بيانات نموذج متعدد الأجزاء تحتوي على ملف فيديو وحقل JSON `settings`. هذه نقطة نهاية غير متزامنة - تُرجع `202 Accepted` فوراً ويُبَثّ التقدم عبر SSE على `GET /api/v1/jobs/{jobId}/progress`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fps | integer | No | `12` | معدل إطارات الإخراج (1-30) |
| width | integer | No | `480` | عرض الإخراج بالبكسل (64-1280). يتغير الارتفاع بشكل متناسب |
| startS | number | No | `0` | وقت البداية بالثواني (يجب أن يكون >= 0) |
| durationS | number | No | `5` | المدة بالثواني (أكبر من 0، بحد أقصى 60) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-gif \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"fps": 15, "width": 320, "startS": 2, "durationS": 8}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- تنتج قيم `fps` و`width` الأقل ملفات GIF أصغر. عادةً ما يكون GIF بعرض 480 بكسل عند 12 إطاراً في الثانية توازناً جيداً.
- أقصى مدة هي 60 ثانية. تنتج المقاطع الأطول ملفات كبيرة جداً.
- تحديثات التقدم متاحة عبر SSE على `GET /api/v1/jobs/{jobId}/progress` حتى تكتمل المهمة.
