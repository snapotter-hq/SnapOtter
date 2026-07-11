---
description: "سحب صفحات مختارة من ملف PDF إلى مستند جديد."
i18n_source_hash: e4a8fad31e0f
i18n_provenance: human
i18n_output_hash: 45a03f697ee0
---

# Extract Pages {#extract-pages}

اسحب صفحات مختارة من ملف PDF إلى مستند جديد أصغر.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/extract-pages`

يقبل بيانات نموذج multipart تحتوي على ملف PDF وحقل `settings` بصيغة JSON.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| range | string | Yes | - | نطاق الصفحات بصيغة qpdf، مثل `"1-5,8,10-z"` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/extract-pages \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"range": "1-5,8,10-z"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 3200000,
  "processedSize": 1100000
}
```

## Notes {#notes}

- تستخدم نطاقات الصفحات صيغة qpdf: `1-5` للصفحات من 1 إلى 5، و`z` للصفحة الأخيرة، والفواصل لدمج النطاقات (مثل `1-3,7,10-z`).
- تحتفظ الصفحات المستخرَجة بتنسيقها الأصلي وتعليقاتها التوضيحية وروابطها.
