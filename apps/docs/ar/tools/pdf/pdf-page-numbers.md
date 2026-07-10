---
description: "إضافة أرقام الصفحات إلى كل صفحة في ملف PDF."
i18n_source_hash: 58342d6ac8d2
i18n_provenance: human
i18n_output_hash: 34c0def55e9d
---

# PDF Page Numbers {#pdf-page-numbers}

أضف أرقام الصفحات بصيغة "Page N of M" إلى كل صفحة في ملف PDF.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-page-numbers`

يقبل بيانات نموذج multipart تحتوي على ملف PDF وحقل `settings` بصيغة JSON.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| position | string | No | `"bc"` | موضع رقم الصفحة: `bl` أو `bc` أو `br` أو `tl` أو `tc` أو `tr` |
| fontSize | integer | No | `10` | حجم الخط بالنقاط (من 6 إلى 24) |

### Position Values {#position-values}

- `tl` أعلى اليسار، `tc` أعلى الوسط، `tr` أعلى اليمين
- `bl` أسفل اليسار، `bc` أسفل الوسط، `br` أسفل اليمين

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-page-numbers \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"position": "bc", "fontSize": 12}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2470000
}
```

## Notes {#notes}

- تُعرض أرقام الصفحات بالصيغة "Page 1 of 10".
- تُضاف الأرقام إلى كل صفحة، بما في ذلك أي صفحات عنوان أو غلاف موجودة.
- يضع الموضع الافتراضي `"bc"` الأرقام في أسفل منتصف كل صفحة.
