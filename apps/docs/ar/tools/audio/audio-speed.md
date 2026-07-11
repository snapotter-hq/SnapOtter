---
description: "تسريع أو إبطاء تشغيل الصوت بمُضاعِف."
i18n_source_hash: e39ba662e594
i18n_provenance: human
i18n_output_hash: 478709c261d8
---

# سرعة الصوت {#audio-speed}

سرّع أو أبطئ تشغيل الصوت بتطبيق مُضاعِف سرعة.

## نقطة نهاية API {#api-endpoint}

`POST /api/v1/tools/audio/audio-speed`

تقبل بيانات نموذج متعدد الأجزاء مع ملف صوتي وحقل JSON `settings`.

## المعاملات {#parameters}

| المعامل | النوع | مطلوب | الافتراضي | الوصف |
|-----------|------|----------|---------|-------------|
| factor | number | لا | `1.5` | مُضاعِف السرعة (0.25 إلى 4). القيم أقل من 1 تُبطئ؛ وأعلى من 1 تُسرّع. |

## مثال طلب {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/audio-speed \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"factor": 2}'
```

## مثال استجابة {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 2250000
}
```

## ملاحظات {#notes}

- المُضاعِف `0.25` يُشغّل بربع السرعة (أطول بـ 4 أضعاف). المُضاعِف `4` يُشغّل بأربعة أضعاف السرعة (أقصر بـ 4 أضعاف).
- تُحفَظ طبقة الصوت أثناء تغيّر السرعة (تمدّد زمني). استخدم إزاحة طبقة الصوت لضبط الطبقة بشكل مستقل.
- يبقي المخرج عادةً حاوية الإدخال. يُكتَب إدخال AAC بصيغة M4A، وتتراجع مدخلات فك التشفير فقط غير المدعومة إلى MP3.
