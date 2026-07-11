---
description: "تحويل الكلام إلى نص عبر نسخ مدعوم بالذكاء الاصطناعي."
i18n_source_hash: ae98c4c0aed2
i18n_provenance: human
i18n_output_hash: 7102449deaab
---

# نسخ الصوت {#transcribe-audio}

حوِّل الكلام إلى نص باستخدام نسخ مدعوم بالذكاء الاصطناعي (faster-whisper). يدعم تنسيقات الخرج النصية العادية وSRT وVTT مع اختيار لغة تلقائي أو يدوي.

## نقطة نهاية API {#api-endpoint}

`POST /api/v1/tools/audio/transcribe-audio`

يقبل بيانات نموذج متعدد الأجزاء تحتوي على ملف صوتي وحقل JSON بصيغة `settings`.

## المعاملات {#parameters}

| المعامل | النوع | مطلوب | الافتراضي | الوصف |
|-----------|------|----------|---------|-------------|
| language | string | لا | `"auto"` | اللغة: `auto`، `en`، `de`، `fr`، `es`، `zh`، `ja`، `ko`، `id`، `th`، `vi` |
| outputFormat | string | لا | `"txt"` | تنسيق الخرج: `txt`، `srt`، `vtt` |

## مثال على الطلب {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/transcribe-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"language": "en", "outputFormat": "srt"}'
```

## مثال على الاستجابة {#example-response}

هذه أداة غير متزامنة. تُرجع API الاستجابة `202 Accepted` فورًا:

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

تابع التقدم عبر SSE على `GET /api/v1/jobs/{jobId}/progress`. عند اكتمال المهمة، يسلّم بث SSE النتيجة النهائية مع `downloadUrl`.

## ملاحظات {#notes}

- يتطلب تثبيت حزمة ميزة **transcription**. يُرجع `501` برمز `FEATURE_NOT_INSTALLED`، وحقل `feature` المفقود، و`featureName`، و`estimatedSize` إذا لم تكن الحزمة متاحة.
- يستخدم faster-whisper للنسخ. تكتشف اللغة `auto` اللغة المنطوقة تلقائيًا.
- يتضمّن تنسيقا `srt` و`vtt` طوابع زمنية لكل مقطع، مناسبة للترجمات.
- يُرجع تنسيق `txt` نصًا عاديًا بدون طوابع زمنية.
- هذه أداة ذكاء اصطناعي طويلة التشغيل؛ يعتمد وقت المعالجة على طول الصوت وعتاد الخادم.
