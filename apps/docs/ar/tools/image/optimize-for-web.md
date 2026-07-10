---
description: "تحسين الصور للنشر على الويب مع تحويل الصيغة والتحكم في الجودة وتغيير الحجم وإزالة البيانات الوصفية."
i18n_source_hash: c327bbbce768
i18n_provenance: human
i18n_output_hash: d080461b91b6
---

# التحسين للويب {#optimize-for-web}

حسّن الصور للنشر على الويب في خطوة واحدة. يجمع بين تحويل الصيغة وضبط الجودة وتغيير الحجم الاختياري والترميز التدريجي وإزالة البيانات الوصفية.

## نقطة نهاية الـ API {#api-endpoint}

`POST /api/v1/tools/image/optimize-for-web`

يقبل بيانات نموذج متعدد الأجزاء مع ملف صورة وحقل JSON باسم `settings`.

تتوفر أيضًا نقطة نهاية للمعاينة الحية على `POST /api/v1/tools/image/optimize-for-web/preview`، والتي تُرجع الصورة المعالَجة مباشرةً كبيانات ثنائية (دون إنشاء مساحة عمل) لضبط المعاملات في الوقت الفعلي.

## المعاملات {#parameters}

| المعامل | النوع | مطلوب | القيمة الافتراضية | الوصف |
|-----------|------|----------|---------|-------------|
| format | string | لا | `"webp"` | صيغة الإخراج: `webp`، `jpeg`، `avif`، `png`، `jxl` |
| quality | number | لا | `80` | جودة الإخراج (1-100) |
| maxWidth | number | لا | - | أقصى عرض بالبكسل. تُصغَّر الصورة إذا كانت أعرض. |
| maxHeight | number | لا | - | أقصى ارتفاع بالبكسل. تُصغَّر الصورة إذا كانت أطول. |
| progressive | boolean | لا | `true` | تفعيل الترميز التدريجي/المتشابك |
| stripMetadata | boolean | لا | `true` | إزالة البيانات الوصفية EXIF وGPS وICC وXMP |

## مثال على الطلب {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/optimize-for-web \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"format": "webp", "quality": 75, "maxWidth": 1920}'
```

التحسين إلى AVIF مع ضغط قوي:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/optimize-for-web \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"format": "avif", "quality": 50, "maxWidth": 1200, "maxHeight": 800}'
```

## مثال على الاستجابة {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.webp",
  "originalSize": 4500000,
  "processedSize": 320000
}
```

### استجابة نقطة نهاية المعاينة {#preview-endpoint-response}

تُرجع نقطة نهاية المعاينة (`/api/v1/tools/image/optimize-for-web/preview`) الصورة الثنائية مباشرةً مع ترويسات معلوماتية:

- `X-Original-Size` - حجم الملف الأصلي بالبايت
- `X-Processed-Size` - حجم الملف المعالَج بالبايت
- `X-Output-Filename` - اسم ملف الإخراج مُرمَّز بترميز عنوان URL

## ملاحظات {#notes}

- صُمّم هذا الأداة كخط تحسين شامل لأصول الويب. يتولى تحويل الصيغة وضبط الجودة وتقييد الأبعاد القصوى وإزالة البيانات الوصفية في مرور واحد.
- يُحدَّث امتداد اسم ملف الإخراج ليطابق الصيغة المختارة.
- يستخدم ترميز JXL (JPEG XL) مُرمِّزًا متخصصًا عبر سطر الأوامر. تُعالَج الصورة أولًا كـ PNG، ثم تُرمَّز إلى JXL.
- يُحسّن الترميز التدريجي وقت التحميل المُدرَك لصيغتي JPEG وPNG بالسماح للمتصفحات بعرض معاينة منخفضة الجودة قبل تحميل الصورة الكاملة.
- نقطة نهاية المعاينة أخف وزنًا (دون إنشاء مساحة عمل/مهمة) ومخصصة لواجهة ضبط المعاملات الحية في الواجهة الأمامية.
