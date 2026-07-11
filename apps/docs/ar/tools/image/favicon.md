---
description: "إنشاء جميع أحجام أيقونات favicon وأيقونات التطبيقات القياسية من صورة مصدر."
i18n_source_hash: 3a6451a94b7a
i18n_provenance: human
i18n_output_hash: 2869b8daff33
---

# مولّد Favicon {#favicon-generator}

أنشئ مجموعة كاملة من ملفات favicon وأيقونات التطبيقات من صورة مصدر. يُنتج جميع الأحجام القياسية التي تحتاجها المتصفحات وأجهزة Apple وAndroid، إلى جانب web manifest ومقتطف HTML.

## نقطة نهاية API {#api-endpoint}

`POST /api/v1/tools/image/favicon`

يقبل بيانات نموذج multipart تحتوي على ملف صورة واحد أو أكثر وحقل JSON اختياري `settings`.

## المعاملات {#parameters}

| المعامل | النوع | مطلوب | الافتراضي | الوصف |
|-----------|------|----------|---------|-------------|
| background | string | لا | - | لون خلفية hex (مثل `"#ffffff"`). عند تعيينه، يتم تسطيح الأيقونة فوق هذا اللون. |
| padding | integer | لا | `0` | نسبة الحشو حول محتوى الأيقونة (0 إلى 40) |
| radius | integer | لا | `0` | نسبة نصف قطر الزوايا للأيقونات المستديرة (0 إلى 50) |
| sizes | integer[] | لا | - | تقييد المخرجات على أحجام بكسل محددة (مثل `[16, 32, 180]`). احذفه لإنشاء جميع الأحجام القياسية. |
| themeColor | string | لا | `"#ffffff"` | لون السمة hex الخاص بـ web manifest |

## الملفات المُنشأة {#generated-files}

لكل صورة إدخال، يتم إنتاج الملفات التالية:

| الملف | الحجم | الغرض |
|------|------|---------|
| `favicon-16x16.png` | 16x16 | أيقونة تبويب المتصفح |
| `favicon-32x32.png` | 32x32 | أيقونة تبويب المتصفح (HiDPI) |
| `favicon-48x48.png` | 48x48 | اختصار سطح المكتب |
| `apple-touch-icon.png` | 180x180 | شاشة iOS الرئيسية |
| `android-chrome-192x192.png` | 192x192 | شاشة Android الرئيسية |
| `android-chrome-512x512.png` | 512x512 | شاشة بدء تشغيل Android |
| `favicon.ico` | 32x32 | صيغة ICO القديمة |
| `manifest.json` | - | web app manifest مع مراجع الأيقونات |
| `favicon-snippet.html` | - | وسوم رابط HTML جاهزة للاستخدام |

## مثال على طلب {#example-request}

صورة مصدر واحدة بزوايا مستديرة وحشو:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/favicon \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@logo.png" \
  -F 'settings={"padding": 10, "radius": 20, "themeColor": "#0a0a0a"}'
```

صور مصدر متعددة (كل واحدة تحصل على مجموعتها الخاصة في مجلد فرعي):

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/favicon \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@logo-light.png" \
  -F "file=@logo-dark.png"
```

## مثال على استجابة {#example-response}

الاستجابة عبارة عن ملف ZIP يُبث مباشرة. ترويسات الاستجابة هي:

```
Content-Type: application/zip
Content-Disposition: attachment; filename="favicons-a1b2c3d4.zip"
```

## مقتطف HTML المُضمّن {#html-snippet-included}

يتضمن ملف ZIP ملف `favicon-snippet.html` يمكنك لصقه في `<head>` الخاص بـ HTML:

```html
<!-- Favicons -->
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="48x48" href="/favicon-48x48.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="manifest" href="/manifest.json">
```

## ملاحظات {#notes}

- تتم إعادة تحجيم صور المصدر باستخدام وضع الملاءمة `cover`، ما يعني أنه يتم اقتصاصها لملء كل حجم مربع. للحصول على أفضل النتائج، استخدم صورة مصدر مربعة.
- عند رفع ملفات متعددة، يحصل كل ملف على مجلده الفرعي الخاص في ZIP (باسم ملف المصدر).
- عند رفع ملف واحد، تكون جميع المخرجات في جذر ZIP دون مجلد فرعي.
- يتم تخطي الملفات التي تفشل في التحقق أو فك الترميز، ويُضمّن ملف `skipped-files.txt` في ZIP يشرح المشكلات.
- صيغ الإدخال المدعومة: JPEG وPNG وWebP وAVIF وTIFF وGIF وHEIC وSVG وRAW وPSD والمزيد.
- يتم تطبيق اتجاه EXIF تلقائياً قبل إعادة التحجيم.
