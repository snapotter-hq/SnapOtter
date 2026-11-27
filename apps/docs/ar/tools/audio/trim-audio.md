---
description: "قص جزء من ملف صوتي عبر تحديد وقتي البداية والنهاية."
i18n_source_hash: f8d0b6a84592
i18n_provenance: machine
i18n_output_hash: 80bedc341829
i18n_hash_version: 2
---

# قص الصوت {#trim-audio}

اقتطع جزءًا من ملف صوتي. يمكنك الاحتفاظ بالجزء الواقع بين وقتي البداية والنهاية، أو قص مقدار ثابت من بداية الملف ونهايته.

في التطبيق، تقبل حقول الوقت ثواني عادية (`90`) أو `MM:SS` (`1:30`) أو `HH:MM:SS` (`1:02:03.5`). أما API فيقبل الثواني.

## نقطة نهاية API {#api-endpoint}

`POST /api/v1/tools/audio/trim-audio`

يقبل بيانات نموذج متعدد الأجزاء تحتوي على ملف صوتي وحقل JSON بصيغة `settings`.

## المعاملات {#parameters}

| المعامل | النوع | مطلوب | الافتراضي | الوصف |
|-----------|------|----------|---------|-------------|
| mode | string | لا | `range` | `range` يحتفظ بالجزء من `startS` إلى `endS`. `ends` يزيل `cutStartS` من البداية و `cutEndS` من النهاية |
| startS | number | لا | `0` | وضع النطاق: وقت البداية بالثواني (الحد الأدنى 0) |
| endS | number | وضع النطاق | - | وضع النطاق: وقت النهاية بالثواني (يجب أن يكون بعد البداية) |
| cutStartS | number | لا | `0` | وضع الأطراف: عدد الثواني المراد إزالتها من البداية |
| cutEndS | number | لا | `0` | وضع الأطراف: عدد الثواني المراد إزالتها من النهاية |

## مثال على الطلب {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/trim-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"startS": 10, "endS": 45}'
```

قص أول ثانيتين وآخر 3 ثوانٍ، مهما كان طول الملف:

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/trim-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"mode": "ends", "cutStartS": 2, "cutEndS": 3}'
```

## مثال على الاستجابة {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 1575000
}
```

## ملاحظات {#notes}

- تُحدَّد الأوقات بالثواني ويمكن أن تتضمّن كسورًا عشرية (مثل `10.5`).
- في وضع النطاق، يجب أن تكون قيمة `endS` أكبر من `startS`. إذا تجاوز `endS` مدة الصوت، يُقص الملف حتى النهاية.
- في وضع الأطراف، يجب أن تكون إحدى القيمتين `cutStartS` و `cutEndS` على الأقل أكبر من صفر، وأن يتبقى منهما معًا 0.1 ثانية على الأقل من الصوت. وبما أن القص يُحسب من طول كل ملف، يصلح إعداد واحد لدفعة من الملفات ذات المدد المختلفة.
- يحتفظ الخرج عادةً بحاوية الدخل نفسها. يُكتب دخل AAC بصيغة M4A، وتعود المدخلات القابلة للفك فقط وغير المدعومة إلى MP3.
