---
description: "ضبط السطوع والتباين والتشبّع ودرجة الحرارة والصبغة والقنوات وتطبيق مؤثّرات لونية."
i18n_source_hash: 41b35fe5c2ba
i18n_provenance: human
i18n_output_hash: 805146b75cef
---

# ضبط الألوان {#adjust-colors}

أداة شاملة لضبط الألوان تجمع السطوع والتباين والتعرّض والتشبّع ودرجة الحرارة والصبغة وتدوير الصبغة ومستويات كل قناة والمؤثّرات بنقرة واحدة (تدرّج رمادي، بنّي داكن، عكس) في نقطة نهاية واحدة.

## نقطة نهاية API {#api-endpoint}

`POST /api/v1/tools/image/adjust-colors`

يقبل بيانات نموذج متعدّد الأجزاء (multipart) مع ملف صورة وحقل `settings` بصيغة JSON.

## المعاملات {#parameters}

| المعامل | النوع | مطلوب | الافتراضي | الوصف |
|-----------|------|----------|---------|-------------|
| brightness | number | لا | `0` | ضبط السطوع (-100 إلى 100) |
| contrast | number | لا | `0` | ضبط التباين (-100 إلى 100) |
| exposure | number | لا | `0` | التعرّض / غاما النغمات الوسطى (-100 إلى 100) |
| saturation | number | لا | `0` | تشبّع اللون (-100 إلى 100) |
| temperature | number | لا | `0` | توازن اللون الأبيض: بارد/أزرق إلى دافئ/برتقالي (-100 إلى 100) |
| tint | number | لا | `0` | إزاحة الصبغة: أخضر إلى أرجواني (-100 إلى 100) |
| hue | number | لا | `0` | تدوير الصبغة بالدرجات (-180 إلى 180) |
| sharpness | number | لا | `0` | قوة الحدّة (0 إلى 100) |
| red | number | لا | `100` | مستوى القناة الحمراء (0 إلى 200، 100 = دون تغيير) |
| green | number | لا | `100` | مستوى القناة الخضراء (0 إلى 200، 100 = دون تغيير) |
| blue | number | لا | `100` | مستوى القناة الزرقاء (0 إلى 200، 100 = دون تغيير) |
| effect | string | لا | `"none"` | المؤثّر اللوني: `none`، `grayscale`، `sepia`، `invert` |

## مثال على الطلب {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/adjust-colors \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"brightness": 20, "contrast": 10, "saturation": -30, "effect": "none"}'
```

تطبيق مظهر عتيق دافئ:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/adjust-colors \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"temperature": 40, "saturation": -15, "contrast": 10, "effect": "sepia"}'
```

## مثال على الاستجابة {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2380000
}
```

## ملاحظات {#notes}

- تتخذ جميع المعاملات قيمًا محايدة افتراضيًا لتضبط ما تحتاجه فقط.
- تُطبَّق التعديلات بهذا الترتيب: السطوع، التباين، التعرّض، التشبّع/الصبغة، درجة الحرارة/الصبغة، الحدّة، القنوات، المؤثّرات.
- تستخدم درجة الحرارة مصفوفة إعادة تركيب لونية 3x3 على محورَي أزرق-برتقالي وأخضر-أرجواني.
- يُطابَق التعرّض بدالة غاما في Sharp (الموجب يُفتّح النغمات الوسطى، والسالب يُعتّمها).
- تستجيب نقطة النهاية هذه أيضًا على المسارات القديمة `/api/v1/tools/image/brightness-contrast`، `/api/v1/tools/image/saturation`، `/api/v1/tools/image/color-channels`، و`/api/v1/tools/image/color-effects`. وكلّها تستخدم المخطّط نفسه.
- تطابِق صيغة المخرجات صيغة الإدخال. تُفكَّك مدخلات HEIC وRAW وPSD وSVG تلقائيًا قبل المعالجة.
