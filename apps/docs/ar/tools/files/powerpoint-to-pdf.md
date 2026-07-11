---
description: "تحويل العروض التقديمية إلى PDF."
i18n_source_hash: 49bd71c46bed
i18n_provenance: human
i18n_output_hash: 617c72fc3890
---

# PowerPoint إلى PDF {#powerpoint-to-pdf}

حوّل عروض PowerPoint أو OpenDocument التقديمية إلى PDF، بشريحة واحدة لكل صفحة.

## نقطة نهاية API {#api-endpoint}

`POST /api/v1/tools/files/powerpoint-to-pdf`

يقبل بيانات نموذج متعدّد الأجزاء (multipart) مع ملف PowerPoint/ODP.

## المعاملات {#parameters}

لا تحتوي هذه الأداة على أي معاملات قابلة للضبط. ارفع عرضًا تقديميًا وسيُحوَّل إلى PDF.

## مثال على الطلب {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/powerpoint-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@slides.pptx"
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

- صيغ الإدخال المقبولة: `.pptx`، `.ppt`، `.odp`.
- تصبح كل شريحة صفحة واحدة في PDF.
- يتولّى التحويل LibreOffice المُشغَّل بدون واجهة رسومية على الخادم.
- الرسوم المتحركة والانتقالات غير مُدرَجة في مخرجات PDF.
