---
description: "اقتصاص جميع صفحات ملف PDF بهامش موحّد."
i18n_source_hash: ffa1a2cee08d
i18n_provenance: human
i18n_output_hash: 62531dcb9295
---

# Crop PDF {#crop-pdf}

اقتصّ جميع صفحات ملف PDF بتطبيق هامش موحّد، مع تشذيب المحتوى من كل حافة بالتساوي.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/crop-pdf`

يقبل بيانات نموذج multipart تحتوي على ملف PDF وحقل `settings` بصيغة JSON.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| margin | number | No | `20` | هامش الاقتصاص الموحّد بالنقاط (من 0 إلى 2000) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/crop-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"margin": 50}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2440000
}
```

## Notes {#notes}

- قيمة الهامش بنقاط PDF (نقطة واحدة = 1/72 بوصة).
- يُطبَّق الهامش نفسه على الحواف الأربع لكل صفحة.
- يزيل الهامش `0` جميع هوامش الاقتصاص الموجودة، مُظهِراً مربّع الوسائط الكامل.
