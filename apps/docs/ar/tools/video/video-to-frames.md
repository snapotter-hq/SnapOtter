---
description: "استخراج الإطارات من الفيديو كملف ZIP من الصور."
i18n_source_hash: b06f038dafb3
i18n_provenance: human
i18n_output_hash: 71437e257511
---

# Video to Frames {#video-to-frames}

استخراج إطارات فردية من الفيديو وتنزيلها كأرشيف ZIP من صور PNG أو JPG.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-to-frames`

يقبل بيانات نموذج متعدد الأجزاء تحتوي على ملف فيديو وحقل JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `"all"` | وضع الاستخراج: `all` أو `nth` أو `timestamps` |
| n | integer | No | `10` | استخراج كل إطار رقم N (2-1000). يُستخدَم فقط عندما يكون الوضع `"nth"` |
| timestamps | string | No | `""` | طوابع زمنية مفصولة بفواصل بالثواني. مطلوبة عندما يكون الوضع `"timestamps"` |
| format | string | No | `"png"` | صيغة صورة الإطارات المستخرجة: `png` أو `jpg` |

## Example Request {#example-request}

استخراج كل إطار رقم 30 بصيغة JPG:

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-frames \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"mode": "nth", "n": 30, "format": "jpg"}'
```

استخراج الإطارات عند طوابع زمنية محددة:

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-frames \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"mode": "timestamps", "timestamps": "1.5,5,12.3"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip-frames.zip",
  "originalSize": 12500000,
  "processedSize": 45000000
}
```

## Notes {#notes}

- يستخرج الوضع `all` كل إطار وقد ينتج ملفات ZIP كبيرة جداً لمقاطع الفيديو الطويلة. استخدم الوضع `nth` أو `timestamps` للاستخراج الانتقائي.
- يحافظ PNG على الجودة الكاملة لكنه ينتج ملفات أكبر. JPG أصغر لكنه ذو فقد.
- تُنزَّل الاستجابة كأرشيف ZIP يحتوي على ملفات صور مرقّمة تسلسلياً.
