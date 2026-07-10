---
description: "التحويل بين تنسيقي عروض PowerPoint وOpenDocument."
i18n_source_hash: 08ba415d39ac
i18n_provenance: human
i18n_output_hash: f73f9a990240
---

# تحويل العرض التقديمي {#convert-presentation}

حوِّل العروض التقديمية بين تنسيقي PowerPoint (PPTX) وOpenDocument Presentation (ODP).

## نقطة نهاية API {#api-endpoint}

`POST /api/v1/tools/files/convert-presentation`

يقبل بيانات نموذج متعدد الأجزاء تحتوي على ملف PowerPoint/ODP وحقل JSON بصيغة `settings`.

## المعاملات {#parameters}

| المعامل | النوع | مطلوب | الافتراضي | الوصف |
|-----------|------|----------|---------|-------------|
| format | string | نعم | - | تنسيق الخرج: `pptx`، `odp` |

## مثال على الطلب {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-presentation \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@slides.pptx" \
  -F 'settings={"format": "odp"}'
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

- تنسيقات الدخل المقبولة: `.pptx`، `.ppt`، `.odp`.
- يتولّى LibreOffice المعالجة أثناء تشغيله بلا واجهة رسومية على الخادم.
- قد لا تُحفَظ الرسوم المتحركة وتأثيرات الانتقال عبر التنسيقات.
- يجب أن يختلف تنسيق الخرج عن تنسيق الدخل.
