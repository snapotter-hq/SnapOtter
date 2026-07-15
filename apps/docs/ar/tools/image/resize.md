---
description: "تغيير حجم الصور بالبكسل أو بالنسبة المئوية أو باستخدام أوضاع الملاءمة."
i18n_source_hash: 53866e8266b8
i18n_provenance: human
i18n_output_hash: 303426ab1e7d
---

# تغيير حجم الصورة {#resize}

غيّر حجم الصور بتحديد أبعاد بكسل دقيقة، أو معامل قياس بالنسبة المئوية، أو وضع ملاءمة يتحكم في كيفية تكيّف الصورة مع الأبعاد المستهدفة.

## نقطة نهاية الـ API {#api-endpoint}

`POST /api/v1/tools/image/resize`

يقبل بيانات نموذج متعدد الأجزاء مع ملف صورة وحقل JSON باسم `settings`.

## المعاملات {#parameters}

| المعامل | النوع | مطلوب | القيمة الافتراضية | الوصف |
|-----------|------|----------|---------|-------------|
| width | integer | لا | - | العرض المستهدف بالبكسل (أقصى 16383) |
| height | integer | لا | - | الارتفاع المستهدف بالبكسل (أقصى 16383) |
| fit | string | لا | `"contain"` | كيف تلائم الصورة الأبعاد: `contain`، `cover`، `fill`، `inside`، `outside` |
| withoutEnlargement | boolean | لا | `false` | منع التكبير إذا كانت الصورة أصغر من الهدف |
| percentage | number | لا | - | القياس بالنسبة المئوية (مثل 50 لنصف الحجم) |

يجب توفير واحد على الأقل من `width` أو `height` أو `percentage`.

### أوضاع الملاءمة {#fit-modes}

- **contain** - تغيير الحجم للملاءمة ضمن الأبعاد مع الحفاظ على نسبة العرض إلى الارتفاع (قد يترك مساحة فارغة)
- **cover** - تغيير الحجم لتغطية الأبعاد مع الحفاظ على نسبة العرض إلى الارتفاع (قد يقص)
- **fill** - التمدد لمطابقة الأبعاد بالضبط (يتجاهل نسبة العرض إلى الارتفاع)
- **inside** - مثل `contain`، لكنه يُصغّر فقط ولا يُكبّر أبدًا
- **outside** - مثل `cover`، لكنه يُصغّر فقط ولا يُكبّر أبدًا

## مثال على الطلب {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"width": 800, "height": 600, "fit": "contain"}'
```

تغيير الحجم بالنسبة المئوية:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"percentage": 50}'
```

## مثال على الاستجابة {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 980000
}
```

## ملاحظات {#notes}

- أقصى بُعد هو 16383 بكسل على أي من المحورين (حد Sharp/libvips).
- تطابق صيغة الإخراج صيغة الإدخال. تُفكّ ترميزات مدخلات HEIC وRAW وPSD وSVG تلقائيًا قبل المعالجة.
- يُطبَّق اتجاه EXIF تلقائيًا قبل تغيير الحجم.
- تُعد الراية `withoutEnlargement` مفيدة في المعالجة الدفعية حيث قد تكون بعض الصور أصغر بالفعل من الهدف.
