---
description: "ترتيب عدة صفحات PDF في كل ورقة (صفحتان لكل ورقة، أربع صفحات لكل ورقة، وهكذا)."
i18n_source_hash: 9dd82737cb72
i18n_provenance: human
i18n_output_hash: 903fc659cd1e
---

# N-up PDF {#n-up-pdf}

رتّب عدة صفحات في كل ورقة لتوفير الورق عند الطباعة، مثل تخطيطات صفحتين أو أربع صفحات لكل ورقة.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/nup-pdf`

يقبل بيانات نموذج multipart تحتوي على ملف PDF وحقل `settings` بصيغة JSON.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| perSheet | integer | No | `2` | عدد الصفحات لكل ورقة: `2` أو `3` أو `4` أو `8` أو `9` أو `12` أو `16` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/nup-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"perSheet": 4}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2300000
}
```

## Notes {#notes}

- تُرتَّب الصفحات بترتيب القراءة (من اليسار إلى اليمين، ومن الأعلى إلى الأسفل).
- يتطابق حجم صفحة المخرجات مع الأصل؛ تُصغَّر الصفحات الفردية لتناسب الشبكة.
- يُنتِج مستند من 20 صفحة مع `perSheet: 4` مخرجات من 5 صفحات.
