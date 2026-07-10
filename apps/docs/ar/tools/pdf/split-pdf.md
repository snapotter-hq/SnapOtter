---
description: "استخراج صفحات أو تقسيم ملف PDF إلى أجزاء."
i18n_source_hash: 5c8d8041d219
i18n_provenance: human
i18n_output_hash: a54bcf3b9649
---

# Split PDF {#split-pdf}

استخرج نطاقاً من الصفحات إلى ملف PDF جديد، أو قسّم مستنداً إلى أجزاء من N صفحة.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/split-pdf`

يقبل بيانات نموذج multipart تحتوي على ملف PDF وحقل `settings` بصيغة JSON.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `"range"` | وضع التقسيم: `range` أو `every` |
| range | string | عندما يكون الوضع `range` | - | نطاق الصفحات بصيغة qpdf، مثل `"1-5,8,10-z"` |
| everyN | integer | عندما يكون الوضع `every` | - | التقسيم إلى أجزاء من N صفحة (من 1 إلى 500) |

## Example Request {#example-request}

استخراج صفحات محدّدة:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/split-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"mode": "range", "range": "1-5,8"}'
```

التقسيم إلى أجزاء من 10 صفحات:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/split-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"mode": "every", "everyN": 10}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 980000
}
```

## Notes {#notes}

- في وضع `range`، يُعاد ملف PDF واحد يحتوي على الصفحات المحدّدة.
- في وضع `every`، تكون النتيجة أرشيف ZIP يحتوي على الأجزاء الفردية.
- تستخدم نطاقات الصفحات صيغة qpdf: `1-5` للصفحات من 1 إلى 5، و`z` للصفحة الأخيرة، والفواصل لدمج النطاقات (مثل `1-3,7,10-z`).
