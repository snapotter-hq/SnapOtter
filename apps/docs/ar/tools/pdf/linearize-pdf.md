---
description: "تحسين ملف PDF خطّياً لعرض سريع على الويب (تنزيل تدريجي)."
i18n_source_hash: 36280b478161
i18n_provenance: human
i18n_output_hash: 97dd6496dd12
---

# Web-Optimize PDF {#web-optimize-pdf}

حسّن ملف PDF خطّياً بحيث يمكن تنزيله وعرضه تدريجياً في متصفّحات الويب دون انتظار الملف كاملاً.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/linearize-pdf`

يقبل بيانات نموذج multipart تحتوي على ملف PDF. لا حاجة إلى حقل `settings`.

## Parameters {#parameters}

ليس لهذه الأداة أي معاملات إعدادات. ارفع ملف PDF مباشرة.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/linearize-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2460000
}
```

## Notes {#notes}

- يعيد التحسين الخطّي ترتيب البنية الداخلية لملف PDF بحيث يمكن عرض الصفحة الأولى قبل اكتمال تنزيل الملف بالكامل.
- قد يكون ملف المخرجات أكبر قليلاً من ملف الإدخال بسبب بيانات التحسين الخطّي المُضافة.
- تُعاد معالجة ملفات PDF المُحسَّنة خطّياً مسبقاً دون أي مشكلة.
