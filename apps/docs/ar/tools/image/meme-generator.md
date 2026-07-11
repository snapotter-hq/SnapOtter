---
description: "إنشاء الميمات باستخدام القوالب أو الصور المخصصة، وصناديق نص منسّقة، وخيارات الخطوط."
i18n_source_hash: 0a4970112ca6
i18n_provenance: human
i18n_output_hash: 70a79e6dcc11
---

# مولّد الميمات {#meme-generator}

أنشئ ميمات باستخدام القوالب المدمجة أو الصور المخصصة. أضف نصًا بتنسيق الميم الكلاسيكي (نص عريض وذو حدود خارجية)، وإعدادات تخطيط متعددة، وخيارات خطوط.

## نقطة نهاية الـ API {#api-endpoint}

`POST /api/v1/tools/image/meme-generator`

يقبل أحد الأمرين:
- **بيانات نموذج متعدد الأجزاء (Multipart form data)** مع ملف صورة وحقل JSON باسم `settings` (وضع الصورة المخصصة)
- **جسم JSON** مع `templateId` (وضع القالب، لا حاجة لرفع ملف)

## المعاملات {#parameters}

| المعامل | النوع | مطلوب | القيمة الافتراضية | الوصف |
|-----------|------|----------|---------|-------------|
| templateId | string | لا | - | معرّف قالب الميم المدمج. إذا تم توفيره، فلا حاجة لرفع صورة |
| textLayout | string | لا | `"top-bottom"` | تخطيط صندوق النص: `top-bottom`، `top-only`، `bottom-only`، `center`، `side-by-side` |
| textBoxes | array | لا | `[]` | مصفوفة من كائنات صناديق النص تحتوي على حقلي `id` و `text` |
| fontFamily | string | لا | `"anton"` | الخط: `anton`، `arial-black`، `comic-sans`، `montserrat`، `bebas-neue`، `permanent-marker`، `roboto` |
| fontSize | number | لا | تلقائي | حجم الخط بالبكسل (8 إلى 200). يُحسب تلقائيًا إذا تم حذفه |
| textColor | string | لا | `"#ffffff"` | لون تعبئة النص |
| strokeColor | string | لا | `"#000000"` | لون حدود/إطار النص الخارجي |
| textAlign | string | لا | `"center"` | محاذاة النص: `left`، `center`، `right` |
| allCaps | boolean | لا | `true` | تحويل النص إلى أحرف كبيرة |

### صناديق النص {#text-boxes}

يجب أن يحتوي كل عنصر في مصفوفة `textBoxes` على:

| الحقل | النوع | الوصف |
|-------|------|-------------|
| id | string | معرّف الصندوق المطابق للتخطيط (مثل `"top"`، `"bottom"`، `"left"`، `"right"`، `"center"`) |
| text | string | نص الميم المراد عرضه |

### معرّفات صناديق تخطيط النص {#text-layout-box-ids}

| التخطيط | معرّفات الصناديق المتاحة |
|--------|-------------------|
| `top-bottom` | `top`، `bottom` |
| `top-only` | `top` |
| `bottom-only` | `bottom` |
| `center` | `center` |
| `side-by-side` | `left`، `right` |

## مثال على الطلب {#example-request}

صورة مخصصة مع نص علوي وسفلي:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/meme-generator \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"textLayout": "top-bottom", "textBoxes": [{"id": "top", "text": "When the code works"}, {"id": "bottom", "text": "On the first try"}], "fontFamily": "anton", "allCaps": true}'
```

باستخدام قالب مدمج (جسم JSON، بدون رفع ملف):

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/meme-generator \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"templateId": "drake", "textBoxes": [{"id": "top", "text": "Manual testing"}, {"id": "bottom", "text": "Automated tests"}]}'
```

## مثال على الاستجابة {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/meme-drake.png",
  "originalSize": 450000,
  "processedSize": 520000
}
```

## ملاحظات {#notes}

- يجب توفير إما `templateId` أو ملف صورة مرفوع. عند توفير كليهما يُستخدم القالب.
- تحدد القوالب مواضع صناديق النص الخاصة بها؛ ويُتجاهل المعامل `textLayout` عند استخدام القوالب.
- يُعرض النص بصيغة SVG مع حدود خارجية لإضفاء مظهر الميم الكلاسيكي.
- يُحسب حجم الخط تلقائيًا ليناسب صندوق النص إذا لم يُضبط صراحةً.
- تُتجاوز صناديق النص الفارغة (لا يحدث أي عرض إذا كانت جميع الصناديق فارغة).
- يتضمن اسم ملف الإخراج معرّف القالب عند استخدام القوالب (مثل `meme-drake.png`).
- تُفكّ ترميزات مدخلات HEIC وRAW وPSD وSVG تلقائيًا قبل المعالجة.
