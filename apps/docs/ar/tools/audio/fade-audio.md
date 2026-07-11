---
description: "إضافة تأثيرات التلاشي التصاعدي والتلاشي التنازلي إلى الصوت."
i18n_source_hash: 86856451ecb8
i18n_provenance: human
i18n_output_hash: 4b753422f89b
---

# تلاشي الصوت {#fade-audio}

أضف تأثيري التلاشي التصاعدي والتلاشي التنازلي إلى بداية ملف صوتي ونهايته.

## نقطة نهاية API {#api-endpoint}

`POST /api/v1/tools/audio/fade-audio`

تقبل بيانات نموذج متعدد الأجزاء مع ملف صوتي وحقل JSON `settings`.

## المعاملات {#parameters}

| المعامل | النوع | مطلوب | الافتراضي | الوصف |
|-----------|------|----------|---------|-------------|
| fadeInS | number | لا | `1` | مدة التلاشي التصاعدي بالثواني (0 إلى 30) |
| fadeOutS | number | لا | `1` | مدة التلاشي التنازلي بالثواني (0 إلى 30) |

## مثال طلب {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/fade-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"fadeInS": 2, "fadeOutS": 3}'
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

- اضبط أي قيمة إلى `0` لتخطي ذلك الاتجاه من التلاشي. يجب أن تكون واحدة على الأقل أكبر من 0.
- تُقيَّد مدة التلاشي إلى طول الصوت إذا تجاوزته.
- يبقي المخرج عادةً حاوية الإدخال. يُكتَب إدخال AAC بصيغة M4A، وتتراجع مدخلات فك التشفير فقط غير المدعومة إلى MP3.
