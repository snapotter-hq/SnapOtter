---
description: "توليد رموز QR بألوان مخصصة ومستويات تصحيح أخطاء."
i18n_source_hash: 096ef4d90da5
i18n_provenance: human
i18n_output_hash: cd103feefcaa
---

# مولّد رموز QR {#qr-code-generator}

ولّد صور رموز QR من نص أو روابط URL مع حجم قابل للتهيئة، ومستوى تصحيح أخطاء، وألوان مخصصة للمقدمة/الخلفية.

## نقطة نهاية الـ API {#api-endpoint}

`POST /api/v1/tools/image/qr-generate`

يقبل **جسم JSON** (وليس متعدد الأجزاء). لا حاجة لرفع ملف.

## المعاملات {#parameters}

| المعامل | النوع | مطلوب | القيمة الافتراضية | الوصف |
|-----------|------|----------|---------|-------------|
| text | string | نعم | - | المحتوى المراد ترميزه في رمز QR (1 إلى 2000 حرف) |
| size | number | لا | `400` | عرض/ارتفاع صورة الإخراج بالبكسل (100 إلى 10000) |
| errorCorrection | string | لا | `"M"` | مستوى تصحيح الأخطاء: `L` (7%)، `M` (15%)، `Q` (25%)، `H` (30%) |
| foreground | string | لا | `"#000000"` | لون مقدمة/وحدات رمز QR بصيغة hex (`#RRGGBB`) |
| background | string | لا | `"#FFFFFF"` | لون خلفية رمز QR بصيغة hex (`#RRGGBB`) |
| logoDataUri | string | لا | - | صورة الشعار كـ data URI (`data:image/png;base64,...` أو `data:image/jpeg;base64,...`، أقصى 700 كيلوبايت). تُوسَّط على رمز QR بنسبة 22% من حجم الرمز. تفرض تصحيح الأخطاء على `H` |

### مستويات تصحيح الأخطاء {#error-correction-levels}

| المستوى | الاسترداد | حالة الاستخدام |
|-------|----------|----------|
| `L` | ~7% | أقصى كثافة بيانات |
| `M` | ~15% | متوازن (افتراضي) |
| `Q` | ~25% | جيد للرموز المطبوعة |
| `H` | ~30% | الأفضل للرموز التي تحتوي على شعارات متراكبة |

## مثال على الطلب {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/qr-generate \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "https://snapotter.com", "size": 500, "errorCorrection": "H"}'
```

رمز QR بعلامة تجارية مع ألوان مخصصة:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/qr-generate \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello World", "size": 300, "foreground": "#1a365d", "background": "#f7fafc"}'
```

## مثال على الاستجابة {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/qrcode.png",
  "originalSize": 0,
  "processedSize": 4520
}
```

## ملاحظات {#notes}

- تقبل هذه النقطة النهائية JSON وليس بيانات نموذج متعدد الأجزاء، إذ لا حاجة لرفع صورة.
- الإخراج دائمًا صورة PNG.
- اسم ملف الإخراج دائمًا `qrcode.png`.
- `originalSize` دائمًا 0 لأن هذا الأداة يولّد الصور من الصفر.
- تُضمَّن منطقة هادئة (هامش) بعرض وحدتين حول رمز QR.
- أقصى طول للنص هو 2000 حرف. تعتمد السعة الفعلية على مستوى تصحيح الأخطاء وترميز الأحرف.
- تتيح مستويات تصحيح الأخطاء الأعلى بقاء رمز QR قابلًا للمسح حتى لو حُجب جزئيًا، لكنها تقلل من سعة البيانات.
- عند توفير `logoDataUri`، يُفرض تصحيح الأخطاء تلقائيًا على `H` (30%) بحيث يبقى رمز QR قابلًا للمسح رغم حجب الشعار للمركز.
