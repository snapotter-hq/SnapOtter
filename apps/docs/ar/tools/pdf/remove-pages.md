---
description: "حذف صفحات محدّدة من ملف PDF."
i18n_source_hash: 003e460a047c
i18n_provenance: human
i18n_output_hash: 1cc8739214b4
---

# Remove Pages {#remove-pages}

احذف صفحات محدّدة من ملف PDF، مع الحفاظ على جميع الصفحات المتبقية سليمة.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/remove-pages`

يقبل بيانات نموذج multipart تحتوي على ملف PDF وحقل `settings` بصيغة JSON.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| pages | string | Yes | - | نطاق الصفحات المراد حذفها بصيغة qpdf، مثل `"3,5-7"` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/remove-pages \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"pages": "3,5-7"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 1800000
}
```

## Notes {#notes}

- لا يمكنك حذف كل صفحة من المستند؛ يجب أن تبقى صفحة واحدة على الأقل.
- تستخدم نطاقات الصفحات صيغة qpdf: `3` لصفحة واحدة، و`5-7` لنطاق، والفواصل للدمج (مثل `1,3,5-7`).
