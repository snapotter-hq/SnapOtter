---
description: "قص جزء من ملف صوتي عبر تحديد وقتي البداية والنهاية."
i18n_source_hash: 8b80c5c8a711
i18n_provenance: human
i18n_output_hash: 871800d5f410
---

# قص الصوت {#trim-audio}

اقتطع جزءًا من ملف صوتي عبر تحديد وقتي البداية والنهاية بالثواني.

## نقطة نهاية API {#api-endpoint}

`POST /api/v1/tools/audio/trim-audio`

يقبل بيانات نموذج متعدد الأجزاء تحتوي على ملف صوتي وحقل JSON بصيغة `settings`.

## المعاملات {#parameters}

| المعامل | النوع | مطلوب | الافتراضي | الوصف |
|-----------|------|----------|---------|-------------|
| startS | number | لا | `0` | وقت البداية بالثواني (الحد الأدنى 0) |
| endS | number | نعم | - | وقت النهاية بالثواني (يجب أن يكون بعد البداية) |

## مثال على الطلب {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/trim-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"startS": 10, "endS": 45}'
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
- يجب أن تكون قيمة `endS` أكبر من `startS`.
- إذا تجاوز `endS` مدة الصوت، يُقص الملف حتى النهاية.
- يحتفظ الخرج عادةً بحاوية الدخل نفسها. يُكتب دخل AAC بصيغة M4A، وتعود المدخلات القابلة للفك فقط وغير المدعومة إلى MP3.
