---
description: "تدوير الصفحات في ملف PDF بمقدار 90 أو 180 أو 270 درجة."
i18n_source_hash: cc2acd091427
i18n_provenance: human
i18n_output_hash: 02e29f2aaa6d
---

# Rotate PDF {#rotate-pdf}

دوّر جميع الصفحات أو صفحات مختارة في ملف PDF بزاوية محدّدة.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/rotate-pdf`

يقبل بيانات نموذج multipart تحتوي على ملف PDF وحقل `settings` بصيغة JSON.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| angle | integer | No | `90` | زاوية التدوير: `90` أو `180` أو `270` |
| range | string | No | `"1-z"` | نطاق الصفحات بصيغة qpdf، مثل `"1-5,8"` (`"1-z"` = جميع الصفحات) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/rotate-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"angle": 90, "range": "1-3"}'
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

- التدوير في اتجاه عقارب الساعة.
- تستخدم نطاقات الصفحات صيغة qpdf: `1-5` للصفحات من 1 إلى 5، و`z` للصفحة الأخيرة، والفواصل لدمج النطاقات.
- يدوّر النطاق الافتراضي `"1-z"` جميع الصفحات.
