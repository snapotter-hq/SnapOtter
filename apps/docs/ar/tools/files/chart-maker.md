---
description: "إنشاء رسوم بيانية شريطية أو خطية أو دائرية من بيانات CSV أو JSON."
i18n_source_hash: d3c39384457b
i18n_provenance: human
i18n_output_hash: 86faa18c2007
---

# صانع الرسوم البيانية {#chart-maker}

أنشئ رسومًا بيانية شريطية أو خطية أو دائرية من بيانات CSV أو JSON. يُرجع صورة PNG للرسم البياني المُصيَّر.

## نقطة نهاية API {#api-endpoint}

`POST /api/v1/tools/files/chart-maker`

يقبل بيانات نموذج متعدد الأجزاء تحتوي على ملف CSV أو JSON وحقل JSON بصيغة `settings`.

## المعاملات {#parameters}

| المعامل | النوع | مطلوب | الافتراضي | الوصف |
|-----------|------|----------|---------|-------------|
| kind | string | لا | `"bar"` | نوع الرسم البياني: `bar`، `line`، `pie` |
| title | string | لا | - | عنوان الرسم البياني (بحد أقصى 120 حرفًا) |
| width | integer | لا | `960` | عرض الرسم البياني بالبكسل (320-2048) |
| height | integer | لا | `540` | ارتفاع الرسم البياني بالبكسل (240-1536) |

## مثال على الطلب {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/chart-maker \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@sales.csv" \
  -F 'settings={"kind": "line", "title": "Monthly Sales", "width": 960, "height": 540}'
```

## مثال على الاستجابة {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/sales_chart.png",
  "originalSize": 1024,
  "processedSize": 48500
}
```

## ملاحظات {#notes}

- يجب أن يكون الدخل ملف `.csv` أو `.json`. ينبغي أن تحتوي ملفات CSV على صف ترويسة يضم أسماء الأعمدة.
- يُستخدم العمود الأول كتسمية للفئة؛ ويجب أن يكون العمود الثاني رقميًا ويوفّر قيم البيانات. يُستخدم عمودان فقط.
- ينبغي أن يكون دخل JSON مصفوفة من كائنات `{label, value}`، أو كائنًا بسيطًا تصبح مفاتيحه تسميات وقيمه نقاط بيانات.
- بحد أقصى 100 نقطة بيانات. يجب أن تكون جميع القيم صفرًا أو أكبر.
- الخرج دائمًا صورة PNG بغضّ النظر عن تنسيق الدخل.
