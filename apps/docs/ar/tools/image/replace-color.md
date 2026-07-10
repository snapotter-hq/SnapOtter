---
description: "استبدال لون معيّن في الصورة بلون آخر أو جعله شفافًا."
i18n_source_hash: df55ac451ecb
i18n_provenance: human
i18n_output_hash: f4ca5e9fef24
---

# استبدال اللون وعكسه {#replace-invert-color}

استبدل البكسلات المطابقة للون مصدر بلون هدف، أو اجعلها شفافة. يستخدم المسافة الإقليدية في فضاء RGB مع تفاوت قابل للتهيئة لمزج سلس عند حدود الألوان.

## نقطة نهاية الـ API {#api-endpoint}

`POST /api/v1/tools/image/replace-color`

يقبل بيانات نموذج متعدد الأجزاء مع ملف صورة وحقل JSON باسم `settings`.

## المعاملات {#parameters}

| المعامل | النوع | مطلوب | القيمة الافتراضية | الوصف |
|-----------|------|----------|---------|-------------|
| sourceColor | string | لا | `"#FF0000"` | لون hex المراد العثور عليه (الصيغة: `#RRGGBB`) |
| targetColor | string | لا | `"#00FF00"` | لون hex المراد الاستبدال به (الصيغة: `#RRGGBB`) |
| makeTransparent | boolean | لا | `false` | جعل البكسلات المطابقة شفافة بدلًا من استبدالها بلون الهدف |
| tolerance | number | لا | `30` | تفاوت مطابقة الألوان (0 إلى 255). القيم الأعلى تطابق نطاقًا أوسع من الألوان المتشابهة |

## مثال على الطلب {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/replace-color \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"sourceColor": "#FF0000", "targetColor": "#0000FF", "tolerance": 40}'
```

جعل خلفية خضراء شفافة:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/replace-color \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@greenscreen.png" \
  -F 'settings={"sourceColor": "#00FF00", "makeTransparent": true, "tolerance": 50}'
```

## مثال على الاستجابة {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.png",
  "originalSize": 2450000,
  "processedSize": 2100000
}
```

## ملاحظات {#notes}

- تستخدم مطابقة الألوان المسافة الإقليدية في فضاء RGB، مُقاسة بـ `tolerance * sqrt(3)`.
- مزج الاستبدال يتناسب مع مسافة اللون: البكسلات الأقرب إلى لون المصدر تتلقى قدرًا أكبر من لون الهدف، مما يخلق انتقالات سلسة.
- عندما يكون `makeTransparent` هو `true`، يُفرض الإخراج على PNG (أو WebP/AVIF) إذا كانت صيغة الإدخال لا تدعم قنوات ألفا (مثل JPEG).
- التفاوت 0 يطابق لون المصدر بالضبط فقط. القيم الأعلى (50+) ستطابق نطاقًا أوسع من الدرجات المتشابهة.
- تطابق صيغة الإخراج صيغة الإدخال ما لم تكن الشفافية مطلوبة وكانت صيغة الإدخال تفتقر إلى دعم ألفا.
