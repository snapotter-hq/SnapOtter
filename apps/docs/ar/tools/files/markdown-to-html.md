---
description: "تحويل ملف Markdown إلى صفحة HTML مستقلة."
i18n_source_hash: 3ef805e8fc8c
i18n_provenance: human
i18n_output_hash: 047ff0e9cd89
---

# Markdown إلى HTML {#markdown-to-html}

حوِّل ملف Markdown إلى صفحة HTML مستقلة. تُترك الصور البعيدة المشار إليها في المصدر كما هي في الخرج.

## نقطة نهاية API {#api-endpoint}

`POST /api/v1/tools/files/markdown-to-html`

يقبل بيانات نموذج متعدد الأجزاء تحتوي على ملف Markdown.

## المعاملات {#parameters}

ليس لهذه الأداة معاملات قابلة للتهيئة. ارفع ملف Markdown وسيُحوَّل إلى HTML.

## مثال على الطلب {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/markdown-to-html \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@notes.md"
```

## مثال على الاستجابة {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/notes.html",
  "originalSize": 3200,
  "processedSize": 5800
}
```

## ملاحظات {#notes}

- تنسيقات الدخل المقبولة: `.md`، `.markdown`.
- هذه أداة سريعة (متزامنة) تُرجع النتيجة مباشرةً.
- الخرج صفحة HTML قائمة بذاتها بأنماط مضمّنة.
- تُحفَظ روابط الصور البعيدة في مصدر Markdown كما هي ولا تُجلب.
