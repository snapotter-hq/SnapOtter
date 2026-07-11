---
description: "التحويل بين تنسيقات Word وOpenDocument وRTF والنص العادي."
i18n_source_hash: 89771292569d
i18n_provenance: human
i18n_output_hash: 947adc8e36b8
---

# تحويل المستند {#convert-document}

حوِّل المستندات بين تنسيقات Word (DOCX) وOpenDocument (ODT) وRTF والنص العادي باستخدام LibreOffice.

## نقطة نهاية API {#api-endpoint}

`POST /api/v1/tools/files/convert-document`

يقبل بيانات نموذج متعدد الأجزاء تحتوي على ملف Word/ODT/RTF/TXT وحقل JSON بصيغة `settings`.

## المعاملات {#parameters}

| المعامل | النوع | مطلوب | الافتراضي | الوصف |
|-----------|------|----------|---------|-------------|
| format | string | نعم | - | تنسيق الخرج: `docx`، `odt`، `rtf`، `txt` |

## مثال على الطلب {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-document \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.docx" \
  -F 'settings={"format": "odt"}'
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

- تنسيقات الدخل المقبولة: `.docx`، `.doc`، `.odt`، `.rtf`، `.txt`.
- يتولّى LibreOffice المعالجة أثناء تشغيله بلا واجهة رسومية على الخادم.
- قد لا يصمد التنسيق المعقّد (وحدات الماكرو، الكائنات المضمّنة) أثناء التحويل بين التنسيقات.
- يجب أن يختلف تنسيق الخرج عن تنسيق الدخل.
