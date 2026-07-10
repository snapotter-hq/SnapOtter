---
description: "التحويل بين CSV وJSON، في الاتجاهين."
i18n_source_hash: 978c08ad46d3
i18n_provenance: human
i18n_output_hash: beb106cfa248
---

# CSV إلى JSON {#csv-to-json}

حوِّل بين تنسيقي CSV وJSON في الاتجاهين. ارفع ملف CSV أو TSV للحصول على مصفوفة JSON من الكائنات، أو ارفع مصفوفة JSON للحصول على ملف CSV.

## نقطة نهاية API {#api-endpoint}

`POST /api/v1/tools/files/csv-json`

يقبل بيانات نموذج متعدد الأجزاء تحتوي على ملف CSV أو TSV أو JSON وحقل JSON بصيغة `settings`.

## المعاملات {#parameters}

| المعامل | النوع | مطلوب | الافتراضي | الوصف |
|-----------|------|----------|---------|-------------|
| pretty | boolean | لا | `true` | طباعة خرج JSON بتنسيق أنيق مع مسافات بادئة |

## مثال على الطلب {#example-request}

CSV إلى JSON:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/csv-json \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@users.csv" \
  -F 'settings={"pretty": true}'
```

JSON إلى CSV:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/csv-json \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@users.json" \
  -F 'settings={}'
```

## مثال على الاستجابة {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/users.json",
  "originalSize": 1500,
  "processedSize": 2200
}
```

## ملاحظات {#notes}

- يُكتشف اتجاه التحويل تلقائيًا من امتداد ملف الدخل: `.csv` أو `.tsv` يُنتج `.json`، و`.json` يُنتج `.csv`.
- يؤثّر المعامل `pretty` في خرج JSON فقط. عند ضبطه على `false`، يكون الخرج سلسلة JSON مضغوطة في سطر واحد.
- يجب أن يكون دخل JSON مصفوفة من الكائنات ذات مفاتيح متسقة. يصبح كل كائن صفًّا، ويصبح كل مفتاح ترويسة عمود.
- تُدعَم ملفات TSV (قيم مفصولة بعلامات جدولة) إلى جانب CSV.
