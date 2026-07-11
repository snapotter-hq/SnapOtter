---
description: "تمويه الخلفية مع الحفاظ على وضوح الموضوع باستخدام الذكاء الاصطناعي."
i18n_source_hash: 9073f10e6e9d
i18n_provenance: human
i18n_output_hash: de4d8b4f37a2
---

# تمويه الخلفية {#blur-background}

موّه خلفية الصورة مع الحفاظ على وضوح الموضوع. يعزل نموذج الذكاء الاصطناعي الموضوع، ويطبّق تمويهًا على الخلفية الأصلية، ويركّب الموضوع الواضح فوقها.

## نقطة نهاية API {#api-endpoint}

`POST /api/v1/tools/image/blur-background`

يقبل بيانات نموذج متعدّد الأجزاء (multipart) مع ملف صورة وحقل `settings` بصيغة JSON.

## المعاملات {#parameters}

| المعامل | النوع | مطلوب | الافتراضي | الوصف |
|-----------|------|----------|---------|-------------|
| intensity | integer | لا | `50` | شدّة التمويه (1-100) |
| feather | integer | لا | `0` | نصف قطر تنعيم الحواف (0-20) |
| format | string | لا | `"png"` | صيغة المخرجات: `png` أو `webp` |

## مثال على الطلب {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/blur-background \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"intensity": 75, "feather": 3}'
```

## مثال على الاستجابة {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

تابِع التقدّم عبر SSE على `GET /api/v1/jobs/{jobId}/progress`. عند اكتمال المهمّة، يُصدر بثّ SSE حدث `completed` مع رابط التنزيل.

## ملاحظات {#notes}

- هذه أداة مدعومة بالذكاء الاصطناعي تُرجع `202 Accepted` وتعالج بشكل غير متزامن. اتّصل بنقطة نهاية SSE لتلقّي تحديثات التقدّم والنتيجة النهائية.
- يتطلّب تثبيت حزمة ميزة **background-removal**. يُرجع `501` إذا لم تكن الحزمة متوفّرة.
- تُنتج القيم الأعلى للشدّة تأثير تمويه أقوى. تُنشئ القيم فوق 80 فصلًا بارزًا يشبه البوكيه.
- تُفكَّك مدخلات HEIC وRAW وPSD وSVG تلقائيًا قبل المعالجة.
