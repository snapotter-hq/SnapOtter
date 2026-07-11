---
description: "ملء الأشرطة بنسخة مموّهة من الفيديو."
i18n_source_hash: 0c72aaefc6de
i18n_provenance: human
i18n_output_hash: 5650dd0bf91d
---

# Blur Pad {#blur-pad}

لائم مقطع فيديو ضمن نسبة أبعاد مستهدفة عن طريق ملء منطقة الحشو بنسخة مموّهة ومُقيَّسة من الفيديو بدلاً من أشرطة بلون خالص.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/blur-pad`

يقبل بيانات نموذج multipart تحتوي على ملف فيديو وحقل `settings` بصيغة JSON.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| target | string | No | `"16:9"` | نسبة الأبعاد المستهدفة: `16:9` أو `9:16` أو `1:1` أو `4:3` أو `3:4` |
| blur | number | No | `20` | قيمة sigma للتمويه الغاوسي للخلفية (من 2 إلى 50) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/blur-pad \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"target": "16:9", "blur": 30}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 14100000
}
```

## Notes {#notes}

- تُنتِج قيم التمويه الأعلى خلفية أنعم وأكثر تجريداً. وتُبقي القيم الأقل مزيداً من التفاصيل مرئية.
- إذا كان الفيديو يطابق بالفعل نسبة الأبعاد المستهدفة، يُعاد الملف دون تغيير.
- للحشو بلون خالص، استخدم أداة Aspect Pad بدلاً من ذلك.
