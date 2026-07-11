---
description: "حشو صورة إلى نسبة عرض إلى ارتفاع مستهدفة بلون خالص أو خلفية شفافة أو مموّهة."
i18n_source_hash: 796122da3dae
i18n_provenance: human
i18n_output_hash: 7d682d59ad24
---

# حشو الصورة {#image-pad}

احشُ صورة إلى نسبة عرض إلى ارتفاع مستهدفة بإضافة لون خالص أو خلفية شفافة أو مموّهة حولها. مفيد لملاءمة الصور في نسب عرض إلى ارتفاع ثابتة لوسائل التواصل الاجتماعي أو الطباعة دون اقتصاص.

## نقطة نهاية API {#api-endpoint}

`POST /api/v1/tools/image/image-pad`

يقبل بيانات نموذج multipart تحتوي على ملف صورة وحقل JSON `settings`.

## المعاملات {#parameters}

| المعامل | النوع | مطلوب | الافتراضي | الوصف |
|-----------|------|----------|---------|-------------|
| target | string | لا | `"1:1"` | نسبة العرض إلى الارتفاع المستهدفة: `16:9`، `9:16`، `1:1`، `4:3`، `3:4`، أو `custom` |
| ratioW | integer | لا | `1` | عرض النسبة المخصصة (1-100، يُستخدم عندما يكون target هو `custom`) |
| ratioH | integer | لا | `1` | ارتفاع النسبة المخصصة (1-100، يُستخدم عندما يكون target هو `custom`) |
| background | string | لا | `"color"` | وضع الخلفية: `color`، `transparent`، أو `blur` |
| color | string | لا | `"#ffffff"` | لون خلفية hex (عندما تكون الخلفية `color`) |
| padding | integer | لا | `0` | حشو إضافي كنسبة مئوية من اللوحة (0-50) |

## مثال على طلب {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-pad \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"target": "16:9", "background": "blur", "padding": 5}'
```

## مثال على استجابة {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 3100000
}
```

## ملاحظات {#notes}

- ينشئ وضع الخلفية `blur` نسخة مموّهة من الصورة الأصلية كحشو للتعبئة، ما يُنتج نتيجة متماسكة بصرياً.
- عند استخدام خلفية `transparent`، تُحوَّل المخرجات إلى PNG للحفاظ على قناة alpha.
- تتطابق صيغة المخرجات مع صيغة الإدخال ما لم تكن هناك شفافية. تُفك ترميز إدخالات HEIC وRAW وPSD وSVG تلقائياً قبل المعالجة.
- عيّن `target` إلى `custom` ووفّر `ratioW` و`ratioH` للحصول على نسب عرض إلى ارتفاع اعتباطية (مثل `ratioW: 3, ratioH: 2` لـ 3:2).
