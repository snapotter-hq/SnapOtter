---
description: "تحويل جميع الألوان في ملف PDF إلى تدرّج رمادي."
i18n_source_hash: f327addb32d6
i18n_provenance: human
i18n_output_hash: e3ab2903d0b8
---

# Grayscale PDF {#grayscale-pdf}

حوّل جميع الألوان في ملف PDF إلى تدرّج رمادي، مُنتِجاً نسخة بالأبيض والأسود من المستند.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/grayscale-pdf`

يقبل بيانات نموذج multipart تحتوي على ملف PDF. لا حاجة إلى حقل `settings`.

## Parameters {#parameters}

ليس لهذه الأداة أي معاملات إعدادات. ارفع ملف PDF مباشرة.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/grayscale-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 3200000,
  "processedSize": 2800000
}
```

## Notes {#notes}

- تُحوَّل جميع مساحات الألوان (RGB وCMYK) إلى تدرّج رمادي، بما في ذلك الصور المضمّنة والرسوميات المتّجهة والنص.
- غالباً ما يكون ملف المخرجات أصغر من الأصلي لأن بيانات التدرّج الرمادي تتطلّب وحدات بايت أقل لكل بكسل.
