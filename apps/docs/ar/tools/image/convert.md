---
description: "تحويل الصور بين الصيغ بما في ذلك الصيغ الحديثة مثل AVIF وJXL وHEIC."
i18n_source_hash: 2639f333073f
i18n_provenance: human
i18n_output_hash: c4d219043dd6
---

# تحويل الصورة {#convert}

حوّل الصور بين الصيغ. يدعم صيغ الويب الشائعة إضافة إلى صيغ متخصصة مثل HEIC وJXL وBMP وICO وJP2 وQOI وPSD.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/convert`

يقبل بيانات نموذج multipart تحتوي على ملف صورة وحقل JSON باسم `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | Yes | - | الصيغة المستهدفة: `jpg`، `png`، `webp`، `avif`، `tiff`، `gif`، `heic`، `heif`، `jxl`، `bmp`، `ico`، `jp2`، `qoi`، `psd`، `ppm`، `eps`، `tga` |
| quality | number | No | - | جودة الإخراج (1-100). تنطبق على الصيغ ذات الفقد مثل jpg وwebp وavif وheic. |

## Supported Output Formats {#supported-output-formats}

| Format | Type | Notes |
|--------|------|-------|
| jpg | ذات فقد | JPEG، أفضل توافق |
| png | بلا فقد | يدعم الشفافية |
| webp | كلاهما | صيغة ويب حديثة، ضغط جيد |
| avif | ذات فقد | صيغة الجيل القادم، ضغط ممتاز |
| tiff | كلاهما | سير عمل الطباعة/النشر |
| gif | بلا فقد | محدودة بـ 256 لونًا |
| heic / heif | ذات فقد | صيغة منظومة Apple |
| jxl | كلاهما | JPEG XL، صيغة الجيل القادم |
| bmp | بلا فقد | صورة نقطية غير مضغوطة |
| ico | بلا فقد | صيغة أيقونة Windows |
| jp2 | ذات فقد | JPEG 2000 |
| qoi | بلا فقد | صيغة Quite OK Image |
| psd | متعددة الطبقات | Adobe Photoshop (يتطلب ImageMagick) |
| ppm | بلا فقد | Portable Pixmap (PPM/PGM/PBM) |
| eps | متجهية | Encapsulated PostScript |
| tga | بلا فقد | صيغة صورة Targa |

## Example Request {#example-request}

التحويل إلى WebP:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/convert \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"format": "webp", "quality": 85}'
```

التحويل إلى PNG (بلا فقد):

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/convert \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"format": "png"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.webp",
  "originalSize": 2450000,
  "processedSize": 680000
}
```

## Notes {#notes}

- يُحدَّث امتداد اسم ملف الإخراج تلقائيًا ليطابق الصيغة المستهدفة.
- تُنقَّط مدخلات SVG عند 300 DPI قبل التحويل.
- يتطلب تحويل PSD تثبيت ImageMagick على الخادم.
- تستخدم BMP وEPS وICO وJP2 وJXL وPPM وQOI وTGA مُرمِّزات CLI متخصصة وتتجاوز معالجة Sharp.
- يستخدم ترميز HEIC/HEIF مكتبة مُرمِّز HEIC في النظام.
- صيغ الإدخال واسعة: JPEG وPNG وWebP وAVIF وTIFF وGIF وHEIC وRAW (CR2 وNEF وARW وغيرها) وPSD وSVG وBMP والمزيد.
