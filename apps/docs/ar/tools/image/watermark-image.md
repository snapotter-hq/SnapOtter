---
description: "تراكب شعار أو صورة كعلامة مائية بموضع وعتامة ومقياس قابلة للتهيئة."
i18n_source_hash: c73ab0ef8ab9
i18n_provenance: human
i18n_output_hash: 5c9036bab6b8
---

# علامة مائية بالصورة {#image-watermark}

تراكب شعار أو صورة ثانوية كعلامة مائية على صورة أساسية. تُحجّم العلامة المائية نسبةً إلى عرض الصورة الأساسية وتوضع في زاوية أو في المنتصف.

## نقطة نهاية API {#api-endpoint}

`POST /api/v1/tools/image/watermark-image`

تقبل بيانات نموذج متعدد الأجزاء تحتوي على **صورتين** وحقل `settings` بصيغة JSON.

## المعاملات {#parameters}

| المعامل | النوع | مطلوب | الافتراضي | الوصف |
|-----------|------|----------|---------|-------------|
| position | string | لا | `"bottom-right"` | موضع العلامة المائية: `center`، `top-left`، `top-right`، `bottom-left`، `bottom-right` |
| opacity | number | لا | `50` | نسبة عتامة العلامة المائية (0 إلى 100) |
| scale | number | لا | `25` | عرض العلامة المائية كنسبة مئوية من عرض الصورة الرئيسية (1 إلى 100) |

### حقول الملفات {#file-fields}

| اسم الحقل | مطلوب | الوصف |
|------------|----------|-------------|
| file | نعم | الصورة الرئيسية/الأساسية |
| watermark | نعم | صورة العلامة المائية/الشعار |

## مثال طلب {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/watermark-image \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F "watermark=@logo.png" \
  -F 'settings={"position": "bottom-right", "opacity": 60, "scale": 20}'
```

## مثال استجابة {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2520000
}
```

## ملاحظات {#notes}

- تُتحقق كلتا الصورتين وتُفكّ ترميزاتهما (يُدعم HEIC وRAW وPSD وSVG).
- يُعاد تحجيم العلامة المائية تناسبيًا بحيث يساوي عرضها `scale`% من عرض الصورة الرئيسية.
- تُطبَّق العتامة عبر قناع ألفا مُركَّب بمزج `dest-in`.
- تستخدم أوضاع الزوايا حشوًا بمقدار 20 بكسل من حافة الصورة.
- إذا كانت صورة العلامة المائية تحتوي على شفافية (مثل شعار PNG)، فإنها تُحفَظ أثناء التركيب.
- يُطبَّق اتجاه EXIF تلقائيًا على كلتا الصورتين قبل المعالجة.
