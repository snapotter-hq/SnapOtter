---
description: "إنشاء عنصر نائب صغير منخفض الجودة للصورة مع data URI بترميز base64."
i18n_source_hash: f8a27c8021f5
i18n_provenance: human
i18n_output_hash: 12c0e11492ab
---

# العنصر النائب LQIP {#lqip-placeholder}

أنشئ عنصراً نائباً صغيراً منخفض الجودة للصورة (LQIP) من صورة مصدر. يُرجع ملف عنصر نائب صغير إلى جانب data URI بترميز base64، ووسم HTML `<img>` جاهز للاستخدام، ومقتطف CSS `background-image` للتضمين الفوري.

## نقطة نهاية API {#api-endpoint}

`POST /api/v1/tools/image/lqip-placeholder`

يقبل بيانات نموذج multipart تحتوي على ملف صورة وحقل JSON `settings`.

## المعاملات {#parameters}

| المعامل | النوع | مطلوب | الافتراضي | الوصف |
|-----------|------|----------|---------|-------------|
| width | integer | لا | `16` | العرض المستهدف بالبكسل (4-64) |
| blur | number | لا | `2` | نصف قطر التمويه لاستراتيجية التمويه (0-20) |
| strategy | string | لا | `"blur"` | استراتيجية العنصر النائب: `blur`، `pixelate`، أو `solid` |
| format | string | لا | `"webp"` | صيغة المخرجات: `webp`، `png`، أو `jpeg` |
| quality | integer | لا | `50` | جودة المخرجات (1-100) |

## مثال على طلب {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/lqip-placeholder \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"width": 20, "strategy": "blur", "format": "webp"}'
```

## مثال على استجابة {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.webp",
  "originalSize": 2450000,
  "processedSize": 280,
  "dataUri": "data:image/webp;base64,UklGR...",
  "width": 20,
  "height": 13,
  "bytes": 280,
  "strategy": "blur",
  "html": "<img src=\"data:image/webp;base64,UklGR...\" />",
  "css": "background-image:url('data:image/webp;base64,UklGR...');background-size:cover;background-position:center;"
}
```

## ملاحظات {#notes}

- يحتوي حقل `dataUri` على data URI الكامل، جاهز للاستخدام في سمات `src` أو CSS دون أي طلبات إضافية.
- يوفّر حقلا `html` و`css` مقتطفات نسخ ولصق لحالات الاستخدام الشائعة.
- تُنتج استراتيجية `blur` صورة مصغرة ناعمة مموّهة. وتنشئ استراتيجية `pixelate` فسيفساء مربّعة. وتُرجع استراتيجية `solid` لوناً واحداً بمتوسط.
- تتراوح أحجام العنصر النائب النموذجية بين 200-500 بايت، ما يجعلها مناسبة للتضمين المباشر في HTML.
- يُحسَب الارتفاع تلقائياً للحفاظ على نسبة العرض إلى الارتفاع لصورة المصدر.
- تُفك ترميز إدخالات HEIC وRAW وPSD وSVG تلقائياً قبل المعالجة.
