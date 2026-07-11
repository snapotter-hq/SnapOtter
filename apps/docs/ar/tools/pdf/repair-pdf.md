---
description: "محاولة إصلاح ملف PDF تالف أو مُعطَّل."
i18n_source_hash: 864073a2f09f
i18n_provenance: human
i18n_output_hash: f9bf610ec6fe
---

# Repair PDF {#repair-pdf}

حاوِل إصلاح ملف PDF تالف أو مُعطَّل عن طريق إعادة بناء بنيته الداخلية.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/repair-pdf`

يقبل بيانات نموذج multipart تحتوي على ملف PDF. لا حاجة إلى حقل `settings`.

## Parameters {#parameters}

ليس لهذه الأداة أي معاملات إعدادات. ارفع ملف PDF التالف مباشرة.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/repair-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@damaged.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/damaged.pdf",
  "originalSize": 2450000,
  "processedSize": 2400000
}
```

## Notes {#notes}

- يُتخطّى التحقّق البنيوي عند الإدخال للسماح بمرور الملفات المشوّهة.
- الإصلاح يبذل قصارى جهده؛ قد لا يمكن استرداد الملفات التالفة بشدة بالكامل.
- قد يختلف ملف PDF المُصلَح قليلاً في الحجم عن الأصلي بسبب جداول المراجع المتقاطعة المُعاد بناؤها.
