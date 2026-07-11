---
description: "إزالة بيانات EXIF وGPS وICC وXMP الوصفية من الصور من أجل الخصوصية وتصغير أحجام الملفات."
i18n_source_hash: e89147734fd0
i18n_provenance: human
i18n_output_hash: 0ae6fb6a5ae7
---

# إزالة البيانات الوصفية {#remove-metadata}

أزل بيانات EXIF وGPS وملفات ألوان ICC وبيانات XMP الوصفية من الصور. مفيد للخصوصية (إزالة إحداثيات GPS ومعلومات الكاميرا) وتقليل حجم الملف.

## نقاط نهاية API {#api-endpoints}

### إزالة البيانات الوصفية {#strip-metadata}

`POST /api/v1/tools/image/strip-metadata`

يعالج الصورة ويُرجع نسخة نظيفة مع إزالة البيانات الوصفية المحددة.

### فحص البيانات الوصفية {#inspect-metadata}

`POST /api/v1/tools/image/strip-metadata/inspect`

يُرجع البيانات الوصفية المحللة بصيغة JSON دون تعديل الصورة. مفيد لمعاينة البيانات الوصفية الموجودة قبل إزالتها.

## المعاملات (الإزالة) {#parameters-strip}

| المعامل | النوع | مطلوب | الافتراضي | الوصف |
|-----------|------|----------|---------|-------------|
| stripExif | boolean | لا | `false` | إزالة بيانات EXIF (إعدادات الكاميرا، التواريخ، إلخ) |
| stripGps | boolean | لا | `false` | إزالة بيانات GPS/الموقع فقط |
| stripIcc | boolean | لا | `false` | إزالة ملف ألوان ICC |
| stripXmp | boolean | لا | `false` | إزالة بيانات XMP الوصفية (Adobe، IPTC) |
| stripAll | boolean | لا | `true` | إزالة كل البيانات الوصفية دفعة واحدة |

عندما تكون `stripAll` هي `true`، فإنها تتجاوز الأعلام الفردية وتزيل كل شيء.

## مثال طلب {#example-request}

إزالة كل البيانات الوصفية:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/strip-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"stripAll": true}'
```

إزالة بيانات GPS فقط (مع الاحتفاظ بمعلومات الكاميرا وملف الألوان):

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/strip-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"stripAll": false, "stripGps": true}'
```

فحص البيانات الوصفية دون تعديل:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/strip-metadata/inspect \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg"
```

## مثال استجابة (الإزالة) {#example-response-strip}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2380000
}
```

## مثال استجابة (الفحص) {#example-response-inspect}

```json
{
  "filename": "photo.jpg",
  "fileSize": 2450000,
  "exif": {
    "Make": "Canon",
    "Model": "EOS R5",
    "DateTimeOriginal": "2024:03:15 14:30:00",
    "ExposureTime": "1/250",
    "FNumber": 2.8,
    "ISO": 400
  },
  "gps": {
    "GPSLatitudeRef": "N",
    "GPSLatitude": [37, 46, 30],
    "_latitude": 37.775,
    "_longitude": -122.4183
  },
  "icc": {
    "Profile Size": "3144 bytes",
    "Color Space": "RGB",
    "Description": "sRGB IEC61966-2.1"
  },
  "xmp": {
    "CreatorTool": "Adobe Photoshop 25.0"
  }
}
```

## ملاحظات {#notes}

- تُعاد ترميز الصورة بصيغتها الأصلية بعد الإزالة. يستخدم JPEG محرك mozjpeg بجودة 90، وPNG يستخدم مستوى الضغط 9، وWebP يستخدم جودة 85.
- قد تؤدي إزالة ملفات ICC إلى انزياحات لونية طفيفة إذا كانت الصورة موسومة بملف غير sRGB. استخدم `stripIcc: false` إذا كانت دقة الألوان مهمة.
- تحلل نقطة نهاية الفحص إحداثيات GPS إلى قيم عشرية لخط العرض/الطول (مسبوقة بشرطة سفلية) للتيسير.
- صيغ المدخلات المدعومة: JPEG، PNG، WebP، AVIF، TIFF، GIF.
