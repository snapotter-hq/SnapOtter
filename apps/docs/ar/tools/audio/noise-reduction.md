---
description: "تقليل ضوضاء الخلفية من الصوت بإزالة الضوضاء القائمة على FFT."
i18n_source_hash: 57cbdbd449aa
i18n_provenance: human
i18n_output_hash: 7aedeed9f497
---

# تقليل الضوضاء {#noise-reduction}

قلّل ضوضاء الخلفية في ملف صوتي باستخدام إزالة الضوضاء القائمة على FFT بقوة قابلة للاختيار.

## نقطة نهاية API {#api-endpoint}

`POST /api/v1/tools/audio/noise-reduction`

تقبل بيانات نموذج متعدد الأجزاء مع ملف صوتي وحقل JSON `settings`.

## المعاملات {#parameters}

| المعامل | النوع | مطلوب | الافتراضي | الوصف |
|-----------|------|----------|---------|-------------|
| strength | string | لا | `"medium"` | قوة إزالة الضوضاء: `light`، `medium`، `strong` |

## مثال طلب {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/noise-reduction \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"strength": "strong"}'
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

- `light` يحفظ تفاصيل أكثر لكنه يزيل ضوضاء أقل. `strong` يزيل ضوضاء أكثر لكنه قد يُدخل عناصر تشويه دقيقة.
- أفضل النتائج على التسجيلات ذات ضوضاء الخلفية المتسقة (طنين المروحة، تكييف الهواء، التشويش الثابت).
- يبقي المخرج عادةً حاوية الإدخال. يُكتَب إدخال AAC بصيغة M4A، وتتراجع مدخلات فك التشفير فقط غير المدعومة إلى MP3.
