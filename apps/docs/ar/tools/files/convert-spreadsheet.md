---
description: "التحويل بين تنسيقات Excel وOpenDocument وCSV."
i18n_source_hash: b813b1b06962
i18n_provenance: human
i18n_output_hash: be8ee7d025b4
---

# تحويل جدول البيانات {#convert-spreadsheet}

حوِّل جداول البيانات بين تنسيقات Excel (XLSX) وOpenDocument Spreadsheet (ODS) وCSV. تصدّر المصنّفات متعددة الأوراق الورقة الأولى عند التحويل إلى CSV.

## نقطة نهاية API {#api-endpoint}

`POST /api/v1/tools/files/convert-spreadsheet`

يقبل بيانات نموذج متعدد الأجزاء تحتوي على ملف Excel/ODS/CSV وحقل JSON بصيغة `settings`.

## المعاملات {#parameters}

| المعامل | النوع | مطلوب | الافتراضي | الوصف |
|-----------|------|----------|---------|-------------|
| format | string | نعم | - | تنسيق الخرج: `xlsx`، `ods`، `csv` |

## مثال على الطلب {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-spreadsheet \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@data.xlsx" \
  -F 'settings={"format": "csv"}'
```

## مثال على الاستجابة {#example-response}

يُرجع `202 Accepted`. تابع التقدم عبر SSE على `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## ملاحظات {#notes}

- تنسيقات الدخل المقبولة: `.xlsx`، `.xls`، `.ods`، `.csv`.
- عند تحويل مصنّف متعدد الأوراق إلى CSV، تُصدَّر الورقة الأولى فقط.
- تُقيَّم الصيغ وتُصدَّر كقيم ثابتة في خرج CSV.
- يجب أن يختلف تنسيق الخرج عن تنسيق الدخل.
