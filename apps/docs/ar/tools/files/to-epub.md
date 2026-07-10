---
description: "تحويل ملفات Word أو Markdown أو HTML أو النص العادي إلى EPUB."
i18n_source_hash: 63e1afa91c52
i18n_provenance: human
i18n_output_hash: 01936141b708
---

# التحويل إلى EPUB {#convert-to-epub}

حوّل مستندات Word أو Markdown أو HTML أو ملفات النص العادي إلى صيغة كتاب EPUB الإلكتروني.

## نقطة نهاية API {#api-endpoint}

`POST /api/v1/tools/files/to-epub`

يقبل بيانات نموذج متعدّد الأجزاء (multipart) مع ملف Word/Markdown/HTML/TXT.

## المعاملات {#parameters}

لا تحتوي هذه الأداة على أي معاملات قابلة للضبط. ارفع مستندًا وسيُحوَّل إلى EPUB.

## مثال على الطلب {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/to-epub \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@manuscript.docx"
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

- صيغ الإدخال المقبولة: `.docx`، `.md`، `.html`، `.txt`.
- تتّبع مخرجات EPUB مواصفة EPUB 3.
- تُستخدم العناوين في المستند المصدر لتوليد جدول المحتويات.
- يتولّى التحويل Pandoc على الخادم.
