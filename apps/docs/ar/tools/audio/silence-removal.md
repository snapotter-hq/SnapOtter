---
description: "إزالة الأجزاء الصامتة من ملف صوتي."
i18n_source_hash: a7624fc99b50
i18n_provenance: human
i18n_output_hash: e01305f99796
---

# إزالة الصمت {#silence-removal}

اكتشف الأجزاء الصامتة في ملف صوتي وأزِلها بناءً على عتبة قابلة للتهيئة ومدة دنيا.

## نقطة نهاية API {#api-endpoint}

`POST /api/v1/tools/audio/silence-removal`

يقبل بيانات نموذج متعدد الأجزاء تحتوي على ملف صوتي وحقل JSON بصيغة `settings`.

## المعاملات {#parameters}

| المعامل | النوع | مطلوب | الافتراضي | الوصف |
|-----------|------|----------|---------|-------------|
| thresholdDb | number | لا | `-50` | عتبة الصمت بوحدة dB (من -80 إلى -20). يُعتبر الصوت الأقل من هذا المستوى صامتًا. |
| minSilenceS | number | لا | `0.5` | المدة الدنيا للصمت بالثواني لإزالتها (من 0.1 إلى 5) |

## مثال على الطلب {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/silence-removal \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"thresholdDb": -45, "minSilenceS": 1}'
```

## مثال على الاستجابة {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 3200000
}
```

## ملاحظات {#notes}

- العتبة الأعلى (الأقل سلبية) أكثر عدوانية وتزيل المقاطع الأهدأ إلى جانب الصمت الحقيقي.
- زِد قيمة `minSilenceS` لإزالة الوقفات الأطول فقط مع الحفاظ على الفجوات الطبيعية القصيرة.
- مفيد لتنظيف تسجيلات البودكاست والمحاضرات والمذكرات الصوتية.
- يحتفظ الخرج عادةً بحاوية الدخل نفسها. يُكتب دخل AAC بصيغة M4A، وتعود المدخلات القابلة للفك فقط وغير المدعومة إلى MP3.
