---
description: "تحويل صفحات PDF إلى صور عالية الجودة."
i18n_source_hash: 1c36be5dadb8
i18n_provenance: human
i18n_output_hash: 70a8f3ae7039
---

# PDF to Image {#pdf-to-image}

حوّل صفحات PDF إلى صور نقطية عالية الجودة. يدعم تحديد الصفحات وصيغ إخراج متعددة والتحكّم في DPI وأوضاع الألوان. يتضمّن مسارات فرعية للمعلومات والمعاينة لفحص ملفات PDF قبل التحويل.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-to-image`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | No | `"png"` | صيغة الإخراج: `png` أو `jpg` أو `webp` أو `avif` أو `tiff` أو `gif` أو `heic` أو `heif` أو `jxl` |
| dpi | number | No | 150 | دقة العرض (من 36 إلى 2400). تُنتِج قيم DPI الأعلى صوراً أكبر وأكثر تفصيلاً. |
| quality | number | No | 85 | جودة الإخراج للصيغ ذات الفقد (من 1 إلى 100) |
| colorMode | string | No | `"color"` | وضع الألوان: `color` أو `grayscale` أو `bw` (عتبة الأبيض والأسود) |
| pages | string | No | `"all"` | تحديد الصفحات: `all` أو صفحة واحدة (`3`) أو نطاق (`1-5`) أو مفصولة بفواصل (`1,3,5-8`) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-image \
  -F "file=@document.pdf" \
  -F 'settings={"format":"png","dpi":300,"pages":"1-3","colorMode":"color"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "pageCount": 10,
  "selectedPages": [1, 2, 3],
  "format": "png",
  "pages": [
    {
      "page": 1,
      "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/page-1.png",
      "size": 234567
    },
    {
      "page": 2,
      "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/page-2.png",
      "size": 198765
    },
    {
      "page": 3,
      "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/page-3.png",
      "size": 210456
    }
  ],
  "zipUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/pdf-pages.zip",
  "zipSize": 612345
}
```

## Info Sub-Route {#info-sub-route}

`POST /api/v1/tools/pdf/pdf-to-image/info`

يُعيد عدد صفحات ملف PDF دون عرض أي صفحات.

### Info Request {#info-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-image/info \
  -F "file=@document.pdf"
```

### Info Response {#info-response}

```json
{
  "pageCount": 10
}
```

## Preview Sub-Route {#preview-sub-route}

`POST /api/v1/tools/pdf/pdf-to-image/preview`

يُعيد صوراً مصغّرة بصيغة JPEG منخفضة الدقة لجميع الصفحات على شكل عناوين بيانات base64. مفيد لبناء واجهة تحديد الصفحات.

### Preview Request {#preview-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-image/preview \
  -F "file=@document.pdf"
```

### Preview Response {#preview-response}

```json
{
  "pageCount": 10,
  "thumbnails": [
    {
      "page": 1,
      "dataUrl": "data:image/jpeg;base64,/9j/4AAQ...",
      "width": 300,
      "height": 424
    },
    {
      "page": 2,
      "dataUrl": "data:image/jpeg;base64,/9j/4AAQ...",
      "width": 300,
      "height": 424
    }
  ]
}
```

## Notes {#notes}

- يستخدم MuPDF لعرض ملفات PDF، ما يوفّر مخرجات عالية الدقة مع عرض صحيح للخطوط والرسوميات المتّجهة.
- ملفات PDF المحمية بكلمة مرور غير مدعومة وستُعيد خطأ 400.
- يدعم المعامل `pages` صيغة مرنة:
  - `"all"` أو `""` - جميع الصفحات
  - `"3"` - صفحة واحدة
  - `"1-5"` - نطاق صفحات (شامل)
  - `"1,3,5-8"` - صفحات فردية ونطاقات مختلطة
- أرقام الصفحات تبدأ من 1. تحديد صفحات تتجاوز طول المستند يُعيد خطأ 400.
- تُنشئ نقطة النهاية الرئيسية دائماً تنزيلات للصفحات الفردية وملف ZIP يحتوي على جميع الصفحات المحدّدة.
- تعرض نقطة نهاية المعاينة بدقة 72 DPI وتُقيّس إلى عرض 300 بكسل لتوليد الصور المصغّرة بسرعة. الصور المصغّرة بصيغة JPEG بجودة 60%.
- تحترم نقطة نهاية المعاينة إعداد الخادم `MAX_PDF_PAGES`، ما يحدّد عدد الصور المصغّرة المولّدة.
- بالنسبة للمستندات الكبيرة بدقة DPI عالية، يزداد وقت المعالجة تناسبياً. فكّر في استخدام دقة DPI أقل (150) للاستخدام على الويب ودقة أعلى (300 إلى 600) للطباعة.
