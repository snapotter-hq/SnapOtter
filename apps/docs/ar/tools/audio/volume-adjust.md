---
description: "رفع أو خفض مستوى الصوت بمقدار كسب ثابت بالديسيبل."
i18n_source_hash: b9bc1de2c9ef
i18n_provenance: human
i18n_output_hash: d9fa73e130aa
---

# ضبط مستوى الصوت {#volume-adjust}

ارفع أو اخفض مستوى صوت ملف صوتي بتطبيق كسب ثابت بالديسيبل.

## نقطة نهاية API {#api-endpoint}

`POST /api/v1/tools/audio/volume-adjust`

يقبل بيانات نموذج متعدد الأجزاء تحتوي على ملف صوتي وحقل JSON بصيغة `settings`.

## المعاملات {#parameters}

| المعامل | النوع | مطلوب | الافتراضي | الوصف |
|-----------|------|----------|---------|-------------|
| gainDb | number | لا | `3` | ضبط مستوى الصوت بالديسيبل (من -30 إلى 30) |

## مثال على الطلب {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/volume-adjust \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"gainDb": 6}'
```

## مثال على الاستجابة {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 4500000
}
```

## ملاحظات {#notes}

- ترفع القيم الموجبة مستوى الصوت؛ وتخفضه القيم السالبة.
- قد تسبّب قيم الكسب الموجبة الكبيرة قصًّا في الإشارة. استخدم normalize-audio للحصول على تسوية آمنة للجهارة.
- يحتفظ الخرج عادةً بحاوية الدخل نفسها. يُكتب دخل AAC بصيغة M4A، وتعود المدخلات القابلة للفك فقط وغير المدعومة إلى MP3.
