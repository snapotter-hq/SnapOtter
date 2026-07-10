---
description: "إضافة حماية بكلمة مرور مع تشفير AES-256 إلى ملف PDF."
i18n_source_hash: 869cfbc739ef
i18n_provenance: human
i18n_output_hash: 1848f92a02f6
---

# Protect PDF {#protect-pdf}

أضف حماية بكلمة مرور إلى ملف PDF باستخدام تشفير AES-256.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/protect-pdf`

يقبل بيانات نموذج multipart تحتوي على ملف PDF وحقل `settings` بصيغة JSON.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| userPassword | string | Yes | - | كلمة المرور المطلوبة لفتح ملف PDF (من 1 إلى 256 حرفاً) |
| ownerPassword | string | No | نفس `userPassword` | كلمة مرور المالك للأذونات (من 1 إلى 256 حرفاً) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/protect-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"userPassword": "s3cret", "ownerPassword": "0wn3r"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2500000
}
```

## Notes {#notes}

- يستخدم التشفير AES-256.
- إذا حُذف `ownerPassword`، فإنه يأخذ افتراضياً القيمة نفسها لـ `userPassword`.
- تُحجب كلمات المرور من سجلات التدقيق.
- يتطلّب ملف PDF المشفَّر كلمة مرور المستخدم لفتحه وكلمة مرور المالك (إن كانت مختلفة) للأذونات الكاملة.
