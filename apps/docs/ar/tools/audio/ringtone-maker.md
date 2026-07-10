---
description: "إنشاء مقطع نغمة رنين من أي ملف صوتي."
i18n_source_hash: 8fcdcc545fbc
i18n_provenance: human
i18n_output_hash: 82f2757492e1
---

# صانع نغمات الرنين {#ringtone-maker}

أنشئ مقطع نغمة رنين (.m4r) من أي ملف صوتي باختيار وقت البدء والمدة.

## نقطة نهاية API {#api-endpoint}

`POST /api/v1/tools/audio/ringtone-maker`

تقبل بيانات نموذج متعدد الأجزاء مع ملف صوتي وحقل JSON `settings`.

## المعاملات {#parameters}

| المعامل | النوع | مطلوب | الافتراضي | الوصف |
|-----------|------|----------|---------|-------------|
| startS | number | لا | `0` | وقت البدء بالثواني (الحد الأدنى 0) |
| durationS | number | لا | `30` | مدة المقطع بالثواني (1 إلى 30) |

## مثال طلب {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/ringtone-maker \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"startS": 15, "durationS": 20}'
```

## مثال استجابة {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.m4r",
  "originalSize": 4500000,
  "processedSize": 620000
}
```

## ملاحظات {#notes}

- المخرج دائماً بتنسيق M4R، متوافق مع نغمات رنين iPhone.
- الحد الأقصى لمدة نغمة الرنين هو 30 ثانية (حد Apple).
- يمكن استخدام أي تنسيق صوتي كإدخال.
