---
description: "تحويل ملف PDF إلى مستند Word (DOCX)."
i18n_source_hash: be41b6b49f84
i18n_provenance: human
i18n_output_hash: db57b8202eb1
---

# PDF to Word {#pdf-to-word}

حوّل ملف PDF قائماً على النص إلى مستند Word (DOCX). الأنسب لملفات PDF ذات النص القابل للتحديد؛ ستحتاج الصفحات الممسوحة ضوئياً إلى OCR أولاً.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-to-word`

يقبل بيانات نموذج multipart تحتوي على ملف PDF.

## Parameters {#parameters}

ليس لهذه الأداة أي معاملات قابلة للتهيئة. ارفع ملف PDF وسيُحوَّل إلى DOCX.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-word \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf"
```

## Example Response {#example-response}

يُعيد `202 Accepted`. تتبّع التقدّم عبر SSE على `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- صيغة الإدخال المقبولة: `.pdf`.
- يعمل على أفضل وجه مع ملفات PDF القائمة على النص. ستُنتِج الصفحات الممسوحة ضوئياً أو القائمة على الصور فقط مخرجات فارغة أو ضئيلة؛ استخدم [PDF OCR](./ocr-pdf) لإضافة طبقة نصية أولاً.
- يتولّى LibreOffice، الذي يعمل بلا واجهة رسومية على الخادم، عملية التحويل.
- قد لا تُحوَّل التخطيطات المعقّدة (متعددة الأعمدة، والعناصر المتداخلة) بشكل مثالي.
