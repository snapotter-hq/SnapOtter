---
description: "تدوير الصور بأي زاوية وقلبها أفقيًا أو رأسيًا."
i18n_source_hash: c4ed5f7e270b
i18n_provenance: human
i18n_output_hash: 76d43088396b
---

# تدوير وعكس الصورة {#rotate-flip}

دوّر الصور بزاوية اختيارية و/أو اقلبها أفقيًا أو رأسيًا. يمكن دمج عمليات التدوير والقلب في طلب واحد.

## نقطة نهاية الـ API {#api-endpoint}

`POST /api/v1/tools/image/rotate`

يقبل بيانات نموذج متعدد الأجزاء مع ملف صورة وحقل JSON باسم `settings`.

## المعاملات {#parameters}

| المعامل | النوع | مطلوب | القيمة الافتراضية | الوصف |
|-----------|------|----------|---------|-------------|
| angle | number | لا | `0` | زاوية التدوير بالدرجات (باتجاه عقارب الساعة). تقبل أي قيمة عددية. |
| horizontal | boolean | لا | `false` | قلب الصورة أفقيًا (مرآة) |
| vertical | boolean | لا | `false` | قلب الصورة رأسيًا |

## مثال على الطلب {#example-request}

التدوير 90 درجة باتجاه عقارب الساعة:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/rotate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"angle": 90}'
```

القلب أفقيًا:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/rotate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"horizontal": true}'
```

التدوير والقلب معًا:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/rotate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"angle": 45, "vertical": true}'
```

## مثال على الاستجابة {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2480000
}
```

## ملاحظات {#notes}

- يُطبَّق التدوير أولًا، ثم عمليات القلب.
- عمليات التدوير غير المضاعفة لـ 90 درجة (مثل 45 درجة) ستوسّع اللوحة لتناسب الصورة المدوّرة، مع تعبئة شفافة أو سوداء تبعًا لصيغة الإخراج.
- القيم الشائعة: 90 و180 و270 للتدويرات بمقدار ربع دورة.
- يُطبَّق اتجاه EXIF تلقائيًا قبل المعالجة، لذا يكون التدوير نسبةً إلى الاتجاه المرئي.
