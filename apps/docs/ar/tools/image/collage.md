---
description: "دمج عدة صور في صور مجمّعة شبكية باستخدام أكثر من 25 قالبًا، مع فجوات وزوايا قابلة للتعديل، وتحريك وتكبير لكل خلية."
i18n_source_hash: cd50a782239d
i18n_provenance: human
i18n_output_hash: f966a795442b
---

# صورة مجمّعة وشبكة {#collage-grid}

ادمج عدة صور في صور مجمّعة شبكية جميلة باستخدام أكثر من 25 قالبًا. يدعم تخطيطات من صورتين إلى 9 صور مع فجوة قابلة للتخصيص، ونصف قطر للزوايا، ولون خلفية، وعناصر تحكم بالتحريك والتكبير لكل خلية.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/collage`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| templateId | string | Yes | - | معرّف تخطيط القالب (مثل `2-h-equal`، `3-left-large`، `4-grid`، `9-grid`) |
| cells | array | No | - | مصفوفة إعدادات لكل خلية تحتوي على `imageIndex`، `panX`، `panY`، `zoom`، `objectFit` |
| cells[].imageIndex | integer | Yes | - | فهرس الصورة المراد وضعها في هذه الخلية (يبدأ من 0) |
| cells[].panX | number | No | 0 | إزاحة التحريك الأفقية (-100 إلى 100) |
| cells[].panY | number | No | 0 | إزاحة التحريك العمودية (-100 إلى 100) |
| cells[].zoom | number | No | 1 | مستوى التكبير (1 إلى 10) |
| cells[].objectFit | string | No | `"cover"` | كيفية ملء الصورة للخلية: `cover` أو `contain` |
| gap | number | No | 8 | الفجوة بين الخلايا بالبكسل (0 إلى 500) |
| cornerRadius | number | No | 0 | نصف قطر الزوايا لكل خلية بالبكسل (0 إلى 500) |
| backgroundColor | string | No | `"#FFFFFF"` | لون الخلفية كقيمة hex أو `"transparent"` |
| aspectRatio | string | No | `"free"` | نسبة أبعاد اللوحة: `free`، `1:1`، `4:3`، `3:2`، `16:9`، `9:16`، `4:5` |
| outputFormat | string | No | `"png"` | صيغة الإخراج: `png`، `jpeg`، `webp`، `avif`، `jxl` |
| quality | number | No | 90 | جودة الإخراج (1 إلى 100) |

## Available Templates {#available-templates}

| Template ID | Images | Layout |
|-------------|--------|--------|
| `2-h-equal` | 2 | عمودان متساويان |
| `2-v-equal` | 2 | صفّان متساويان |
| `2-h-left-large` | 2 | اليسار الثلثان، اليمين الثلث |
| `2-h-right-large` | 2 | اليسار الثلث، اليمين الثلثان |
| `3-left-large` | 3 | كبيرة على اليسار، اثنتان مكدّستان على اليمين |
| `3-right-large` | 3 | اثنتان مكدّستان على اليسار، كبيرة على اليمين |
| `3-top-large` | 3 | كبيرة في الأعلى، عمودان في الأسفل |
| `3-h-equal` | 3 | ثلاثة أعمدة متساوية |
| `3-v-equal` | 3 | ثلاثة صفوف متساوية |
| `4-grid` | 4 | شبكة 2x2 |
| `4-left-large` | 4 | كبيرة على اليسار، ثلاث مكدّسة على اليمين |
| `4-top-large` | 4 | كبيرة في الأعلى، ثلاثة أعمدة في الأسفل |
| `4-bottom-large` | 4 | ثلاثة أعمدة في الأعلى، كبيرة في الأسفل |
| `5-top2-bottom3` | 5 | اثنتان في الأعلى، ثلاث في الأسفل |
| `5-top3-bottom2` | 5 | ثلاث في الأعلى، اثنتان في الأسفل |
| `5-left-large` | 5 | كبيرة على اليسار، أربع مكدّسة على اليمين |
| `5-center-large` | 5 | كبيرة في المنتصف، أربع في الزوايا |
| `6-grid-2x3` | 6 | عمودان × ثلاثة صفوف |
| `6-grid-3x2` | 6 | ثلاثة أعمدة × صفّان |
| `6-top-large` | 6 | كبيرة في الأعلى، خمسة أعمدة في الأسفل |
| `7-mosaic` | 7 | تخطيط فسيفسائي |
| `8-mosaic` | 8 | تخطيط فسيفسائي |
| `9-grid` | 9 | شبكة 3x3 |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/collage \
  -F "file=@photo1.jpg" \
  -F "file=@photo2.jpg" \
  -F "file=@photo3.jpg" \
  -F "file=@photo4.jpg" \
  -F 'settings={"templateId":"4-grid","gap":12,"cornerRadius":8,"backgroundColor":"#F5F5F5","outputFormat":"png","quality":90}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/collage.png",
  "originalSize": 2456789,
  "processedSize": 1823456
}
```

## Notes {#notes}

- ارفع عدة ملفات صور في طلب multipart. تُسنَد الصور إلى خلايا القالب بترتيب الرفع.
- إذا رُفعت صور أكثر مما يدعمه القالب، تُتجاهَل الصور الزائدة.
- يدعم صيغ الإدخال HEIC وRAW وPSD وSVG (تُفَكّ شفرتها تلقائيًا).
- الحجم الأساسي للوحة هو 2400 بكسل على الجانب الأطول، مع تحجيمه وفق نسبة الأبعاد المختارة.
- عندما تكون `aspectRatio` هي `"free"`، تكون اللوحة افتراضيًا 4:3 (2400x1800).
- تُزيح قيم `panX`/`panY` لكل خلية نافذة الاقتصاص داخل الخلية. قيمة 100 تحرّكها بالكامل نحو حافة، و-100 نحو الحافة المقابلة.
- يُحفَظ لون الخلفية `"transparent"` فقط مع صيغ الإخراج `png` أو `webp` أو `avif`.
