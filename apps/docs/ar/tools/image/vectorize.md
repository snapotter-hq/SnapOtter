---
description: "تحويل الصور النقطية إلى SVG بتحويل متجهي بالأبيض والأسود (potrace) وتحويل متجهي ملون كامل متعدد الطبقات."
i18n_source_hash: f3e4777188ad
i18n_provenance: human
i18n_output_hash: 7dd931c76157
---

# الصورة إلى SVG {#image-to-svg}

حوّل الصور النقطية إلى SVG باستخدام خوارزميات التتبع. يدعم التتبع بالأبيض والأسود (potrace) والتحويل المتجهي الملون الكامل متعدد الطبقات.

## نقطة نهاية API {#api-endpoint}

`POST /api/v1/tools/image/vectorize`

## المعاملات {#parameters}

| المعامل | النوع | مطلوب | الافتراضي | الوصف |
|-----------|------|----------|---------|-------------|
| colorMode | string | لا | `"bw"` | وضع التتبع: `bw` (أبيض وأسود) أو `color` (طبقات متعددة الألوان) |
| threshold | number | لا | 128 | عتبة السطوع لوضع الأبيض والأسود (0 إلى 255). البكسلات دون هذه القيمة تصبح سوداء. |
| colorPrecision | number | لا | 6 | دقة تكميم الألوان لوضع الألوان (1 إلى 16). القيم الأعلى تنتج طبقات ألوان أكثر تمايزًا. |
| layerDifference | number | لا | 6 | أدنى فرق لوني بين الطبقات في وضع الألوان (1 إلى 128) |
| filterSpeckle | number | لا | 4 | أدنى مساحة للأشكال المتتبَّعة بالبكسل (1 إلى 256). يزيل الضوضاء/البقع. |
| pathMode | string | لا | `"spline"` | تنعيم المسار: `none` (مسنّن)، `polygon` (مقاطع مستقيمة)، `spline` (منحنيات ناعمة) |
| cornerThreshold | number | لا | 60 | عتبة الزاوية لاكتشاف الزوايا في وضع الألوان (0 إلى 180 درجة) |
| invert | boolean | لا | `false` | عكس الصورة قبل التتبع (تبديل الأسود/الأبيض) |

## مثال طلب {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/vectorize \
  -F "file=@logo.png" \
  -F 'settings={"colorMode":"bw","threshold":128,"filterSpeckle":4,"pathMode":"spline"}'
```

### التحويل المتجهي الملون {#color-vectorization}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/vectorize \
  -F "file=@illustration.png" \
  -F 'settings={"colorMode":"color","colorPrecision":8,"layerDifference":6,"filterSpeckle":4}'
```

## مثال استجابة {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/logo.svg",
  "originalSize": 45678,
  "processedSize": 12345
}
```

## ملاحظات {#notes}

- المخرجات دائمًا ملف SVG بغض النظر عن صيغة المدخلات.
- يدعم صيغ المدخلات HEIC وRAW وPSD وSVG (تُفكّ ترميزاتها تلقائيًا إلى صورة نقطية قبل التتبع).
- يستخدم وضع الأبيض والأسود خوارزمية potrace. تُحوَّل الصورة أولًا إلى تدرّج رمادي، ثم تُعتَّب إلى أبيض/أسود صرف قبل التتبع.
- يستخدم وضع الألوان نهجًا متعدد الطبقات: تُكمَّم الصورة إلى طبقات لونية، تُتتبَّع كل منها على حدة وتُكدَّس في مخرجات SVG.
- القيم الأدنى لـ `filterSpeckle` تحفظ تفاصيل أكثر لكنها تنتج ملفات SVG أكبر بمسارات أكثر.
- يؤثر إعداد `pathMode` بشكل ملحوظ في حجم الملف: `none` ينتج أكثر عدد من المسارات، و`spline` ينتج المخرجات الأنعم (والأصغر عادة).
- للحصول على أفضل النتائج مع الشعارات والأيقونات، استخدم وضع الأبيض والأسود مع مدخل نظيف عالي التباين. للصور الفوتوغرافية أو الرسوم التوضيحية، استخدم وضع الألوان مع قيمة `colorPrecision` أعلى.
