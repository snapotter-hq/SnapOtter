---
description: "توحيد مستوى الجهارة إلى مستويات معيار البث (EBU R128)."
i18n_source_hash: 794d8cfa5ad8
i18n_provenance: human
i18n_output_hash: 52afd57837a2
---

# توحيد الصوت {#normalize-audio}

وحّد جهارة الصوت إلى مستويات معيار البث باستخدام تطبيع EBU R128 (-16 LUFS).

## نقطة نهاية API {#api-endpoint}

`POST /api/v1/tools/audio/normalize-audio`

تقبل بيانات نموذج متعدد الأجزاء مع ملف صوتي وحقل JSON `settings`.

## المعاملات {#parameters}

ليس لهذه الأداة معاملات قابلة للتكوين. تطبّق تطبيع جهارة EBU R128 تلقائياً.

## مثال طلب {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/normalize-audio \
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

- يستخدم معيار جهارة EBU R128، مستهدفاً -16 LUFS.
- مثالي لملفات البودكاست والكتب الصوتية ومحتوى البث حيث تكون الجهارة المتسقة مهمة.
- يُحفَظ معدل عينة المصدر في المخرج.
- يبقي المخرج عادةً حاوية الإدخال. يُكتَب إدخال AAC بصيغة M4A، وتتراجع مدخلات فك التشفير فقط غير المدعومة إلى MP3.
