---
description: "استخراج الألوان السائدة من صورة كلوحة ألوان."
i18n_source_hash: 65ab22dd75a9
i18n_provenance: human
i18n_output_hash: bb9674f0c7fa
---

# Color Palette {#color-palette}

استخرج الألوان السائدة من صورة وأعِدها كقيم ألوان hex. يستخدم تحليل التردد المُكمّم لتحديد الألوان الأكثر بروزًا وتمايزًا بصريًا.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/color-palette`

يقبل بيانات نموذج multipart تحتوي على ملف صورة وحقل JSON اختياري باسم `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| count | integer | No | `8` | عدد الألوان المراد استخراجها (2-16) |
| format | string | No | `"hex"` | صيغة اللون: `hex`، `rgb`، `hsl` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/color-palette \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"count": 6, "format": "hex"}'
```

## Example Response {#example-response}

```json
{
  "filename": "photo.jpg",
  "colors": [
    "#304080",
    "#e0a060",
    "#f0f0f0",
    "#203020",
    "#a0c0e0",
    "#806040"
  ],
  "hex": [
    "#304080",
    "#e0a060",
    "#f0f0f0",
    "#203020",
    "#a0c0e0",
    "#806040"
  ],
  "count": 6
}
```

## Response Fields {#response-fields}

| Field | Type | Description |
|-------|------|-------------|
| filename | string | اسم الملف المُنقّى |
| colors | array | مصفوفة سلاسل الألوان بالصيغة المطلوبة، مرتّبة حسب الهيمنة (الأكثر تكرارًا أولًا) |
| hex | array | مصفوفة سلاسل ألوان hex (دائمًا hex بغض النظر عن إعداد `format`) |
| count | number | عدد الألوان المستخرَجة |

## Notes {#notes}

- يُعيد حتى `count` لونًا سائدًا (الافتراضي 8، المدى 2-16)، مرتّبة حسب التردد (الأكثر شيوعًا أولًا).
- يُعاد تحجيم الصورة داخليًا إلى 100x100 بكسل للتحليل، لذا تمثّل اللوحة توزيع الألوان العام بدلًا من التفاصيل الصغيرة.
- تُستخرَج الألوان باستخدام تكميم median-cut، الذي يقسّم مجموعات البكسل بشكل متكرر على طول القناة ذات المدى الأوسع.
- تُزال قناة الشفافية قبل التحليل، لذا لا تُؤخَذ المناطق الشفافة في الاعتبار.
- هذه نقطة نهاية للقراءة فقط. لا تنتج ملف إخراج قابل للتنزيل ولا `jobId`.
- تُفَكّ شفرة مدخلات HEIC وRAW وPSD وSVG تلقائيًا قبل التحليل.
