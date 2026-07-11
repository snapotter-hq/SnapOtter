---
description: "تحرير حقول بيانات EXIF وIPTC وGPS وXMP الوصفية في الصور دون إعادة ترميز البكسلات."
i18n_source_hash: a37746db11c3
i18n_provenance: human
i18n_output_hash: 476b3bfa39e7
---

# Edit Metadata {#edit-metadata}

حرّر حقول البيانات الوصفية للصورة بما في ذلك EXIF وIPTC وإحداثيات GPS والتواريخ والكلمات المفتاحية. يستخدم ExifTool خلف الكواليس، لذا تُكتَب البيانات الوصفية في مكانها دون إعادة ترميز البكسلات، مع الحفاظ على جودة الصورة الكاملة.

## API Endpoints {#api-endpoints}

### Edit Metadata {#edit-metadata-1}

`POST /api/v1/tools/image/edit-metadata`

يكتب حقول البيانات الوصفية إلى الصورة ويعيد الملف المعدّل.

### Inspect Metadata {#inspect-metadata}

`POST /api/v1/tools/image/edit-metadata/inspect`

يعيد البيانات الوصفية الكاملة من الصورة عبر ExifTool بصيغة JSON. لا يعدّل الصورة.

## Parameters (Edit) {#parameters-edit}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| title | string | No | - | عنوان الصورة (XMP/EXIF) |
| author | string | No | - | اسم المؤلف |
| artist | string | No | - | اسم الفنان (وسم EXIF Artist) |
| copyright | string | No | - | إشعار حقوق النشر |
| imageDescription | string | No | - | وصف الصورة (EXIF) |
| software | string | No | - | وسم البرنامج |
| dateTime | string | No | - | قيمة EXIF DateTime |
| dateTimeOriginal | string | No | - | قيمة EXIF DateTimeOriginal |
| setAllDates | string | No | - | تعيين جميع حقول التاريخ دفعة واحدة |
| dateShift | string | No | - | إزاحة جميع التواريخ بمقدار محدد (الصيغة: `+HH:MM` أو `-HH:MM`) |
| clearGps | boolean | No | `false` | إزالة جميع بيانات GPS |
| gpsLatitude | number | No | - | تعيين خط عرض GPS (-90 إلى 90) |
| gpsLongitude | number | No | - | تعيين خط طول GPS (-180 إلى 180) |
| gpsAltitude | number | No | - | تعيين ارتفاع GPS بالأمتار |
| keywords | string[] | No | - | الكلمات المفتاحية/الوسوم المراد إضافتها أو تعيينها |
| keywordsMode | string | No | `"add"` | كيفية التعامل مع الكلمات المفتاحية: `add` (إلحاق) أو `set` (استبدال) |
| fieldsToRemove | string[] | No | `[]` | قائمة بأسماء حقول بيانات وصفية محددة لإزالتها |
| iptcTitle | string | No | - | IPTC Object Name |
| iptcHeadline | string | No | - | IPTC Headline |
| iptcCity | string | No | - | IPTC City |
| iptcState | string | No | - | IPTC Province/State |
| iptcCountry | string | No | - | IPTC Country |

## Example Request {#example-request}

تعيين المؤلف وحقوق النشر:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/edit-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"author": "Jane Smith", "copyright": "2024 Jane Smith"}'
```

تعيين إحداثيات GPS:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/edit-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"gpsLatitude": 48.8566, "gpsLongitude": 2.3522, "gpsAltitude": 35}'
```

إزالة GPS وإضافة كلمات مفتاحية:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/edit-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"clearGps": true, "keywords": ["landscape", "sunset"], "keywordsMode": "add"}'
```

فحص البيانات الوصفية:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/edit-metadata/inspect \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg"
```

## Example Response (Edit) {#example-response-edit}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2452000
}
```

## Notes {#notes}

- تتطلب هذه الأداة تثبيت ExifTool على الخادم. وهو مضمّن في صورة Docker.
- تُكتَب البيانات الوصفية في مكانها، لذا لا يحدث أي إعادة ترميز للبكسلات. تغيّر حجم الملف ضئيل (فقط بايتات البيانات الوصفية).
- يُزيح المُعامِل `dateShift` جميع حقول التاريخ بالمقدار المحدد، وهو مفيد لتصحيح أخطاء المنطقة الزمنية (مثل `+02:00` أو `-05:30`).
- إذا لم تُطلَب أي تغييرات (جميع المُعامِلات محذوفة أو فارغة)، يُعاد الملف الأصلي دون تغيير.
- الصيغ المدعومة: JPEG وPNG وWebP وAVIF وTIFF وGIF وHEIC/HEIF.
- للصيغ غير القابلة للمعاينة في المتصفح (HEIF وTIFF)، تتضمن الاستجابة حقل `previewUrl` مع معاينة WebP.
