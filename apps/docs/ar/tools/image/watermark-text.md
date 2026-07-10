---
description: "إضافة علامات مائية نصية بموضع وعتامة ودوران وتبليط قابلة للتهيئة."
i18n_source_hash: b80f12f410e4
i18n_provenance: human
i18n_output_hash: 73811ce50f43
---

# علامة مائية نصية {#text-watermark}

أضف تراكب علامة مائية نصية إلى الصور. يدعم وضعًا مفردًا في الزوايا/المنتصف أو تكرارًا مبلّطًا عبر الصورة بأكملها، مع حجم خط ولون وعتامة ودوران قابلة للتهيئة.

## نقطة نهاية API {#api-endpoint}

`POST /api/v1/tools/image/watermark-text`

تقبل بيانات نموذج متعدد الأجزاء تحتوي على ملف صورة وحقل `settings` بصيغة JSON.

## المعاملات {#parameters}

| المعامل | النوع | مطلوب | الافتراضي | الوصف |
|-----------|------|----------|---------|-------------|
| text | string | نعم | - | نص العلامة المائية (1 إلى 500 حرف) |
| fontSize | number | لا | `48` | حجم الخط بالبكسل (8 إلى 1000) |
| color | string | لا | `"#000000"` | لون النص بصيغة hex (`#RRGGBB`) |
| opacity | number | لا | `50` | نسبة عتامة النص (0 إلى 100) |
| position | string | لا | `"center"` | الموضع: `center`، `top-left`، `top-right`، `bottom-left`، `bottom-right`، `tiled` |
| rotation | number | لا | `0` | زاوية دوران النص بالدرجات (-360 إلى 360) |

## مثال طلب {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/watermark-text \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"text": "SAMPLE", "fontSize": 64, "opacity": 30, "position": "center", "rotation": -30}'
```

علامة مائية مبلّطة عبر الصورة بأكملها:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/watermark-text \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"text": "DRAFT", "fontSize": 36, "opacity": 20, "position": "tiled", "rotation": -45}'
```

## مثال استجابة {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2480000
}
```

## ملاحظات {#notes}

- تُصيَّر العلامة المائية كنص SVG وتُركَّب على الصورة، مع الحفاظ على جودة المخرجات.
- يباعد الوضع المبلّط عناصر النص وفق حجم الخط (6 أضعاف أفقيًا، 4 أضعاف عموديًا)، بحد أقصى 500 عنصر.
- بالنسبة لأوضاع الزوايا، يساوي الحشو من الحافة حجم الخط.
- الخط المستخدم هو خط sans-serif الافتراضي للنظام.
- تُهرَّب الأحرف الخاصة بـ XML في النص (`&`، `<`، `>`، `"`، `'`) بأمان.
- تطابق صيغة المخرجات صيغة المدخلات. تُفكّ ترميزات مدخلات HEIC وRAW وPSD وSVG تلقائيًا قبل المعالجة.
