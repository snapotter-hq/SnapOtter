---
description: "إضافة حدود وحشوة وزوايا مستديرة وظلال مسقطة إلى الصور بترتيب قابل للتنبّؤ والتحكّم."
i18n_source_hash: 8845150736a9
i18n_provenance: human
i18n_output_hash: 22b7c5cf11d2
---

# الحدود والإطار {#border-frame}

أضِف حدودًا وحشوة وزوايا مستديرة وظلالًا مسقطة إلى الصور. تطبّق الأداة المؤثّرات بالترتيب: الحشوة، الحدّ، نصف قطر الزوايا، ثم الظلّ.

## نقطة نهاية API {#api-endpoint}

`POST /api/v1/tools/image/border`

## المعاملات {#parameters}

| المعامل | النوع | مطلوب | الافتراضي | الوصف |
|-----------|------|----------|---------|-------------|
| borderWidth | number | لا | 10 | سُمك الحدّ بالبكسل (0 إلى 2000) |
| borderColor | string | لا | `"#000000"` | لون الحدّ بصيغة hex (مثل `#FF0000`) |
| padding | number | لا | 0 | الحشوة الداخلية بين الصورة والحدّ بالبكسل (0 إلى 200) |
| paddingColor | string | لا | `"#FFFFFF"` | لون تعبئة الحشوة بصيغة hex |
| cornerRadius | number | لا | 0 | نصف قطر الزوايا بالبكسل (0 إلى 2000) |
| shadow | boolean | لا | `false` | ما إذا كان يُضاف ظلّ مسقط |
| shadowBlur | number | لا | 15 | نصف قطر ضبابية الظلّ (1 إلى 200) |
| shadowOffsetX | number | لا | 0 | إزاحة الظلّ الأفقية (-50 إلى 50) |
| shadowOffsetY | number | لا | 5 | إزاحة الظلّ العمودية (-50 إلى 50) |
| shadowColor | string | لا | `"#000000"` | لون الظلّ بصيغة hex |
| shadowOpacity | number | لا | 40 | نسبة تعتيم الظلّ (0 إلى 100) |

## مثال على الطلب {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/border \
  -F "file=@photo.jpg" \
  -F 'settings={"borderWidth":20,"borderColor":"#333333","cornerRadius":16,"shadow":true,"shadowBlur":25,"shadowOpacity":50}'
```

## مثال على الاستجابة {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.png",
  "originalSize": 456789,
  "processedSize": 523456
}
```

## ملاحظات {#notes}

- يستخدم مصنع `createToolRoute` القياسي. يقبل ملف صورة واحدًا عبر رفع multipart.
- يدعم صيغ الإدخال HEIC وRAW وPSD وSVG (تُفكَّك تلقائيًا).
- ترتيب المعالجة: تُضاف الحشوة أولًا، ثم يلتفّ الحدّ حولها، ثم يُطبَّق نصف قطر الزوايا، ثم يُركَّب الظلّ.
- عند تفعيل `cornerRadius` أو `shadow`، تُفرَض المخرجات إلى PNG (بغضّ النظر عن صيغة الإدخال) للحفاظ على الشفافية. أما الصيغ التي تدعم قناة ألفا (PNG، WebP، AVIF) فتحتفظ بصيغتها الأصلية.
- الظلّ واعٍ بالشكل: فهو يتبع الزوايا المستديرة بدلًا من إنشاء ظلّ مستطيل.
- يؤدّي ضبط `borderWidth` على 0 واستخدام `cornerRadius` + `shadow` فقط إلى إنشاء تأثير ظلّ مستدير بلا إطار.
