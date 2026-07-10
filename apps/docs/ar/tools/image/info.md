---
description: "عرض بيانات وصفية تفصيلية للصورة وخصائصها وإحصائيات الرسم البياني لكل قناة."
i18n_source_hash: 8a0f7a0b0153
i18n_provenance: human
i18n_output_hash: 709f24e5d07c
---

# معلومات الصورة {#image-info}

أداة تحليل للقراءة فقط تُرجع بيانات وصفية شاملة للصورة تشمل الأبعاد والصيغة ومساحة اللون ووجود EXIF/ICC/XMP وإحصائيات الرسم البياني لكل قناة. لا تُنتج ملف مخرجات معالجاً.

## نقطة نهاية API {#api-endpoint}

`POST /api/v1/tools/image/info`

يقبل بيانات نموذج multipart تحتوي على ملف صورة. لا حاجة لحقل إعدادات.

## المعاملات {#parameters}

لا تحتوي هذه الأداة على معاملات قابلة للتكوين. ما عليك سوى رفع ملف الصورة.

| الحقل | النوع | مطلوب | الوصف |
|-------|------|----------|-------------|
| file | file | نعم | الصورة المراد تحليلها |

## مثال على طلب {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/info \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg"
```

## مثال على استجابة {#example-response}

```json
{
  "filename": "photo.jpg",
  "fileSize": 2450000,
  "width": 4032,
  "height": 3024,
  "format": "jpeg",
  "channels": 3,
  "hasAlpha": false,
  "colorSpace": "srgb",
  "density": 72,
  "isProgressive": false,
  "orientation": 1,
  "hasProfile": true,
  "hasExif": true,
  "hasIcc": true,
  "hasXmp": false,
  "bitDepth": "8",
  "pages": 1,
  "histogram": [
    { "channel": "red", "min": 0, "max": 255, "mean": 128.45, "stdev": 52.31 },
    { "channel": "green", "min": 2, "max": 253, "mean": 115.22, "stdev": 48.76 },
    { "channel": "blue", "min": 0, "max": 250, "mean": 102.89, "stdev": 55.14 }
  ]
}
```

## حقول الاستجابة {#response-fields}

| الحقل | النوع | الوصف |
|-------|------|-------------|
| filename | string | اسم الملف المُطهَّر |
| fileSize | number | حجم الملف بالبايت |
| width | number | عرض الصورة بالبكسل |
| height | number | ارتفاع الصورة بالبكسل |
| format | string | الصيغة المكتشفة (jpeg، png، webp، إلخ) |
| channels | number | عدد قنوات الألوان |
| hasAlpha | boolean | ما إذا كانت الصورة تحتوي على قناة alpha |
| colorSpace | string | مساحة اللون (srgb، cmyk، إلخ) |
| density | number أو null | دقة DPI/PPI |
| isProgressive | boolean | ما إذا كان JPEG يستخدم الترميز التدريجي |
| orientation | number أو null | قيمة اتجاه EXIF (1-8) |
| hasProfile | boolean | ما إذا كان ملف تعريف ICC مُضمّناً |
| hasExif | boolean | ما إذا كانت بيانات EXIF الوصفية موجودة |
| hasIcc | boolean | ما إذا كان ملف تعريف لون ICC موجوداً |
| hasXmp | boolean | ما إذا كانت بيانات XMP الوصفية موجودة |
| bitDepth | string أو null | البتات لكل عينة |
| pages | number | عدد الصفحات (للصيغ متعددة الصفحات مثل TIFF وGIF) |
| histogram | array | إحصائيات لكل قناة (الأدنى، الأعلى، المتوسط، الانحراف المعياري) |

## ملاحظات {#notes}

- هذه نقطة نهاية للقراءة فقط. لا تُنتج ملف مخرجات قابلاً للتنزيل ولا `jobId`.
- بالنسبة لصور صيغة RAW (DNG وCR2 وNEF وARW وإلخ)، يُستخدم ExifTool لاستخراج أبعاد المستشعر الحقيقية وأعلام البيانات الوصفية التي لا يستطيع Sharp قراءتها مباشرة.
- تُفك ترميز ملفات HEIC/HEIF إلى PNG داخلياً لاستخراج إحصائيات البكسل، لأن Sharp لا يستطيع فك ترميز بكسلات HEVC.
- يوفّر الرسم البياني الأدنى/الأعلى/المتوسط/الانحراف المعياري لكل قناة، وليس توزيعاً كاملاً من 256 خانة.
- يعكس حقل `density` بيانات DPI الوصفية المُضمّنة، إن وُجدت.
