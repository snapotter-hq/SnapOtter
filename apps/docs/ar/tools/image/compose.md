---
description: "طبقات الصور بموضع وشفافية وأوضاع مزج للتركيب."
i18n_source_hash: c5d09eb13fde
i18n_provenance: human
i18n_output_hash: af43c04df024
---

# Image Composition {#image-composition}

ضع صورة متراكبة فوق صورة أساسية مع موضع وشفافية ووضع مزج قابل للتهيئة. مفيد لتركيب الشعارات أو الرسومات أو دمج عدة صور.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/compose`

يقبل بيانات نموذج multipart تحتوي على ملفَّي صورة **اثنين** وحقل JSON باسم `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| x | number | No | `0` | الإزاحة الأفقية للطبقة المتراكبة من الزاوية العلوية اليسرى بالبكسل (الحد الأدنى 0) |
| y | number | No | `0` | الإزاحة العمودية للطبقة المتراكبة من الزاوية العلوية اليسرى بالبكسل (الحد الأدنى 0) |
| opacity | number | No | `100` | نسبة شفافية الطبقة المتراكبة (0 إلى 100) |
| blendMode | string | No | `"over"` | وضع مزج التركيب |

### Blend Modes {#blend-modes}

| Value | Description |
|-------|-------------|
| `over` | تراكب عادي (افتراضي) |
| `multiply` | تعتيم بضرب قيم البكسل |
| `screen` | تفتيح بالعكس ثم الضرب ثم العكس مرة أخرى |
| `overlay` | يجمع بين الضرب والشاشة استنادًا إلى سطوع الأساس |
| `darken` | الاحتفاظ بالبكسل الأغمق من كل طبقة |
| `lighten` | الاحتفاظ بالبكسل الأفتح من كل طبقة |
| `hard-light` | تراكب تباين قوي |
| `soft-light` | تراكب تباين خفيف |
| `difference` | الفرق المطلق بين الطبقتين |
| `exclusion` | مشابه للفرق لكن بتباين أقل |

### File Fields {#file-fields}

| Field Name | Required | Description |
|------------|----------|-------------|
| file | Yes | الصورة الأساسية/الخلفية |
| overlay | Yes | الصورة المتراكبة/الأمامية |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compose \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@background.jpg" \
  -F "overlay=@graphic.png" \
  -F 'settings={"x": 100, "y": 50, "opacity": 80, "blendMode": "over"}'
```

باستخدام وضع مزج الضرب:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compose \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F "overlay=@texture.jpg" \
  -F 'settings={"x": 0, "y": 0, "opacity": 50, "blendMode": "multiply"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/background.jpg",
  "originalSize": 3200000,
  "processedSize": 3450000
}
```

## Notes {#notes}

- تُتحقَّق كلتا الصورتين وتُفَكّ شفرتهما (HEIC وRAW وPSD وSVG مدعومة) قبل التركيب.
- تُوضَع الطبقة المتراكبة عند إحداثيات البكسل المحددة بالضبط بواسطة `x` و`y`. ولا يُعاد تحجيمها لتلائم.
- إذا كانت الشفافية أقل من 100، يُطبَّق قناع ألفا على الطبقة المتراكبة قبل المزج.
- يمكن أن تمتد الطبقة المتراكبة إلى ما وراء حدود الصورة الأساسية (وستُقتَص).
- يُطبَّق اتجاه EXIF تلقائيًا على كلتا الصورتين قبل المعالجة.
- تطابق أبعاد الإخراج أبعاد الصورة الأساسية.
