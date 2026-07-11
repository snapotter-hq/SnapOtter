---
description: "تحويل جداول البيانات إلى PDF."
i18n_source_hash: 4dbe2a810ea6
i18n_provenance: human
i18n_output_hash: 08913bde74dc
---

# Excel إلى PDF {#excel-to-pdf}

حوِّل جداول بيانات Excel أو OpenDocument أو CSV إلى PDF. قد تُقسَّم الأوراق العريضة على صفحات متعددة.

## نقطة نهاية API {#api-endpoint}

`POST /api/v1/tools/files/excel-to-pdf`

يقبل بيانات نموذج متعدد الأجزاء تحتوي على ملف Excel/ODS/CSV.

## المعاملات {#parameters}

ليس لهذه الأداة معاملات قابلة للتهيئة. ارفع جدول بيانات وسيُحوَّل إلى PDF.

## مثال على الطلب {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/excel-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@budget.xlsx"
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
- قد تُقسَّم الأوراق العريضة على صفحات متعددة في PDF الناتج.
- تُصيَّر الرسوم البيانية والتنسيق الشرطي في خرج PDF.
- يتولّى LibreOffice المعالجة أثناء تشغيله بلا واجهة رسومية على الخادم.
