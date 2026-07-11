---
description: "إعادة ترتيب الصفحات في ملف PDF بترتيب صفحات صريح."
i18n_source_hash: e961fc895b4b
i18n_provenance: human
i18n_output_hash: 72f4969229db
---

# Organize PDF {#organize-pdf}

أعد ترتيب الصفحات في ملف PDF بتحديد تسلسل الصفحات المطلوب.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/organize-pdf`

يقبل بيانات نموذج multipart تحتوي على ملف PDF وحقل `settings` بصيغة JSON.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| order | string | Yes | - | ترتيب الصفحات المطلوب بصيغة qpdf، مثل `"3,1,2,5-z"` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/organize-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"order": "3,1,2,5-z"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2450000
}
```

## Notes {#notes}

- تستخدم نطاقات الصفحات صيغة qpdf: يعيد `3,1,2` ترتيب الصفحات الثلاث الأولى، ويُلحِق `5-z` الصفحات من 5 حتى الأخيرة.
- يمكن تكرار الصفحات بإدراجها أكثر من مرة (مثل `"1,1,2,3"` الذي يكرّر الصفحة 1).
- تُحذف الصفحات غير المدرَجة في سلسلة الترتيب من المخرجات.
