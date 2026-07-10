---
description: "اقتصاص الصور بتحديد منطقة بموضع وأبعاد."
i18n_source_hash: aab38ccd7c53
i18n_provenance: human
i18n_output_hash: 507104de8aef
---

# Crop {#crop}

اقتص الصور بتعريف منطقة مستطيلة باستخدام الموضع والحجم. يدعم وحدات البكسل والنسبة المئوية.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/crop`

يقبل بيانات نموذج multipart تحتوي على ملف صورة وحقل JSON باسم `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| left | number | Yes | - | إزاحة X لمنطقة الاقتصاص (من الحافة اليسرى) |
| top | number | Yes | - | إزاحة Y لمنطقة الاقتصاص (من الحافة العلوية) |
| width | number | Yes | - | عرض منطقة الاقتصاص |
| height | number | Yes | - | ارتفاع منطقة الاقتصاص |
| unit | string | No | `"px"` | وحدة القيم: `px` أو `percent` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/crop \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"left": 100, "top": 50, "width": 800, "height": 600}'
```

الاقتصاص باستخدام قيم النسبة المئوية:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/crop \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"left": 10, "top": 10, "width": 80, "height": 80, "unit": "percent"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 1200000
}
```

## Notes {#notes}

- يجب أن تلائم منطقة الاقتصاص حدود الصورة. إذا امتدت المنطقة إلى ما وراء الصورة، سيفشل الطلب.
- عند استخدام وحدة `percent`، تمثّل القيم نسبًا مئوية من أبعاد الصورة (مثل `left: 10` يعني 10% من الحافة اليسرى).
- صيغة الإخراج تطابق صيغة الإدخال.
- يُطبَّق اتجاه EXIF تلقائيًا قبل الاقتصاص، لذا تتوافق الإحداثيات مع الاتجاه الصحيح بصريًا.
