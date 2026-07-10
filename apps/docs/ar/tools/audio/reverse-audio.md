---
description: "عكس ملف صوتي ليُشغَّل بشكل عكسي."
i18n_source_hash: 5c2017661803
i18n_provenance: human
i18n_output_hash: 0cd95cda51d5
---

# عكس الصوت {#reverse-audio}

اعكس ملفاً صوتياً ليُشغَّل بشكل عكسي.

## نقطة نهاية API {#api-endpoint}

`POST /api/v1/tools/audio/reverse-audio`

تقبل بيانات نموذج متعدد الأجزاء مع ملف صوتي وحقل JSON `settings`.

## المعاملات {#parameters}

ليس لهذه الأداة معاملات قابلة للتكوين. يُعكَس ملف الصوت بالكامل.

## مثال طلب {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/reverse-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3"
```

## مثال استجابة {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 4500000
}
```

## ملاحظات {#notes}

- يُعكَس مسار الصوت الكامل من النهاية إلى البداية.
- يبقي المخرج عادةً حاوية الإدخال. يُكتَب إدخال AAC بصيغة M4A، وتتراجع مدخلات فك التشفير فقط غير المدعومة إلى MP3.
