---
description: "التحويل بين الأحادي والاستريو أو تبديل القناتين اليسرى واليمنى."
i18n_source_hash: 4f5cd6b38c83
i18n_provenance: human
i18n_output_hash: 2285476fc95d
---

# قنوات الصوت {#audio-channels}

حوّل الصوت بين التخطيطين الأحادي والاستريو، أو بدّل القناتين اليسرى واليمنى لملف استريو.

## نقطة نهاية API {#api-endpoint}

`POST /api/v1/tools/audio/audio-channels`

تقبل بيانات نموذج متعدد الأجزاء مع ملف صوتي وحقل JSON `settings`.

## المعاملات {#parameters}

| المعامل | النوع | مطلوب | الافتراضي | الوصف |
|-----------|------|----------|---------|-------------|
| mode | string | نعم | - | عملية القناة: `stereo-to-mono`، `mono-to-stereo`، `swap` |

## مثال طلب {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/audio-channels \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"mode": "stereo-to-mono"}'
```

## مثال استجابة {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 2300000
}
```

## ملاحظات {#notes}

- `stereo-to-mono` يمزج القناتين في مسار أحادي واحد.
- `mono-to-stereo` يكرّر القناة الأحادية إلى اليسرى واليمنى معاً.
- `swap` يبادل القناتين اليسرى واليمنى لملف استريو.
- يبقي المخرج عادةً حاوية الإدخال. يُكتَب إدخال AAC بصيغة M4A، وتتراجع مدخلات فك التشفير فقط غير المدعومة إلى MP3.
