---
description: "دمج صورة واحدة أو أكثر في مستند PDF مع خيارات حجم الصفحة والاتجاه وحجم الملف المستهدف."
i18n_source_hash: f659c7e7f56b
i18n_provenance: human
i18n_output_hash: a56718b49ca3
---

# صورة إلى PDF {#image-to-pdf}

ادمج صورة واحدة أو أكثر في مستند PDF. يدعم أحجام صفحات واتجاهات وهوامش متعددة، واستهداف حجم الملف اختيارياً عبر ضبط الجودة.

## نقطة نهاية API {#api-endpoint}

`POST /api/v1/tools/image/image-to-pdf`

يقبل بيانات نموذج multipart تحتوي على ملف صورة واحد أو أكثر وحقل JSON `settings`.

## المعاملات {#parameters}

| المعامل | النوع | مطلوب | الافتراضي | الوصف |
|-----------|------|----------|---------|-------------|
| pageSize | string | لا | `"A4"` | حجم الصفحة: `A4`، `Letter`، `A3`، `A5` |
| orientation | string | لا | `"portrait"` | اتجاه الصفحة: `portrait` أو `landscape` |
| margin | number | لا | `20` | هامش الصفحة بالنقاط (0-500) |
| targetSize | object | لا | - | قيد حجم الملف المستهدف (انظر أدناه) |
| collate | boolean | لا | `true` | دمج جميع الصور في PDF واحد. إذا كان `false`، ينشئ PDF واحداً لكل صورة. |

### كائن الحجم المستهدف {#target-size-object}

| الحقل | النوع | مطلوب | الوصف |
|-------|------|----------|-------------|
| value | number | نعم | قيمة الحجم المستهدف |
| unit | string | نعم | الوحدة: `KB` أو `MB` |

الحد الأدنى للحجم المستهدف هو 50 كيلوبايت.

## مثال على طلب {#example-request}

PDF متعدد الصور أساسي:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@page1.jpg" \
  -F "file=@page2.jpg" \
  -F "file=@page3.jpg" \
  -F 'settings={"pageSize": "A4", "orientation": "portrait", "margin": 20}'
```

مع حجم ملف مستهدف:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@scan1.jpg" \
  -F "file=@scan2.jpg" \
  -F 'settings={"pageSize": "Letter", "targetSize": {"value": 2, "unit": "MB"}}'
```

PDF واحد لكل صورة:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo1.jpg" \
  -F "file=@photo2.jpg" \
  -F 'settings={"collate": false}'
```

## مثال على استجابة (مُجمّعة) {#example-response-collated}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/images.pdf",
  "originalSize": 5000000,
  "processedSize": 1200000,
  "pages": 3
}
```

## مثال على استجابة (غير مُجمّعة) {#example-response-non-collated}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/images.zip",
  "originalSize": 5000000,
  "processedSize": 2400000,
  "pages": 2,
  "collated": false
}
```

## مثال على استجابة (مع حجم مستهدف) {#example-response-with-target-size}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/images.pdf",
  "originalSize": 10000000,
  "processedSize": 2000000,
  "pages": 5,
  "compression": {
    "targetRequested": 2097152,
    "targetMet": true,
    "jpegQuality": 72
  }
}
```

## ملاحظات {#notes}

- توضَع الصور في منتصف الصفحة وتُحجَّم لتلائم داخل الهوامش مع الحفاظ على نسبة العرض إلى الارتفاع. لا يتم تكبير الصور أبداً.
- عندما يكون `collate` هو `false`، تصبح كل صورة ملف PDF منفصلاً، ويكون التنزيل أرشيف ZIP يحتوي على جميع ملفات PDF.
- تستخدم ميزة الحجم المستهدف بحثاً ثنائياً تكرارياً على مستويات جودة JPEG (10-95) لإيجاد أفضل جودة تلائم الميزانية.
- تُسطَّح الصور الشفافة إلى الأبيض قبل تضمينها في PDF.
- صيغ الإدخال المدعومة: JPEG وPNG وWebP وAVIF وTIFF وGIF وHEIC وRAW وPSD وSVG والمزيد.
- يتم تطبيق اتجاه EXIF تلقائياً قبل التضمين.
