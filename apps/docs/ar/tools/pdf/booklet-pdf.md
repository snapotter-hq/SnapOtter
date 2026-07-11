---
description: "ترتيب صفحات PDF لطيّها في كتيّب."
i18n_source_hash: 8844b6d4fe96
i18n_provenance: human
i18n_output_hash: d7c73c53660e
---

# كتيّب PDF {#booklet-pdf}

رتّب الصفحات للطباعة على الوجهين بحيث يمكن طيّ الأوراق المطبوعة لتكوين كتيّب.

## نقطة نهاية API {#api-endpoint}

`POST /api/v1/tools/pdf/booklet-pdf`

تقبل بيانات نموذج متعدد الأجزاء تحتوي على ملف PDF وحقل `settings` بصيغة JSON.

## المعاملات {#parameters}

| المعامل | النوع | مطلوب | الافتراضي | الوصف |
|-----------|------|----------|---------|-------------|
| perSheet | integer | لا | `2` | عدد الصفحات لكل ورقة: `2`، `4`، `6`، أو `8` |

## مثال طلب {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/booklet-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"perSheet": 2}'
```

## مثال استجابة {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2400000
}
```

## ملاحظات {#notes}

- يضع الافتراضي `perSheet: 2` صفحتين جنبًا إلى جنب على كل ورقة، وهو التخطيط القياسي للكتيّب في الطباعة على الوجهين.
- تُضاف صفحات فارغة تلقائيًا إذا لم يكن إجمالي عدد الصفحات مضاعفًا لحجم الورقة.
- اطبع المخرجات على الوجهين بربط الحافة القصيرة، ثم اطوِ ودبّس.
