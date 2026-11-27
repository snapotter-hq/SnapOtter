---
description: "اقتصاص جميع صفحات ملف PDF بالهوامش أو إلى منطقة محددة."
i18n_source_hash: 338ff7bb64e5
i18n_provenance: machine
i18n_output_hash: 32bcc6814bc5
i18n_hash_version: 2
---

# Crop PDF {#crop-pdf}

اقتصّ جميع صفحات ملف PDF بهامش واحد على كل حافة، أو بهامش منفصل لكل حافة، أو إلى منطقة محددة مثل ملصق شحن مطبوع في إحدى زوايا الورقة.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/crop-pdf`

يقبل بيانات نموذج multipart تحتوي على ملف PDF وحقل `settings` بصيغة JSON.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `uniform` | `uniform` أو `sides` أو `region` |
| margin | number | No | `20` | الوضع `uniform`: هامش الاقتصاص لكل حافة بالنقاط (من 0 إلى 2000) |
| top, right, bottom, left | number | No | `0` | الوضع `sides`: هامش الاقتصاص لكل حافة على حدة بالنقاط (من 0 إلى 2000) |
| x, y | number | No | `0` | الوضع `region`: إزاحة المنطقة عن الحافتين اليسرى والعلوية للصفحة بالنقاط |
| width, height | number | No | `288`, `432` | الوضع `region`: حجم المنطقة بالنقاط (ملصق بمقاس 4x6 in) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/crop-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"margin": 50}'
```

احتفظ فقط بالملصق بمقاس 4x6 in في الزاوية العلوية اليسرى من كل صفحة:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/crop-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@label.pdf" \
  -F 'settings={"mode": "region", "x": 0, "y": 0, "width": 288, "height": 432}'
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

- جميع القيم بنقاط PDF (نقطة واحدة = 1/72 بوصة). صفحة US Letter مقاسها 612 x 792 نقطة.
- يقرأ كل وضع حقوله فقط، لذا يستمر عمل الطلب الذي يرسل `margin` وحده.
- تُقاس المنطقة من الزاوية العلوية اليسرى لكل صفحة ويجب أن تقع داخل كل الصفحات. ويجب أن تترك الهوامش جزءاً من كل صفحة. وإلا يفشل الطلب بالخطأ `400`.
- في الصفحة المضبوطة على العرض بشكل مدوَّر، تشير المواضع والحواف إلى الصفحة كما تُعرض، لذا فإن الزاوية العلوية اليسرى للمنطقة هي الزاوية العلوية اليسرى للصفحة المدوَّرة.
- يقيس كل وضع من مربّع الوسائط الكامل، لذا يبدأ اقتصاص صفحة مقتصّة بالفعل من الصفحة الكاملة من جديد. ويُظهر الهامش الموحّد `0` مربّع الوسائط كاملاً.
