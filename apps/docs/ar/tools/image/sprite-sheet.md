---
description: "دمج عدة صور في شبكة ورقة تجميع واحدة مع بيانات وصفية للإطارات."
i18n_source_hash: 1938d7fb100d
i18n_provenance: human
i18n_output_hash: 5d0715fabc41
---

# ورقة التجميع {#sprite-sheet}

ادمج عدة صور في شبكة ورقة تجميع واحدة. يُعاد تحجيم كل صورة لتطابق أبعاد الصورة الأولى وتوضع في الشبكة. تُرجع صورة ورقة التجميع مع بيانات وصفية لإحداثيات كل إطار.

## نقطة نهاية API {#api-endpoint}

`POST /api/v1/tools/image/sprite-sheet`

تقبل بيانات نموذج متعدد الأجزاء تحتوي على صورتين أو أكثر وحقل `settings` بصيغة JSON.

## المعاملات {#parameters}

| المعامل | النوع | مطلوب | الافتراضي | الوصف |
|-----------|------|----------|---------|-------------|
| columns | integer | لا | `4` | عدد الأعمدة في الشبكة (1-16) |
| padding | integer | لا | `0` | الحشو بين الخلايا بالبكسل (0-64) |
| background | string | لا | `"#ffffff"` | لون الخلفية بصيغة hex |
| format | string | لا | `"png"` | صيغة المخرجات: `png`، `webp`، أو `jpeg` |
| quality | integer | لا | `90` | جودة المخرجات (1-100) |

## مثال طلب {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/sprite-sheet \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@frame1.png" \
  -F "file=@frame2.png" \
  -F "file=@frame3.png" \
  -F "file=@frame4.png" \
  -F 'settings={"columns": 2, "padding": 4, "format": "png"}'
```

## مثال استجابة {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/sprite-sheet.png",
  "originalSize": 120000,
  "processedSize": 95000,
  "frames": [
    { "index": 0, "left": 0, "top": 0, "width": 128, "height": 128 },
    { "index": 1, "left": 132, "top": 0, "width": 128, "height": 128 },
    { "index": 2, "left": 0, "top": 132, "width": 128, "height": 128 },
    { "index": 3, "left": 132, "top": 132, "width": 128, "height": 128 }
  ],
  "cols": 2,
  "rows": 2,
  "cellWidth": 128,
  "cellHeight": 128,
  "canvasWidth": 260,
  "canvasHeight": 260
}
```

## ملاحظات {#notes}

- تقبل من 2 إلى 64 صورة. يُعاد تحجيم جميع الصور لتطابق أبعاد الصورة الأولى المرفوعة.
- يوفّر مصفوف `frames` إحداثيات البكسل الدقيقة لكل إطار في المخرجات، وهي مناسبة لتعريفات sprite في CSS أو خرائط إطارات محركات الألعاب.
- يُحسب عدد الصفوف تلقائيًا من عدد الصور وقيمة `columns`.
- استخدم معامل `padding` لإضافة تباعد بين الخلايا. يظهر لون `background` في مناطق الحشو وأي خلايا لاحقة فارغة.
- تُفكّ ترميزات مدخلات HEIC وRAW وPSD وSVG تلقائيًا قبل المعالجة.
