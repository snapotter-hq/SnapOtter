---
description: "تطبيق تأثير التبكسل على الصورة بالكامل أو على منطقة محددة."
i18n_source_hash: a3ad29841f7b
i18n_provenance: human
i18n_output_hash: e713378c97a7
---

# التبكسل {#pixelate}

طبّق تأثير التبكسل على صورة كاملة أو على منطقة مستطيلة محددة. مفيد لإخفاء المحتوى الحساس مثل الوجوه أو لوحات المركبات أو المعلومات الشخصية.

## نقطة نهاية الـ API {#api-endpoint}

`POST /api/v1/tools/image/pixelate`

يقبل بيانات نموذج متعدد الأجزاء مع ملف صورة وحقل JSON باسم `settings`.

## المعاملات {#parameters}

| المعامل | النوع | مطلوب | القيمة الافتراضية | الوصف |
|-----------|------|----------|---------|-------------|
| blockSize | integer | لا | `12` | حجم كتلة البكسل (2-128)؛ القيم الأكبر تنتج تبكسلًا أخشن |
| region | object | لا | - | تقييد التبكسل بمستطيل (انظر أدناه) |

### كائن المنطقة {#region-object}

| الحقل | النوع | مطلوب | الوصف |
|-------|------|----------|-------------|
| left | integer | نعم | الإزاحة اليسرى بالبكسل (>= 0) |
| top | integer | نعم | الإزاحة العلوية بالبكسل (>= 0) |
| width | integer | نعم | عرض المنطقة بالبكسل (>= 1) |
| height | integer | نعم | ارتفاع المنطقة بالبكسل (>= 1) |

## مثال على الطلب {#example-request}

تبكسل الصورة بالكامل:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/pixelate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"blockSize": 20}'
```

تبكسل منطقة محددة:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/pixelate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"blockSize": 16, "region": {"left": 100, "top": 50, "width": 200, "height": 150}}'
```

## مثال على الاستجابة {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2380000
}
```

## ملاحظات {#notes}

- عند حذف `region`، تُبكسل الصورة بالكامل.
- إحداثيات المنطقة بالبكسل نسبةً إلى الركن العلوي الأيسر للصورة. يجب أن تقع المنطقة ضمن حدود الصورة.
- تطابق صيغة الإخراج صيغة الإدخال. تُفكّ ترميزات مدخلات HEIC وRAW وPSD وSVG تلقائيًا قبل المعالجة.
