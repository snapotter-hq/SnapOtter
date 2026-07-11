---
description: "تسريع الفيديو أو إبطاؤه."
i18n_source_hash: 98dfc75c0507
i18n_provenance: human
i18n_output_hash: 80e3732ba3f5
---

# Video Speed {#video-speed}

تسريع الفيديو أو إبطاؤه مع خيار للحفاظ على طبقة الصوت.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-speed`

يقبل بيانات نموذج متعدد الأجزاء تحتوي على ملف فيديو وحقل JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| factor | number | No | `2` | مضاعِف السرعة (0.25-4). القيم الأعلى من 1 تُسرّع، والأقل من 1 تُبطئ |
| keepPitch | boolean | No | `true` | الحفاظ على طبقة الصوت عند تغيير السرعة |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-speed \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"factor": 0.5, "keepPitch": true}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 24800000
}
```

## Notes {#notes}

- عامل `2` يضاعف سرعة التشغيل (يقلل المدة إلى النصف). عامل `0.5` يقلل سرعة التشغيل إلى النصف (يضاعف المدة).
- عندما يكون `keepPitch` هو `true`، يُمَدّ الصوت زمنياً بحيث تبدو الأصوات طبيعية. عندما يكون `false`، تتغير طبقة الصوت بشكل متناسب مع السرعة.
- النطاق الصالح هو 0.25x إلى 4x.
