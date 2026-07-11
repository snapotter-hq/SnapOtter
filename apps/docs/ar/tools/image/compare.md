---
description: "مقارنة صورتين جنبًا إلى جنب مع تصوّر للفروق على مستوى البكسل ودرجة تشابه."
i18n_source_hash: cc0a02bd75c6
i18n_provenance: human
i18n_output_hash: dfce18f25f71
---

# Image Compare {#image-compare}

ارفع صورتين لحساب خريطة فروق على مستوى البكسل ونسبة تشابه رقمية. الإخراج صورة فروق تُبرِز المناطق المتغيرة باللون الأحمر.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/compare`

يقبل بيانات نموذج multipart تحتوي على ملفَّي صورة **اثنين**. لا حاجة لحقل إعدادات.

## Parameters {#parameters}

هذه الأداة ليس لها مُعامِلات قابلة للتهيئة. ارفع ملفَّي صورة اثنين بالضبط.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| file (first) | file | Yes | الصورة الأولى |
| file (second) | file | Yes | الصورة الثانية |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compare \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@original.jpg" \
  -F "file=@modified.jpg"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "similarity": 94.52,
  "dimensions": { "width": 1920, "height": 1080 },
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/diff.png",
  "originalSize": 4900000,
  "processedSize": 280000
}
```

## Response Fields {#response-fields}

| Field | Type | Description |
|-------|------|-------------|
| jobId | string | معرّف المهمة لتنزيل صورة الفروق |
| similarity | number | نسبة التشابه بين الصورتين (0 إلى 100) |
| dimensions | object | العرض والارتفاع المستخدمان في المقارنة |
| downloadUrl | string | رابط تنزيل صورة الفروق المُولَّدة |
| originalSize | number | الحجم المجمّع لكلا الصورتين المُدخَلتين بالبايت |
| processedSize | number | حجم صورة الفروق المُخرَجة بالبايت |

## Notes {#notes}

- يُعاد تحجيم كلتا الصورتين إلى الأبعاد نفسها (القيمة القصوى لكل محور) قبل المقارنة.
- تُبرِز صورة الفروق الاختلافات باللون الأحمر بشفافية تتناسب مع مقدار التغيّر. تُعرَض البكسلات المتطابقة أو شبه المتطابقة (الفرق < 10) كنسخ شبه شفافة من الأصل.
- يُحسَب التشابه كمعكوس متوسط فرق البكسل عبر جميع البكسلات، مُعبَّرًا عنه كنسبة مئوية.
- تشابه بنسبة 100% يعني أن الصورتين متطابقتان على مستوى البكسل (بدقة المقارنة).
- إخراج الفروق دائمًا بصيغة PNG بغض النظر عن صيغ الإدخال.
- تُتحقَّق كلتا الصورتين وتُفَكّ شفرتهما (HEIC وRAW وPSD وSVG مدعومة) قبل المقارنة.
- يُطبَّق اتجاه EXIF تلقائيًا على كلتا الصورتين قبل المعالجة.
