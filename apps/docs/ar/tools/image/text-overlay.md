---
description: "إضافة تراكبات نصية منسّقة مع ظلال ساقطة وصناديق خلفية."
i18n_source_hash: 9f8e697188fc
i18n_provenance: human
i18n_output_hash: dfff166544c2
---

# تراكب النص {#text-overlay}

أضف نصًا منسّقًا إلى الصور مع ظل ساقط اختياري وصندوق خلفية شبه شفاف. مناسب للعناوين أو التعليقات أو الشروح على الصور.

## نقطة نهاية API {#api-endpoint}

`POST /api/v1/tools/image/text-overlay`

تقبل بيانات نموذج متعدد الأجزاء تحتوي على ملف صورة وحقل `settings` بصيغة JSON.

## المعاملات {#parameters}

| المعامل | النوع | مطلوب | الافتراضي | الوصف |
|-----------|------|----------|---------|-------------|
| text | string | نعم | - | النص المراد تراكبه (1 إلى 500 حرف) |
| fontSize | number | لا | `48` | حجم الخط بالبكسل (8 إلى 200) |
| color | string | لا | `"#FFFFFF"` | لون النص بصيغة hex (`#RRGGBB`) |
| position | string | لا | `"bottom"` | الموضع العمودي: `top`، `center`، `bottom` |
| backgroundBox | boolean | لا | `false` | إظهار مستطيل خلفية شبه شفاف خلف النص |
| backgroundColor | string | لا | `"#000000"` | لون صندوق الخلفية بصيغة hex (`#RRGGBB`) |
| shadow | boolean | لا | `true` | تطبيق ظل ساقط خلف النص |

## مثال طلب {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/text-overlay \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"text": "Hello World", "fontSize": 64, "color": "#FFFFFF", "position": "bottom", "shadow": true}'
```

مع صندوق خلفية:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/text-overlay \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"text": "Caption", "fontSize": 36, "position": "bottom", "backgroundBox": true, "backgroundColor": "#000000"}'
```

## مثال استجابة {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2470000
}
```

## ملاحظات {#notes}

- يُوسَّط النص دائمًا أفقيًا داخل الصورة.
- يستخدم الظل الساقط إزاحة 2 بكسل مع تمويه 3 بكسل وعتامة سوداء بنسبة 70%.
- يمتد صندوق الخلفية على كامل عرض الصورة بعتامة 70%، وبارتفاع متناسب مع حجم الخط (1.8 مرة).
- يُصيَّر النص عبر تركيب SVG، لذا يُستخدم خط sans-serif الافتراضي للنظام.
- تُهرَّب الأحرف الخاصة بـ XML في النص بأمان.
- تطابق صيغة المخرجات صيغة المدخلات. تُفكّ ترميزات مدخلات HEIC وRAW وPSD وSVG تلقائيًا قبل المعالجة.
