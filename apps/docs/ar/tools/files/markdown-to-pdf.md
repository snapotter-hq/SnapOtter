---
description: "تحويل ملف Markdown إلى PDF منسّق."
i18n_source_hash: 18474dc8772a
i18n_provenance: human
i18n_output_hash: cc9d163a23e6
---

# Markdown إلى PDF {#markdown-to-pdf}

حوّل ملف Markdown إلى مستند PDF منسّق. المصادر البعيدة معطّلة حفاظًا على الخصوصية.

## نقطة نهاية API {#api-endpoint}

`POST /api/v1/tools/files/markdown-to-pdf`

يقبل بيانات نموذج متعدّد الأجزاء (multipart) مع ملف Markdown.

## المعاملات {#parameters}

لا تحتوي هذه الأداة على أي معاملات قابلة للضبط. ارفع ملف Markdown وسيُحوَّل إلى PDF.

## مثال على الطلب {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/markdown-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.md"
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

- صيغ الإدخال المقبولة: `.md`، `.markdown`.
- المصادر البعيدة (الصور وأوراق الأنماط المُشار إليها عبر روابط URL) لا تُجلب حفاظًا على الخصوصية والأمان.
- يُصيَّر Markdown أولًا إلى HTML، ثم يُحوَّل إلى PDF عبر WeasyPrint.
- تُنسَّق كتل الشيفرة والجداول وعناصر Markdown الأخرى في مخرجات PDF.
