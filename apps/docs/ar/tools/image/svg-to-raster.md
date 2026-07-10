---
description: "تحويل ملفات SVG إلى PNG أو JPEG أو WebP أو AVIF أو TIFF أو GIF أو HEIF أو JXL بدقة وكثافة DPI مخصصة، مع دعم الدفعات."
i18n_source_hash: cf36830f8797
i18n_provenance: human
i18n_output_hash: 3d64f5b26344
---

# SVG إلى صورة نقطية {#svg-to-raster}

حوّل ملفات SVG إلى صيغ صور نقطية (PNG أو JPEG أو WebP أو AVIF أو TIFF أو GIF أو HEIF أو JXL) بدقة وكثافة DPI مخصصة. يدعم أيضًا التحويل الدفعي لعدة ملفات SVG.

## نقطة نهاية API {#api-endpoint}

`POST /api/v1/tools/image/svg-to-raster`

## المعاملات {#parameters}

| المعامل | النوع | مطلوب | الافتراضي | الوصف |
|-----------|------|----------|---------|-------------|
| width | integer | لا | - | العرض المستهدف بالبكسل (1 إلى 65536). يحافظ على نسبة الأبعاد إذا ضُبط بُعد واحد فقط. |
| height | integer | لا | - | الارتفاع المستهدف بالبكسل (1 إلى 65536). يحافظ على نسبة الأبعاد إذا ضُبط بُعد واحد فقط. |
| dpi | integer | لا | 300 | كثافة DPI للتصيير، تتحكم في كثافة التنقيط الأساسية (36 إلى 2400) |
| quality | number | لا | 90 | جودة المخرجات للصيغ ذات الفقد (1 إلى 100) |
| backgroundColor | string | لا | `"#00000000"` | لون الخلفية بصيغة hex (6 أو 8 أحرف، النسخة ذات 8 أحرف تتضمن الشفافية) |
| outputFormat | string | لا | `"png"` | صيغة المخرجات: `png`، `jpg`، `webp`، `avif`، `tiff`، `gif`، `heif`، `jxl` |

## مثال طلب {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/svg-to-raster \
  -F "file=@logo.svg" \
  -F 'settings={"width":1024,"dpi":300,"outputFormat":"png","backgroundColor":"#FFFFFF"}'
```

## مثال استجابة {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/logo.png",
  "previewUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/preview.webp",
  "originalSize": 12345,
  "processedSize": 67890
}
```

## نقطة نهاية الدفعات {#batch-endpoint}

`POST /api/v1/tools/image/svg-to-raster/batch`

حوّل عدة ملفات SVG في طلب واحد. تُرجع أرشيف ZIP.

### معاملات دفعات إضافية {#additional-batch-parameters}

| المعامل | النوع | مطلوب | الافتراضي | الوصف |
|-----------|------|----------|---------|-------------|
| clientJobId | string | لا | - | معرّف مهمة اختياري يوفّره العميل لتتبع التقدّم (128 حرفًا كحد أقصى) |

### مثال طلب دفعي {#batch-example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/svg-to-raster/batch \
  -F "file=@icon1.svg" \
  -F "file=@icon2.svg" \
  -F "file=@icon3.svg" \
  -F 'settings={"width":512,"outputFormat":"png","dpi":150}'
```

### استجابة الدفعات {#batch-response}

تبثّ نقطة نهاية الدفعات ملف ZIP مباشرة مع الترويسات التالية:
- `Content-Type: application/zip`
- `X-Job-Id: <jobId>`
- `X-File-Results: <url-encoded JSON mapping of index to filename>`

## ملاحظات {#notes}

- تقبل ملفات SVG وSVGZ فقط (تتحقق من المحتوى، وليس من الامتداد فقط). تُفكّ ضغط SVGZ تلقائيًا.
- يُطهّر محتوى SVG قبل التصيير لمنع XSS وتحميل الموارد الخارجية.
- يتحكم إعداد `dpi` في الكثافة التي يُنقّط بها SVG. تنتج كثافة DPI الأعلى أبعاد بكسل أكبر من نفس منفذ عرض SVG.
- عند توفير كل من `width` و`height`، يُعاد تحجيم الصورة باستخدام `fit: inside` (مع الحفاظ على نسبة الأبعاد ضمن الحدود).
- تُضمَّن `previewUrl` في الاستجابة للصيغ التي لا تستطيع المتصفحات عرضها أصليًا (TIFF، HEIF). المعاينة هي صورة مصغّرة WebP بحجم 1200 بكسل.
- الخلفية الافتراضية `#00000000` شفافة تمامًا. اضبطها إلى `#FFFFFF` للحصول على خلفية بيضاء (مفيد مع مخرجات JPEG التي لا تدعم الشفافية).
- تحترم معالجة الدفعات تهيئة الخادم `MAX_BATCH_SIZE` وتستخدم عمّالًا متزامنين لتحسين الأداء.
- يمكن تتبع تقدّم عمليات الدفعات عبر SSE على `/api/v1/jobs/:jobId/progress`.
