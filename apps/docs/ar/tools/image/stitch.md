---
description: "ضمّ الصور جنبًا إلى جنب أو متراكمة أو في شبكة مع التحكم في المحاذاة والفجوات والحدود ووضع إعادة التحجيم."
i18n_source_hash: 39333210505a
i18n_provenance: human
i18n_output_hash: c659ad48aa50
---

# الخياطة / الدمج {#stitch-combine}

اضمم عدة صور جنبًا إلى جنب أو متراكمة عموديًا أو مرتّبة في شبكة. يدعم المحاذاة والفجوة والحدود ونصف قطر الزوايا وعدة أوضاع لإعادة التحجيم.

## نقطة نهاية API {#api-endpoint}

`POST /api/v1/tools/image/stitch`

## المعاملات {#parameters}

| المعامل | النوع | مطلوب | الافتراضي | الوصف |
|-----------|------|----------|---------|-------------|
| direction | string | لا | `"horizontal"` | اتجاه التخطيط: `horizontal`، `vertical`، `grid` |
| gridColumns | integer | لا | 2 | عدد الأعمدة عندما يكون الاتجاه `grid` (2 إلى 100) |
| resizeMode | string | لا | `"fit"` | كيفية إعادة تحجيم الصور: `fit`، `original`، `stretch`، `crop` |
| alignment | string | لا | `"center"` | المحاذاة عبر المحور المتقاطع: `start`، `center`، `end` |
| gap | number | لا | 0 | الفجوة بين الصور بالبكسل (0 إلى 1000) |
| border | number | لا | 0 | عرض الحد الخارجي بالبكسل (0 إلى 500) |
| cornerRadius | number | لا | 0 | نصف قطر الزوايا المطبّق على المخرجات النهائية (0 إلى 500) |
| backgroundColor | string | لا | `"#FFFFFF"` | لون الخلفية/الحد بصيغة hex (مثل `#FF0000`) |
| format | string | لا | `"png"` | صيغة المخرجات: `png`، `jpeg`، `webp`، `avif`، `jxl` |
| quality | number | لا | 90 | جودة المخرجات (1 إلى 100) |

## مثال طلب {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/stitch \
  -F "file=@image1.png" \
  -F "file=@image2.png" \
  -F "file=@image3.png" \
  -F 'settings={"direction":"horizontal","resizeMode":"fit","gap":10,"backgroundColor":"#FFFFFF","format":"png"}'
```

## مثال استجابة {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/stitch.png",
  "originalSize": 1234567,
  "processedSize": 987654
}
```

## ملاحظات {#notes}

- يتطلب صورتين على الأقل. ارفع عدة ملفات صور في الطلب متعدد الأجزاء.
- يدعم صيغ المدخلات HEIC وRAW وPSD وSVG (تُفكّ ترميزاتها تلقائيًا).
- أوضاع إعادة التحجيم:
  - `fit` - تحجيم الصور لتطابق أصغر بُعد على طول محور الضم.
  - `original` - الإبقاء على الأحجام الأصلية (قد ينتج عنه حواف غير متساوية).
  - `stretch` - إجبار الصور على مطابقة أصغر بُعد دون الحفاظ على نسبة الأبعاد.
  - `crop` - اقتصاص تغطية للصور لتطابق أصغر بُعد.
- في وضع `grid`، تُحدد أحجام الخلايا وفق الأبعاد الوسيطة لجميع الصور.
- يُطبّق `cornerRadius` على كامل المخرجات النهائية، وليس على الصور الفردية.
- حجم القماش محدود بتهيئة الخادم `MAX_CANVAS_PIXELS` لمنع استنفاد الذاكرة.
