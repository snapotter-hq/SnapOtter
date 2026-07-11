---
description: "استبدال خلفية الصورة بلون خالص أو تدرّج لوني باستخدام الذكاء الاصطناعي."
i18n_source_hash: 930fe8890e55
i18n_provenance: human
i18n_output_hash: 4af778e4a89c
---

# استبدال الخلفية {#background-replace}

استبدل خلفية الصورة بلون خالص أو تدرّج لوني. يكتشف نموذج الذكاء الاصطناعي الموضوع، ويزيل الخلفية الأصلية، ويركّب الموضوع على الخلفية التي اخترتها.

## نقطة نهاية API {#api-endpoint}

`POST /api/v1/tools/image/background-replace`

يقبل بيانات نموذج متعدّد الأجزاء (multipart) مع ملف صورة وحقل `settings` بصيغة JSON.

## المعاملات {#parameters}

| المعامل | النوع | مطلوب | الافتراضي | الوصف |
|-----------|------|----------|---------|-------------|
| backgroundType | string | لا | `"color"` | وضع الخلفية: `color` أو `gradient` |
| color | string | لا | `"#ffffff"` | لون الخلفية بصيغة hex (عندما يكون backgroundType هو `color`) |
| gradientColor1 | string | لا | - | أول لون تدرّج بصيغة hex |
| gradientColor2 | string | لا | - | ثاني لون تدرّج بصيغة hex |
| gradientAngle | integer | لا | `180` | زاوية التدرّج بالدرجات (0-360) |
| feather | integer | لا | `0` | نصف قطر تنعيم الحواف (0-20) |
| format | string | لا | `"png"` | صيغة المخرجات: `png` أو `webp` |

## مثال على الطلب {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/background-replace \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"backgroundType": "color", "color": "#2563eb", "feather": 2}'
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
- تُفكَّك مدخلات HEIC وRAW وPSD وSVG تلقائيًا قبل المعالجة.
- تتخذ المخرجات صيغة PNG افتراضيًا للحفاظ على الشفافية حول الموضوع.
