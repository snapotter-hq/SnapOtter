---
description: "إعادة تسمية عدّة ملفات باستخدام قالب نمط وتنزيلها كملف ZIP."
i18n_source_hash: 2776dcc2f71c
i18n_provenance: human
i18n_output_hash: ce423a6d3e41
---

# إعادة التسمية الجماعية {#bulk-rename}

أعِد تسمية عدّة ملفات باستخدام قالب نمط يحوي عناصر نائبة للفهرس والفهرس المبطّن واسم الملف الأصلي. تُرجع أرشيف ZIP يحتوي على جميع الملفات المُعاد تسميتها.

## نقطة نهاية API {#api-endpoint}

`POST /api/v1/tools/image/bulk-rename`

يقبل بيانات نموذج متعدّد الأجزاء (multipart) مع عدّة ملفات وحقل `settings` بصيغة JSON.

## المعاملات {#parameters}

| المعامل | النوع | مطلوب | الافتراضي | الوصف |
|-----------|------|----------|---------|-------------|
| pattern | string | لا | `"image-{{index}}"` | نمط التسمية مع العناصر النائبة (بحدّ أقصى 1000 حرف) |
| startIndex | number | لا | `1` | رقم الفهرس الابتدائي |

### العناصر النائبة في النمط {#pattern-placeholders}

| العنصر النائب | الوصف | مثال |
|-------------|-------------|---------|
| `{{index}}` | رقم تسلسلي يبدأ من `startIndex` | `1`، `2`، `3` |
| `{{padded}}` | رقم تسلسلي مبطّن بالأصفار | `01`، `02`، `03` |
| `{{original}}` | اسم الملف الأصلي بدون امتداد | `photo`، `IMG_001` |

يُحفَظ امتداد الملف الأصلي دائمًا.

## مثال على الطلب {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/bulk-rename \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo1.jpg" \
  -F "file=@photo2.jpg" \
  -F "file=@photo3.jpg" \
  -F 'settings={"pattern": "vacation-{{padded}}", "startIndex": 1}'
```

ينتج عن هذا: `vacation-1.jpg`، `vacation-2.jpg`، `vacation-3.jpg`

باستخدام اسم الملف الأصلي:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/bulk-rename \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@IMG_001.jpg" \
  -F "file=@IMG_002.jpg" \
  -F 'settings={"pattern": "2024-trip-{{original}}-{{index}}"}'
```

ينتج عن هذا: `2024-trip-IMG_001-1.jpg`، `2024-trip-IMG_002-2.jpg`

## مثال على الاستجابة {#example-response}

الاستجابة ملف ZIP مُدفَّق مباشرةً (وليست استجابة JSON). ترويسات الاستجابة هي:

```
Content-Type: application/zip
Content-Disposition: attachment; filename="renamed-a1b2c3d4.zip"
```

## ملاحظات {#notes}

- لا تعالج هذه الأداة الصور. فهي تُعيد تسمية الملفات فقط وتحزمها في أرشيف ZIP.
- يُحدَّد عرض التبطين بالأصفار لـ `{{padded}}` تلقائيًا بناءً على العدد الإجمالي للملفات (مثلًا 100 ملف تستخدم تبطينًا من 3 خانات: `001`، `002`، إلخ).
- تُحفَظ امتدادات الملفات من أسماء الملفات الأصلية.
- تُنقَّى أسماء الملفات لإزالة الأحرف غير الآمنة.
- يجب توفير ملف واحد على الأقل.
