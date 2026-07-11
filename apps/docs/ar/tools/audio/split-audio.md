---
description: "تقسيم الصوت حسب الفواصل الزمنية أو الأجزاء المتساوية أو كشف الصمت."
i18n_source_hash: c062a395dbac
i18n_provenance: human
i18n_output_hash: 629ea35d6920
---

# تقسيم الصوت {#split-audio}

قسِّم ملفًا صوتيًا إلى مقاطع حسب فواصل زمنية ثابتة أو أجزاء متساوية أو كشف الصمت التلقائي. يُرجع أرشيف ZIP يحتوي على المقاطع.

## نقطة نهاية API {#api-endpoint}

`POST /api/v1/tools/audio/split-audio`

يقبل بيانات نموذج متعدد الأجزاء تحتوي على ملف صوتي وحقل JSON بصيغة `settings`.

## المعاملات {#parameters}

| المعامل | النوع | مطلوب | الافتراضي | الوصف |
|-----------|------|----------|---------|-------------|
| mode | string | لا | `"time"` | استراتيجية التقسيم: `time`، `parts`، `silence` |
| segmentS | number | لا | `60` | طول المقطع بالثواني، من 1 إلى 3600 (يُستخدم عندما يكون mode هو `time`) |
| parts | integer | لا | `2` | عدد الأجزاء المتساوية، من 2 إلى 20 (يُستخدم عندما يكون mode هو `parts`) |
| thresholdDb | number | لا | `-40` | عتبة الصمت بوحدة dB، من -80 إلى -20 (يُستخدم عندما يكون mode هو `silence`) |
| minSilenceS | number | لا | `0.3` | الفجوة الدنيا للصمت بالثواني، من 0.1 إلى 10 (يُستخدم عندما يكون mode هو `silence`) |

## مثال على الطلب {#example-request}

التقسيم إلى مقاطع مدتها 30 ثانية:

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/split-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"mode": "time", "segmentS": 30}'
```

التقسيم حسب كشف الصمت:

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/split-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"mode": "silence", "thresholdDb": -35, "minSilenceS": 0.5}'
```

## مثال على الاستجابة {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio_parts.zip",
  "originalSize": 4500000,
  "processedSize": 4600000
}
```

## ملاحظات {#notes}

- يشير `downloadUrl` إلى أرشيف ZIP يحتوي على جميع المقاطع.
- تُستخدم فقط المعاملات ذات الصلة بالوضع `mode` المختار؛ ويُتجاهل الباقي.
- تُرقَّم أسماء ملفات المقاطع تسلسليًا (مثل `part-000.mp3`، `part-001.mp3`).
- يطابق تنسيق الخرج تنسيق الدخل.
