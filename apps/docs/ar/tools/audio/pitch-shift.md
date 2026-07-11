---
description: "رفع أو خفض طبقة الصوت بأنصاف نغمات دون تغيير السرعة."
i18n_source_hash: 2804d0eeecc8
i18n_provenance: human
i18n_output_hash: 2c365898720f
---

# إزاحة طبقة الصوت {#pitch-shift}

ارفع أو اخفض طبقة صوت ملف صوتي بعدد من أنصاف النغمات دون تغيير سرعة تشغيله.

## نقطة نهاية API {#api-endpoint}

`POST /api/v1/tools/audio/pitch-shift`

تقبل بيانات نموذج متعدد الأجزاء مع ملف صوتي وحقل JSON `settings`.

## المعاملات {#parameters}

| المعامل | النوع | مطلوب | الافتراضي | الوصف |
|-----------|------|----------|---------|-------------|
| semitones | integer | لا | `3` | أنصاف النغمات للإزاحة (-12 إلى 12). يجب أن تكون غير صفرية. |

## مثال طلب {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/pitch-shift \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"semitones": -5}'
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

- القيم الموجبة ترفع الطبقة؛ والقيم السالبة تخفضها.
- إزاحة 12 نصف نغمة تساوي أوكتاف واحد إلى الأعلى؛ و-12 تساوي أوكتاف واحد إلى الأسفل.
- تبقى مدة التشغيل كما هي بغض النظر عن مقدار الإزاحة.
- يبقي المخرج عادةً حاوية الإدخال. يُكتَب إدخال AAC بصيغة M4A، وتتراجع مدخلات فك التشفير فقط غير المدعومة إلى MP3.
