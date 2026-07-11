---
description: "التحويل بين CSV وExcel (XLSX)، في الاتجاهين."
i18n_source_hash: 213297311e36
i18n_provenance: human
i18n_output_hash: 123daa125641
---

# CSV إلى Excel {#csv-to-excel}

حوِّل بين تنسيقي CSV وExcel (XLSX) في الاتجاهين. ارفع ملف CSV أو TSV للحصول على XLSX، أو ارفع ملف XLSX للحصول على CSV.

## نقطة نهاية API {#api-endpoint}

`POST /api/v1/tools/files/csv-excel`

يقبل بيانات نموذج متعدد الأجزاء تحتوي على ملف CSV أو TSV أو XLSX وحقل JSON بصيغة `settings`.

## المعاملات {#parameters}

| المعامل | النوع | مطلوب | الافتراضي | الوصف |
|-----------|------|----------|---------|-------------|
| sheet | integer | لا | `1` | رقم ورقة العمل المراد تصديرها عند التحويل من XLSX (الحد الأدنى 1) |

## مثال على الطلب {#example-request}

CSV إلى Excel:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/csv-excel \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@data.csv" \
  -F 'settings={"sheet": 1}'
```

Excel إلى CSV:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/csv-excel \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.xlsx" \
  -F 'settings={"sheet": 2}'
```

## مثال على الاستجابة {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/data.xlsx",
  "originalSize": 2048,
  "processedSize": 5120
}
```

## ملاحظات {#notes}

- يُكتشف اتجاه التحويل تلقائيًا من امتداد ملف الدخل: `.csv` أو `.tsv` يُنتج `.xlsx`، و`.xlsx` يُنتج `.csv`.
- ينطبق المعامل `sheet` فقط عند التحويل من XLSX. وهو يحدّد ورقة العمل المراد تصديرها.
- تُدعَم ملفات TSV (قيم مفصولة بعلامات جدولة) إلى جانب CSV.
