---
description: "حوّل لقطات الشاشة العادية إلى صور مصقولة بخلفيات متدرّجة وإطارات أجهزة وظلال وأحجام مناسبة لوسائل التواصل الاجتماعي."
i18n_source_hash: 8fd8a930a45e
i18n_provenance: human
i18n_output_hash: 66b480c18c3c
---

# تجميل لقطة الشاشة {#beautify-screenshot}

أضِف خلفيات متدرّجة وإطارات أجهزة وظلالًا وعلامات مائية وأحجامًا مناسبة لوسائل التواصل الاجتماعي إلى لقطات الشاشة. مثالية لإنشاء صور مصقولة لتسويق المنتجات ووسائل التواصل الاجتماعي والتوثيق.

## نقطة نهاية API {#api-endpoint}

`POST /api/v1/tools/image/beautify`

## المعاملات {#parameters}

| المعامل | النوع | مطلوب | الافتراضي | الوصف |
|-----------|------|----------|---------|-------------|
| backgroundType | string | لا | `"linear-gradient"` | نوع الخلفية: `solid`، `linear-gradient`، `radial-gradient`، `image`، `transparent` |
| backgroundColor | string | لا | `"#667eea"` | لون خلفية خالص (يُستخدَم عندما تكون `backgroundType` هي `solid`) |
| gradientStops | array | لا | `[{"color":"#667eea","position":0},{"color":"#764ba2","position":100}]` | محطّات ألوان التدرّج (حدّ أدنى 2). كل محطّة لها `color` (hex) و`position` (0-100). |
| gradientAngle | number | لا | 135 | زاوية التدرّج بالدرجات (0 إلى 360) |
| padding | number | لا | 64 | الحشوة حول الصورة بالبكسل (0 إلى 256) |
| borderRadius | number | لا | 12 | نصف قطر الزوايا على لقطة الشاشة (0 إلى 64) |
| shadowPreset | string | لا | `"subtle"` | إعداد الظلّ المُسبَق: `none`، `subtle`، `medium`، `dramatic`، `custom` |
| shadowBlur | number | لا | 20 | نصف قطر ضبابية الظلّ المخصّص (0 إلى 100، يُستخدَم عندما تكون `shadowPreset` هي `custom`) |
| shadowOffsetX | number | لا | 0 | إزاحة الظلّ الأفقية المخصّصة (-50 إلى 50) |
| shadowOffsetY | number | لا | 10 | إزاحة الظلّ العمودية المخصّصة (-50 إلى 50) |
| shadowColor | string | لا | `"#000000"` | لون الظلّ المخصّص بصيغة hex |
| shadowOpacity | number | لا | 30 | تعتيم الظلّ المخصّص (0 إلى 100) |
| frame | string | لا | `"none"` | إطار الجهاز أو النافذة: `none`، `macos-light`، `macos-dark`، `windows-light`، `windows-dark`، `browser-light`، `browser-dark`، `iphone`، `iphone-dark`، `macbook`، `macbook-dark`، `ipad`، `ipad-dark` |
| frameTitle | string | لا | - | نص العنوان المعروض في أشرطة عنوان إطار النافذة |
| socialPreset | string | لا | `"none"` | تغيير الحجم إلى أبعاد وسائل التواصل الاجتماعي: `none`، `twitter`، `linkedin`، `instagram-square`، `instagram-story`، `facebook`، `producthunt` |
| watermarkText | string | لا | - | نص علامة مائية اختياري كطبقة علوية |
| watermarkPosition | string | لا | `"bottom-right"` | موضع العلامة المائية: `top-left`، `top-right`، `bottom-left`، `bottom-right`، `center` |
| watermarkOpacity | number | لا | 50 | تعتيم العلامة المائية (0 إلى 100) |
| outputFormat | string | لا | `"png"` | صيغة المخرجات: `png`، `jpeg`، `webp` |

## مثال على الطلب {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/beautify \
  -F "file=@screenshot.png" \
  -F 'settings={"backgroundType":"linear-gradient","gradientStops":[{"color":"#667eea","position":0},{"color":"#764ba2","position":100}],"gradientAngle":135,"padding":64,"borderRadius":12,"shadowPreset":"medium","frame":"macos-dark","socialPreset":"twitter"}'
```

### مع صورة خلفية {#with-background-image}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/beautify \
  -F "file=@screenshot.png" \
  -F "backgroundImage=@bg-texture.jpg" \
  -F 'settings={"backgroundType":"image","padding":80,"borderRadius":16,"shadowPreset":"dramatic"}'
```

## مثال على الاستجابة {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/screenshot.png",
  "originalSize": 234567,
  "processedSize": 567890
}
```

## ملاحظات {#notes}

- يقبل حقلَي ملف: `file` (مطلوب، لقطة الشاشة الرئيسية) و`backgroundImage` (اختياري، يُستخدَم عندما تكون `backgroundType` هي `image`).
- يدعم صيغ الإدخال HEIC وRAW وPSD وSVG (تُفكَّك تلقائيًا).
- تُطابَق إعدادات الظلّ المُسبَقة بقيم محدّدة:
  - `subtle`: ضبابية 20، offsetY 4، تعتيم 20%
  - `medium`: ضبابية 40، offsetY 10، تعتيم 35%
  - `dramatic`: ضبابية 80، offsetY 20، تعتيم 50%
- تغيّر إعدادات وسائل التواصل الاجتماعي المُسبَقة حجم المخرجات النهائية لتلائم الأبعاد المستهدفة باستخدام وضع `contain`:
  - `twitter`: 1600x900
  - `linkedin`: 1200x627
  - `instagram-square`: 1080x1080
  - `instagram-story`: 1080x1920
  - `facebook`: 1200x630
  - `producthunt`: 1270x760
- تطبّق إطارات الأجهزة (`iphone`، `macbook`، `ipad`) حافّة عتاد حول الصورة وتتجاوز إعداد `borderRadius`.
- عند الحاجة إلى الشفافية (ظلّ، أو نصف قطر حدود، أو إطارات أجهزة، أو خلفية شفّافة)، تُفرَض المخرجات إلى PNG حتى لو اختيرت `jpeg`.
- خلفيات الصور غير مدعومة في وضع خطّ الأنابيب/الدفعات.
