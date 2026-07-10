---
description: "إنشاء مخطط رسم بياني RGB مع إحصائيات لكل قناة من صورة."
i18n_source_hash: 57aa610206a5
i18n_provenance: human
i18n_output_hash: 350b5993c177
---

# الرسم البياني {#histogram}

أنشئ مخطط رسم بياني RGB من صورة. يُرجع صورة رسم بياني PNG إلى جانب إحصائيات لكل قناة وبيانات رسم بياني خام مكوّنة من 256 خانة في JSON الاستجابة.

## نقطة نهاية API {#api-endpoint}

`POST /api/v1/tools/image/histogram`

يقبل بيانات نموذج multipart تحتوي على ملف صورة وحقل JSON `settings`.

## المعاملات {#parameters}

| المعامل | النوع | مطلوب | الافتراضي | الوصف |
|-----------|------|----------|---------|-------------|
| scale | string | لا | `"linear"` | مقياس المحور الصادي: `linear` أو `log` |

## مثال على طلب {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/histogram \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"scale": "linear"}'
```

## مثال على استجابة {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/histogram.png",
  "originalSize": 2450000,
  "processedSize": 12000,
  "bins": {
    "r": [0, 12, 45, "... (256 values)"],
    "g": [0, 8, 38, "... (256 values)"],
    "b": [2, 15, 52, "... (256 values)"],
    "lum": [0, 10, 40, "... (256 values)"]
  },
  "stats": {
    "r": { "mean": 128, "median": 132, "stdev": 48.5 },
    "g": { "mean": 119, "median": 121, "stdev": 44.2 },
    "b": { "mean": 105, "median": 108, "stdev": 51.3 },
    "lum": { "mean": 118, "median": 120, "stdev": 45.1 }
  },
  "mean": { "r": 128, "g": 119, "b": 105 },
  "max": { "r": 4200, "g": 3800, "b": 4100 }
}
```

## ملاحظات {#notes}

- يشير `downloadUrl` إلى مخطط رسم بياني PNG مُصيّر يوضّح توزيعات R وG وB والإضاءة.
- يحتوي `bins` على مصفوفات خام من 256 قيمة لكل قناة (الأحمر، الأخضر، الأزرق، الإضاءة)، مناسبة لتصيير تصورات مخصصة.
- يوفّر `stats` المتوسط والوسيط والانحراف المعياري لكل قناة.
- `mean` و`max` حقول اختصار متوافقة مع الإصدارات السابقة.
- استخدم مقياس `log` عندما يهيمن على الرسم البياني عدد قليل من القمم وتريد رؤية التفاصيل في الخانات الأدنى.
- تُفك ترميز إدخالات HEIC وRAW وPSD وSVG تلقائياً قبل التحليل.
