---
description: "تحويل ملف HTML إلى PDF."
i18n_source_hash: 20b9ae147db5
i18n_provenance: human
i18n_output_hash: b2aca2c04399
---

# HTML إلى PDF {#html-to-pdf}

حوِّل ملف HTML إلى مستند PDF منسّق. تُعطَّل الموارد البعيدة (الصور وأوراق الأنماط والنصوص البرمجية الخارجية) للحفاظ على الخصوصية.

## نقطة نهاية API {#api-endpoint}

`POST /api/v1/tools/files/html-to-pdf`

يقبل بيانات نموذج متعدد الأجزاء تحتوي على ملف HTML.

## المعاملات {#parameters}

ليس لهذه الأداة معاملات قابلة للتهيئة. ارفع ملف HTML وسيُحوَّل إلى PDF.

## مثال على الطلب {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/html-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@page.html"
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

- تنسيقات الدخل المقبولة: `.html`، `.htm`.
- لا تُجلب الموارد البعيدة (الصور وأوراق الأنماط والنصوص البرمجية المشار إليها عبر روابط URL) حفاظًا على الخصوصية والأمان.
- تُحفَظ الأنماط المضمّنة والصور المدمجة (روابط data URI).
- يتولّى WeasyPrint المعالجة على الخادم.
