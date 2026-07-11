---
description: "توليد تصوير للموجة الصوتية كصورة PNG من ملف صوتي."
i18n_source_hash: 5480106dfe48
i18n_provenance: human
i18n_output_hash: 90007da46f9d
---

# صورة الموجة الصوتية {#waveform-image}

ولِّد تصويرًا للموجة الصوتية كصورة PNG من ملف صوتي، مع أبعاد ولون قابلين للتهيئة.

## نقطة نهاية API {#api-endpoint}

`POST /api/v1/tools/audio/waveform-image`

يقبل بيانات نموذج متعدد الأجزاء تحتوي على ملف صوتي وحقل JSON بصيغة `settings`.

## المعاملات {#parameters}

| المعامل | النوع | مطلوب | الافتراضي | الوصف |
|-----------|------|----------|---------|-------------|
| width | integer | لا | `1024` | عرض الصورة بالبكسل (من 256 إلى 3840) |
| height | integer | لا | `256` | ارتفاع الصورة بالبكسل (من 64 إلى 1080) |
| color | string | لا | `"#4f46e5"` | لون الموجة الصوتية بصيغة hex (مثل `"#4f46e5"`) |

## مثال على الطلب {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/waveform-image \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"width": 1920, "height": 400, "color": "#e07832"}'
```

## مثال على الاستجابة {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.png",
  "originalSize": 4500000,
  "processedSize": 45000
}
```

## ملاحظات {#notes}

- الخرج دائمًا صورة PNG، بغضّ النظر عن تنسيق الصوت المُدخل.
- تُرسَم الموجة الصوتية على خلفية شفافة.
- مفيدة للصور المصغّرة ومعاينات وسائل التواصل الاجتماعي أو التضمين في صفحات الويب.
