---
description: "تحويل مستندات Word إلى PDF."
i18n_source_hash: f814ba1a1a53
i18n_provenance: human
i18n_output_hash: 708cf09a5c37
---

# Word إلى PDF {#word-to-pdf}

حوّل مستندات Word أو نصوص OpenDocument أو RTF أو ملفات النص العادي إلى PDF.

## نقطة نهاية API {#api-endpoint}

`POST /api/v1/tools/files/word-to-pdf`

يقبل بيانات نموذج متعدّد الأجزاء (multipart) مع ملف Word/ODT/RTF/TXT.

## المعاملات {#parameters}

لا تحتوي هذه الأداة على أي معاملات قابلة للضبط. ارفع مستندًا وسيُحوَّل إلى PDF.

## مثال على الطلب {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/word-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.docx"
```

## مثال على الاستجابة {#example-response}

تُرجع `202 Accepted`. تابِع التقدّم عبر SSE على `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## ملاحظات {#notes}

- صيغ الإدخال المقبولة: `.docx`، `.doc`، `.odt`، `.rtf`، `.txt`.
- يتولّى التحويل LibreOffice المُشغَّل بدون واجهة رسومية على الخادم.
- تُستخدم الخطوط المُضمَّنة في المستند عند توفّرها؛ وإلا استُبدلت بخطوط النظام.
- تُحفَظ الترويسات والتذييلات والجداول والصور في مخرجات PDF.
