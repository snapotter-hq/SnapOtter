---
description: "قص مقطع من الفيديو بتحديد وقتي البداية والنهاية."
i18n_source_hash: c84481641979
i18n_provenance: human
i18n_output_hash: bc478479257d
---

# Trim Video {#trim-video}

قص مقطع من الفيديو بتحديد وقتي البداية والنهاية بالثواني، مع خيار للقص الدقيق على مستوى الإطار.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/trim-video`

يقبل بيانات نموذج متعدد الأجزاء تحتوي على ملف فيديو وحقل JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| startS | number | No | `0` | وقت البداية بالثواني (يجب أن يكون >= 0) |
| endS | number | Yes | - | وقت النهاية بالثواني (يجب أن يكون بعد startS) |
| precise | boolean | No | `false` | إعادة الترميز للقص الدقيق على مستوى الإطار بدلاً من البحث عن الإطار المفتاحي |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/trim-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"startS": 5, "endS": 30, "precise": true}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 4200000
}
```

## Notes {#notes}

- عندما تكون `precise` هي `false` (الافتراضي)، تستخدم الأداة البحث عن الإطار المفتاحي، وهو سريع لكنه قد يبدأ قبل الوقت المطلوب ببضعة إطارات.
- تعيين `precise` إلى `true` يعيد ترميز المقطع للحصول على حدود إطار دقيقة، لكنه يستغرق وقتاً أطول.
- يجب أن تكون قيمة `endS` أكبر من `startS`.
