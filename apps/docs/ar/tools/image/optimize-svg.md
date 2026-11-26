---
description: "تصغير ملفات SVG باستخدام svgo مع الإبقاء على النتيجة بصيغة SVG متجهي، مع تحكم في الدقة والمرور المتعدد والبيانات الوصفية والتنسيق."
i18n_source_hash: c2601cc2cdd8
i18n_provenance: machine
i18n_output_hash: b8859d106a8b
i18n_hash_version: 2
---

# تحسين SVG {#optimize-svg}

قلّل حجم ملفات SVG بإزالة بقايا المحرر والسمات الزائدة والخانات العشرية الفائضة، ثم نزّل النتيجة بصيغة SVG. بخلاف «تحسين للويب»، لا تُحوَّل المخرجات إلى صورة نقطية أبدًا.

## نقطة نهاية الـ API {#api-endpoint}

`POST /api/v1/tools/image/optimize-svg`

يقبل بيانات نموذج multipart مع ملف `.svg` أو `.svgz` وحقل JSON باسم `settings`.

## المعاملات {#parameters}

| المعامل | النوع | مطلوب | القيمة الافتراضية | الوصف |
|-----------|------|----------|---------|-------------|
| precision | number | لا | `3` | عدد الخانات العشرية المحتفظ بها في بيانات المسارات والأرقام (من 0 إلى 8). القيم الأقل تعطي ملفات أصغر ومنحنيات أخشن قليلًا. |
| multipass | boolean | لا | `true` | تشغيل المحسِّن مرارًا حتى يتوقف المخرج عن التقلص |
| removeMetadata | boolean | لا | `true` | إزالة التعليقات و`<metadata>` و`<desc>` والبيانات الخاصة بالمحررات. أوقفه للإبقاء عليها. |
| pretty | boolean | لا | `false` | إضافة مسافات بادئة للمخرجات لسهولة القراءة بدل تصغيرها في أسطر قليلة |

## مثال على الطلب {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/optimize-svg \
  -F "file=@logo.svg" \
  -F 'settings={"precision":3,"multipass":true,"removeMetadata":true,"pretty":false}'
```

## مثال على الاستجابة {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/logo.svg",
  "originalSize": 48213,
  "processedSize": 17904
}
```

## ملاحظات {#notes}

- يجب أن يكون الإدخال ملف SVG أو SVGZ. تُرفض الصورة النقطية مع `400` والرمز `IMAGE_UNDECODABLE`.
- يُفك ضغط إدخال `.svgz` أولًا، ويكون المخرج دائمًا `.svg` عاديًا.
- يقتصر حجم SVG على 10 ميغابايت بعد فك الضغط. يُرفض الملف الأكبر مع `400` والرمز `SVG_TOO_LARGE`.
- يُحتفظ دائمًا بـ`viewBox` و`<title>`، لذا يظل الرسم قابلًا للتحجيم ويحتفظ باسمه الميسَّر.
- يمر الإدخال والمخرج كلاهما عبر منقّي SVG الذي يزيل السكربتات والمحتوى النشط الآخر.
- خفض `precision` هو أكبر وفر في الحجم للرسومات الكثيرة المسارات. افحص النتيجة بصريًا عند القيم من 0 إلى 2.
