---
description: "إزالة الحماية بكلمة مرور من ملف PDF."
i18n_source_hash: 14f5165d185c
i18n_provenance: human
i18n_output_hash: 808267af6845
---

# Unlock PDF {#unlock-pdf}

أزِل الحماية بكلمة مرور من ملف PDF مشفَّر بتقديم كلمة المرور الصحيحة.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/unlock-pdf`

يقبل بيانات نموذج multipart تحتوي على ملف PDF وحقل `settings` بصيغة JSON.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| password | string | Yes | - | كلمة المرور لفك تشفير ملف PDF (من 1 إلى 256 حرفاً) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/unlock-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"password": "s3cret"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2500000,
  "processedSize": 2450000
}
```

## Notes {#notes}

- يجب تقديم كلمة المرور الصحيحة؛ تُعيد كلمة المرور غير الصحيحة خطأ 400.
- تعمل كلمة مرور المستخدم أو كلمة مرور المالك لفك التشفير.
- تُحجب كلمات المرور من سجلات التدقيق.
