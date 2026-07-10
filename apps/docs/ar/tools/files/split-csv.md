---
description: "تقسيم ملف CSV إلى ملفات أصغر حسب عدد الصفوف."
i18n_source_hash: a35dce4a99a3
i18n_provenance: human
i18n_output_hash: 1d8010ec49a4
---

# تقسيم CSV {#split-csv}

قسّم ملف CSV أو TSV كبيرًا إلى ملفات أصغر حسب عدد الصفوف. تُرجع أرشيف ZIP يحتوي على الأجزاء.

## نقطة نهاية API {#api-endpoint}

`POST /api/v1/tools/files/split-csv`

يقبل بيانات نموذج متعدّد الأجزاء (multipart) مع ملف CSV وحقل `settings` بصيغة JSON.

## المعاملات {#parameters}

| المعامل | النوع | مطلوب | الافتراضي | الوصف |
|-----------|------|----------|---------|-------------|
| rowsPerFile | integer | لا | `1000` | عدد صفوف البيانات لكل ملف مخرَج (1-1,000,000) |
| keepHeader | boolean | لا | `true` | تكرار صف الرأس في كل ملف مخرَج |

## مثال على الطلب {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/split-csv \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@large-dataset.csv" \
  -F 'settings={"rowsPerFile": 500, "keepHeader": true}'
```

## مثال على الاستجابة {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/large-dataset_parts.zip",
  "originalSize": 1048576,
  "processedSize": 1050000
}
```

## ملاحظات {#notes}

- المخرجات دائمًا أرشيف ZIP يحتوي على أجزاء CSV المقسّمة، مُسمّاة تسلسليًا (مثل `part-1.csv`، `part-2.csv`).
- عندما تكون قيمة `keepHeader` هي `true`، يتضمّن كل جزء صف الرأس الأصلي بحيث يمكن استخدام كل ملف بمفرده.
- تُقبل ملفات CSV وTSV معًا كمدخلات.
- يشير عدد الصفوف إلى صفوف البيانات فقط؛ ولا يُحتسب صف الرأس.
