---
description: "استخراج نص عادي من ملف PDF."
i18n_source_hash: 15a7bc1cdf8f
i18n_provenance: human
i18n_output_hash: f2ca0626bf35
---

# PDF to Text {#pdf-to-text}

استخرج كل النص العادي القابل للقراءة من مستند PDF إلى ملف نصّي.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-to-text`

يقبل بيانات نموذج multipart تحتوي على ملف PDF.

## Parameters {#parameters}

ليس لهذه الأداة أي معاملات قابلة للتهيئة. ارفع ملف PDF وسيُستخرج محتواه النصّي.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-text \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/report.txt",
  "originalSize": 520000,
  "processedSize": 14300,
  "chars": 14300
}
```

## Notes {#notes}

- صيغة الإدخال المقبولة: `.pdf`.
- هذه أداة سريعة (متزامنة) تُعيد النتيجة مباشرة.
- يشير حقل `chars` في الاستجابة إلى عدد الأحرف المستخرَجة.
- يُستخرج النص المضمّن رقمياً فقط. بالنسبة للمستندات الممسوحة ضوئياً أو ملفات PDF القائمة على الصور، استخدم أداة [PDF OCR](./ocr-pdf) بدلاً من ذلك.
