---
description: "التحويل بين JSON وXML، في الاتجاهين."
i18n_source_hash: b3a6ded0c64a
i18n_provenance: human
i18n_output_hash: 710bea199247
---

# JSON إلى XML {#json-to-xml}

حوِّل بين تنسيقي JSON وXML في الاتجاهين. ارفع ملف JSON للحصول على XML، أو ارفع ملف XML للحصول على JSON.

## نقطة نهاية API {#api-endpoint}

`POST /api/v1/tools/files/json-xml`

يقبل بيانات نموذج متعدد الأجزاء تحتوي على ملف JSON أو XML وحقل JSON بصيغة `settings`.

## المعاملات {#parameters}

| المعامل | النوع | مطلوب | الافتراضي | الوصف |
|-----------|------|----------|---------|-------------|
| pretty | boolean | لا | `true` | طباعة الخرج بتنسيق أنيق مع مسافات بادئة |

## مثال على الطلب {#example-request}

JSON إلى XML:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/json-xml \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@config.json" \
  -F 'settings={"pretty": true}'
```

XML إلى JSON:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/json-xml \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@config.xml" \
  -F 'settings={"pretty": true}'
```

## مثال على الاستجابة {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/config.xml",
  "originalSize": 850,
  "processedSize": 1200
}
```

## ملاحظات {#notes}

- يُكتشف اتجاه التحويل تلقائيًا من امتداد ملف الدخل: `.json` يُنتج `.xml`، و`.xml` يُنتج `.json`.
- ينطبق المعامل `pretty` في الاتجاهين. عند `false`، يكون الخرج مضغوطًا بلا مسافات بادئة.
- تُحفَظ سمات XML والبنى المتداخلة أثناء التحويل ذهابًا وإيابًا حيثما أمكن.
