---
description: "دمج عدة ملفات صوتية في مسار متتابع واحد."
i18n_source_hash: defa993d3f87
i18n_provenance: human
i18n_output_hash: b063efc606da
---

# دمج الصوت {#merge-audio}

ادمج ملفين صوتيين أو أكثر في مسار متتابع واحد، مُلحَقة بالترتيب الذي رُفعت به.

## نقطة نهاية API {#api-endpoint}

`POST /api/v1/tools/audio/merge-audio`

تقبل بيانات نموذج متعدد الأجزاء مع عدة ملفات صوتية وحقل JSON `settings`.

## المعاملات {#parameters}

| المعامل | النوع | مطلوب | الافتراضي | الوصف |
|-----------|------|----------|---------|-------------|
| format | string | لا | `"mp3"` | تنسيق الإخراج: `mp3`، `wav`، `flac`، `m4a` |

## مثال طلب {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/merge-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@intro.mp3" \
  -F "file=@main.mp3" \
  -F "file=@outro.mp3" \
  -F 'settings={"format": "mp3"}'
```

## مثال استجابة {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/merged.mp3",
  "originalSize": 9500000,
  "processedSize": 9200000
}
```

## ملاحظات {#notes}

- يقبل من 2 إلى 10 ملفات صوتية لكل طلب.
- تُلحَق الملفات بترتيب الرفع.
- يُعاد ترميز جميع ملفات الإدخال إلى تنسيق الإخراج ومعدل العينة المختارين للانضمام السلس.
- تنسيقات الإدخال المختلطة مدعومة (مثلاً ملف WAV وملف MP3).
