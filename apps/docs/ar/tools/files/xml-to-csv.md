---
description: "استخراج العناصر المتكرّرة من XML إلى جدول CSV."
i18n_source_hash: 3ab1019bff8a
i18n_provenance: human
i18n_output_hash: 15935b7b23f0
---

# XML إلى CSV {#xml-to-csv}

استخرج العناصر المتكرّرة من ملف XML إلى جدول CSV مسطّح. تعثر الأداة تلقائيًا على أول مصفوفة كائنات في شجرة XML وتُطابِق كل عنصر بصف.

## نقطة نهاية API {#api-endpoint}

`POST /api/v1/tools/files/xml-to-csv`

يقبل بيانات نموذج متعدّد الأجزاء (multipart) مع ملف XML. لا يلزم حقل إعدادات.

## المعاملات {#parameters}

لا تحتوي هذه الأداة على أي معاملات قابلة للضبط. يُكتشَف العنصر المتكرّر تلقائيًا من بنية XML.

## مثال على الطلب {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/xml-to-csv \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@catalog.xml"
```

## مثال على الاستجابة {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/catalog.csv",
  "originalSize": 4500,
  "processedSize": 1800
}
```

## ملاحظات {#notes}

- تُقبل ملفات `.xml` فقط كمدخلات.
- تفحص الأداة شجرة XML بحثًا عن أول مجموعة متكرّرة من العناصر الشقيقة وتستخدمها كصفوف.
- يصبح كل اسم عنصر ابن أو سمة فريد رأس عمود في CSV.
- هذا تحويل باتجاه واحد. للتحويل ثنائي الاتجاه بين JSON/XML، استخدم أداة [JSON إلى XML](/ar/tools/files/json-xml).
