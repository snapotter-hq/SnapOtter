---
description: "تحويل ملف PDF إلى صيغة أرشيفية PDF/A-2 للحفظ طويل الأمد."
i18n_source_hash: 4c6bf7a12e84
i18n_provenance: human
i18n_output_hash: 35aad5da4358
---

# PDF/A Convert {#pdf-a-convert}

حوّل ملف PDF إلى الصيغة الأرشيفية PDF/A-2، المناسبة للحفظ طويل الأمد والامتثال التنظيمي.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdfa-convert`

يقبل بيانات نموذج multipart تحتوي على ملف PDF. لا حاجة إلى حقل `settings`.

## Parameters {#parameters}

ليس لهذه الأداة أي معاملات إعدادات. ارفع ملف PDF مباشرة.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdfa-convert \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2600000
}
```

## Notes {#notes}

- تتوافق المخرجات مع معيار PDF/A-2.
- يُضمّن PDF/A جميع الخطوط ويمنع المراجع الخارجية، لذا قد يكون ملف المخرجات أكبر من الأصلي.
- يُزال التشفير وJavaScript أثناء التحويل، لأنهما غير مسموح بهما وفق معيار PDF/A.
