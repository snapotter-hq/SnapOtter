---
description: "تحويل ملف Markdown إلى مستند Word (DOCX)."
i18n_source_hash: 979cb8ee13f2
i18n_provenance: human
i18n_output_hash: 36c0622bdb4f
---

# Markdown إلى Word {#markdown-to-word}

حوِّل ملف Markdown إلى مستند Word (DOCX)، مع الحفاظ على العناوين والقوائم وكتل الشيفرة وسائر التنسيق.

## نقطة نهاية API {#api-endpoint}

`POST /api/v1/tools/files/markdown-to-docx`

يقبل بيانات نموذج متعدد الأجزاء تحتوي على ملف Markdown.

## المعاملات {#parameters}

ليس لهذه الأداة معاملات قابلة للتهيئة. ارفع ملف Markdown وسيُحوَّل إلى DOCX.

## مثال على الطلب {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/markdown-to-docx \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@README.md"
```

## مثال على الاستجابة {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/README.docx",
  "originalSize": 4500,
  "processedSize": 18200
}
```

## ملاحظات {#notes}

- تنسيقات الدخل المقبولة: `.md`، `.markdown`.
- هذه أداة سريعة (متزامنة) تُرجع النتيجة مباشرةً.
- تُربَط العناوين والنص العريض والمائل والروابط وكتل الشيفرة والقوائم بأنماط Word.
- يتولّى Pandoc المعالجة على الخادم.
