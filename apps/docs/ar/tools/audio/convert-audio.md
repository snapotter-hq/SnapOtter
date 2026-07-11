---
description: "تحويل الصوت بين تنسيقات MP3 وWAV وOGG وFLAC وM4A."
i18n_source_hash: fd02c059e6a9
i18n_provenance: human
i18n_output_hash: 37d17dd79052
---

# تحويل الصوت {#convert-audio}

حوّل ملفات الصوت بين التنسيقات الشائعة بما فيها MP3 وWAV وOGG وFLAC وM4A، مع معدل بت إخراج قابل للتكوين.

## نقطة نهاية API {#api-endpoint}

`POST /api/v1/tools/audio/convert-audio`

تقبل بيانات نموذج متعدد الأجزاء مع ملف صوتي وحقل JSON `settings`.

## المعاملات {#parameters}

| المعامل | النوع | مطلوب | الافتراضي | الوصف |
|-----------|------|----------|---------|-------------|
| format | string | لا | `"mp3"` | تنسيق الإخراج: `mp3`، `wav`، `ogg`، `flac`، `m4a` |
| bitrateKbps | integer | لا | `192` | معدل البت للإخراج بالكيلوبت في الثانية (32 إلى 320) |

## مثال طلب {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/convert-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"format": "flac", "bitrateKbps": 256}'
```

## مثال استجابة {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.flac",
  "originalSize": 4500000,
  "processedSize": 8200000
}
```

## ملاحظات {#notes}

- تشمل تنسيقات الإدخال المدعومة MP3 وWAV وOGG وFLAC وAAC وM4A وWMA وAIFF وOPUS.
- ينطبق معدل البت فقط على التنسيقات ذات الفقد (MP3 وOGG وM4A). التنسيقات عديمة الفقد مثل WAV وFLAC تتجاهل هذا الإعداد.
- يبقي اسم ملف الإخراج الاسم الأصلي مع الامتداد الجديد.
