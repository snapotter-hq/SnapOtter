---
description: "تحويل GIF المتحرك إلى WebP والعكس، مع الحفاظ على جميع الإطارات."
i18n_source_hash: 20946e5001cb
i18n_provenance: human
i18n_output_hash: 2b08a1d5a43a
---

# محوّل GIF/WebP {#gif-webp-converter}

حوّل ملفات GIF المتحركة إلى WebP والعكس، مع الحفاظ على جميع الإطارات وتوقيت الرسم المتحرك. عادةً ما تكون رسوم WebP المتحركة أصغر بنسبة 25-35٪ من نظيراتها من GIF.

## نقطة نهاية API {#api-endpoint}

`POST /api/v1/tools/image/gif-webp`

يقبل بيانات نموذج multipart تحتوي على ملف GIF أو WebP وحقل JSON `settings`.

## المعاملات {#parameters}

| المعامل | النوع | مطلوب | الافتراضي | الوصف |
|-----------|------|----------|---------|-------------|
| quality | integer | لا | `80` | جودة المخرجات لترميز WebP (1-100) |
| lossless | boolean | لا | `false` | استخدام ضغط WebP بدون فقدان |
| resizePercent | integer | لا | `100` | تحجيم المخرجات بالنسبة المئوية (10-100) |

## مثال على طلب {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-webp \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@animation.gif" \
  -F 'settings={"quality": 85, "resizePercent": 50}'
```

## مثال على استجابة {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/animation.webp",
  "originalSize": 3500000,
  "processedSize": 2200000
}
```

## ملاحظات {#notes}

- تُقبل ملفات `.gif` و`.webp` فقط. صيغ الصور الأخرى غير مدعومة في هذه الأداة.
- اتجاه التحويل تلقائي: إدخال GIF يُنتج مخرجات WebP، وإدخال WebP يُنتج مخرجات GIF.
- ينطبق خيارا `quality` و`lossless` فقط عند الترميز إلى WebP. عند التحويل إلى GIF، تستخدم المخرجات لوحة ألوان GIF القياسية.
- استخدم `resizePercent` لتقليل أبعاد (وحجم ملف) الرسوم المتحركة الكبيرة.
