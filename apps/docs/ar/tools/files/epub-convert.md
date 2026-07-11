---
description: "تحويل EPUB إلى PDF أو DOCX أو HTML أو Markdown."
i18n_source_hash: 7d94fc18ca97
i18n_provenance: human
i18n_output_hash: 6aead6a9ebc1
---

# تحويل EPUB {#convert-epub}

حوِّل كتاب EPUB الإلكتروني إلى PDF أو Word (DOCX) أو HTML أو Markdown. لا تُجلب الموارد البعيدة داخل الكتاب.

## نقطة نهاية API {#api-endpoint}

`POST /api/v1/tools/files/epub-convert`

يقبل بيانات نموذج متعدد الأجزاء تحتوي على ملف EPUB وحقل JSON بصيغة `settings`.

## المعاملات {#parameters}

| المعامل | النوع | مطلوب | الافتراضي | الوصف |
|-----------|------|----------|---------|-------------|
| format | string | نعم | - | تنسيق الخرج: `pdf`، `docx`، `html`، `md` |

## مثال على الطلب {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/epub-convert \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@book.epub" \
  -F 'settings={"format": "pdf"}'
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

- تنسيق الدخل المقبول: `.epub`.
- لا تُجلب الموارد البعيدة المضمّنة في EPUB (الصور والخطوط الخارجية) لأسباب أمنية.
- قد تتفاوت دقة الصور في الخرج المُحوَّل تبعًا لبنية EPUB.
- يتولّى Pandoc المعالجة على الخادم.
