---
description: "إضافة أشرطة بلون خالص لملاءمة نسبة أبعاد مستهدفة."
i18n_source_hash: b8e17dffc341
i18n_provenance: human
i18n_output_hash: dac6d6efda7e
---

# Aspect Pad {#aspect-pad}

أضف أشرطة letterbox أو pillarbox بلون خالص لملاءمة مقطع فيديو ضمن نسبة أبعاد مستهدفة دون اقتصاص.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/aspect-pad`

يقبل بيانات نموذج multipart تحتوي على ملف فيديو وحقل `settings` بصيغة JSON.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| target | string | No | `"9:16"` | نسبة الأبعاد المستهدفة: `16:9` أو `9:16` أو `1:1` أو `4:3` أو `3:4` |
| color | string | No | `"#000000"` | لون سداسي عشري لأشرطة الحشو (مثل `"#000000"` للأسود) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/aspect-pad \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"target": "1:1", "color": "#ffffff"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 13200000
}
```

## Notes {#notes}

- إذا كان الفيديو يطابق بالفعل نسبة الأبعاد المستهدفة، يُعاد الملف دون تغيير.
- استخدم `9:16` لصيغ وسائل التواصل الاجتماعي العمودية/الطولية (TikTok وReels وShorts).
- للحشو المموّه بدلاً من اللون الخالص، استخدم أداة Blur Pad.
