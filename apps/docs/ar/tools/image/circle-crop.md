---
description: "قصّ صورة إلى دائرة موسّطة بزوايا شفّافة."
i18n_source_hash: 06c50ccd96b2
i18n_provenance: human
i18n_output_hash: 1a1acaa9d988
---

# القصّ الدائري {#circle-crop}

اقصص صورة إلى دائرة موسّطة بزوايا شفّافة. يدعم تكبيرًا وإزاحة وحدًّا وحجم مخرجات قابلة للضبط.

## نقطة نهاية API {#api-endpoint}

`POST /api/v1/tools/image/circle-crop`

يقبل بيانات نموذج متعدّد الأجزاء (multipart) مع ملف صورة وحقل `settings` بصيغة JSON.

## المعاملات {#parameters}

| المعامل | النوع | مطلوب | الافتراضي | الوصف |
|-----------|------|----------|---------|-------------|
| zoom | number | لا | `1` | عامل التكبير (1-5)؛ القيم الأعلى تقصّ بإحكام أكبر |
| offsetX | number | لا | `0.5` | موضع المركز الأفقي (0-1) |
| offsetY | number | لا | `0.5` | موضع المركز العمودي (0-1) |
| borderWidth | integer | لا | `0` | عرض الحدّ بالبكسل (0-200) |
| borderColor | string | لا | `"#ffffff"` | لون الحدّ بصيغة hex |
| background | string | لا | `"transparent"` | تعبئة الزوايا: `"transparent"` أو لون بصيغة hex |
| outputSize | integer | لا | - | البُعد المربّع النهائي بالبكسل (16-4096) |

## مثال على الطلب {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/circle-crop \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"zoom": 1.2, "borderWidth": 4, "borderColor": "#333333"}'
```

## مثال على الاستجابة {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.png",
  "originalSize": 2450000,
  "processedSize": 185000
}
```

## ملاحظات {#notes}

- تكون المخرجات دائمًا بصيغة PNG للحفاظ على الزوايا الشفّافة (ما لم تُضبَط `background` على لون خالص).
- تُرسَم الدائرة داخل البُعد الأقصر للصورة. استخدم `zoom` للقصّ بإحكام أكبر و`offsetX`/`offsetY` لإزاحة المنطقة المرئية.
- عند توفير `outputSize`، يُعاد ضبط حجم النتيجة إلى ذلك البُعد المربّع بعد القصّ.
- تُفكَّك مدخلات HEIC وRAW وPSD وSVG تلقائيًا قبل المعالجة.
