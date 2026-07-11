---
description: "تحويل الصور إلى data URIs بترميز base64 للتضمين في HTML وCSS والمزيد."
i18n_source_hash: ba4b8f3b4ece
i18n_provenance: human
i18n_output_hash: 62301a0edbe2
---

# صورة إلى Base64 {#image-to-base64}

حوّل صورة واحدة أو أكثر إلى سلاسل مُرمّزة بـ base64 وdata URIs. يدعم تحويل الصيغة الاختياري والتحكم في الجودة وإعادة التحجيم. مفيد لتضمين الصور مباشرة في HTML أو CSS أو JSON أو قوالب البريد الإلكتروني.

## نقطة نهاية API {#api-endpoint}

`POST /api/v1/tools/image/image-to-base64`

يقبل بيانات نموذج multipart تحتوي على ملف صورة واحد أو أكثر وحقل JSON اختياري `settings`.

## المعاملات {#parameters}

| المعامل | النوع | مطلوب | الافتراضي | الوصف |
|-----------|------|----------|---------|-------------|
| outputFormat | string | لا | `"original"` | التحويل قبل الترميز: `original`، `jpeg`، `png`، `webp`، `avif`، `jxl` |
| quality | number | لا | `80` | جودة المخرجات للصيغ ذات الفقدان (1 إلى 100) |
| maxWidth | number | لا | `0` | أقصى عرض بالبكسل (0 = بلا إعادة تحجيم، لن يتم التكبير) |
| maxHeight | number | لا | `0` | أقصى ارتفاع بالبكسل (0 = بلا إعادة تحجيم، لن يتم التكبير) |

## مثال على طلب {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-base64 \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@icon.png" \
  -F 'settings={"outputFormat": "webp", "quality": 80, "maxWidth": 200}'
```

ملفات متعددة:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-base64 \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@icon1.png" \
  -F "file=@icon2.png" \
  -F "file=@icon3.png" \
  -F 'settings={"outputFormat": "original"}'
```

## مثال على استجابة {#example-response}

```json
{
  "results": [
    {
      "filename": "icon.png",
      "mimeType": "image/webp",
      "width": 200,
      "height": 200,
      "originalSize": 45000,
      "encodedSize": 28800,
      "overheadPercent": -36.0,
      "base64": "UklGRlYAAABXRUJQ...",
      "dataUri": "data:image/webp;base64,UklGRlYAAABXRUJQ..."
    }
  ],
  "errors": []
}
```

## حقول الاستجابة {#response-fields}

| الحقل | النوع | الوصف |
|-------|------|-------------|
| results | array | الصور التي تم تحويلها بنجاح |
| errors | array | الصور التي فشلت في المعالجة (مع اسم الملف ورسالة الخطأ) |

### كائن النتيجة {#result-object}

| الحقل | النوع | الوصف |
|-------|------|-------------|
| filename | string | اسم الملف الأصلي |
| mimeType | string | نوع MIME للمخرجات المُرمّزة |
| width | number | العرض النهائي بالبكسل (بعد أي إعادة تحجيم) |
| height | number | الارتفاع النهائي بالبكسل (بعد أي إعادة تحجيم) |
| originalSize | number | حجم الملف الأصلي بالبايت |
| encodedSize | number | حجم سلسلة base64 بالبايت |
| overheadPercent | number | نسبة فرق الحجم مقابل الأصل (موجب = أكبر، سالب = أصغر) |
| base64 | string | بيانات الصورة الخام المُرمّزة بـ base64 |
| dataUri | string | data URI كامل جاهز للاستخدام في سمات `src` |

## ملاحظات {#notes}

- عادةً ما يزيد ترميز base64 الحجم بنحو 33٪ مقارنةً بالملف الثنائي. يُظهر حقل `overheadPercent` الفرق الفعلي.
- عندما يكون `outputFormat` هو `"original"`، تُحوَّل ملفات HEIC/HEIF إلى JPEG (لأن المتصفحات لا تستطيع عرض HEIC في data URIs).
- يعيد خيارا `maxWidth` و`maxHeight` التحجيم باستخدام `fit: inside` مع `withoutEnlargement`، لذا لا يتم تكبير الصور الأصغر من الأبعاد المحددة.
- يمكن معالجة ملفات متعددة في طلب واحد. تتم معالجة كل ملف على حدة، والفشل لا يمنع نجاح الملفات الأخرى.
- تُمرَّر ملفات SVG كما هي بصيغة `image/svg+xml` دون إعادة ترميز (ما لم يُطلب تحويل صيغة).
- هذه نقطة نهاية للقراءة فقط. لا تُنتج ملفاً قابلاً للتنزيل ولا `jobId`. تُرجَع بيانات base64 مباشرة في جسم الاستجابة.
