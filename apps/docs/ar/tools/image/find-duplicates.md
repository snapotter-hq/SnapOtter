---
description: "اكتشاف الصور المكررة وشبه المكررة باستخدام التجزئة الإدراكية."
i18n_source_hash: 4e1f4413f90f
i18n_provenance: human
i18n_output_hash: 5c70395f39ee
---

# البحث عن التكرارات {#find-duplicates}

ارفع صوراً متعددة لاكتشاف التكرارات وشبه التكرارات باستخدام التجزئة الإدراكية (dHash). يجمّع الصور المتشابهة معاً، ويحدد أفضل نسخة جودة في كل مجموعة، ويحسب التوفير المحتمل في المساحة.

## نقطة نهاية API {#api-endpoint}

`POST /api/v1/tools/image/find-duplicates`

يقبل بيانات نموذج multipart تحتوي على ملفات صور متعددة وحقل JSON اختياري `settings`.

## المعاملات {#parameters}

| المعامل | النوع | مطلوب | الافتراضي | الوصف |
|-----------|------|----------|---------|-------------|
| threshold | number | لا | `8` | أقصى مسافة Hamming لاعتبار الصور مكررة (0 إلى 20). أقل = مطابقة أكثر صرامة |

### حقول الملفات {#file-fields}

ارفع صورتين على الأقل في طلب multipart (جميعها باستخدام اسم الحقل `file` أو أي اسم حقل لأجزاء الملفات).

## مثال على طلب {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/find-duplicates \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo1.jpg" \
  -F "file=@photo2.jpg" \
  -F "file=@photo3.jpg" \
  -F "file=@photo4.jpg" \
  -F 'settings={"threshold": 8}'
```

## مثال على استجابة {#example-response}

```json
{
  "totalImages": 4,
  "duplicateGroups": [
    {
      "groupId": 1,
      "files": [
        {
          "filename": "photo1.jpg",
          "similarity": 100,
          "width": 4032,
          "height": 3024,
          "fileSize": 2450000,
          "format": "jpeg",
          "isBest": true,
          "thumbnail": "data:image/jpeg;base64,/9j/..."
        },
        {
          "filename": "photo2.jpg",
          "similarity": 96.88,
          "width": 1920,
          "height": 1440,
          "fileSize": 850000,
          "format": "jpeg",
          "isBest": false,
          "thumbnail": "data:image/jpeg;base64,/9j/..."
        }
      ]
    }
  ],
  "uniqueImages": 2,
  "spaceSaveable": 850000,
  "skippedFiles": []
}
```

## حقول الاستجابة {#response-fields}

| الحقل | النوع | الوصف |
|-------|------|-------------|
| totalImages | number | عدد الصور التي تم تحليلها بنجاح |
| duplicateGroups | array | مجموعات الصور المكررة |
| uniqueImages | number | عدد الصور التي ليست جزءاً من أي مجموعة تكرار |
| spaceSaveable | number | إجمالي البايتات التي يمكن توفيرها بإزالة التكرارات غير الأفضل |
| skippedFiles | array | الملفات التي تعذّرت معالجتها (مع اسم الملف والسبب) |

### كائن مجموعة التكرار {#duplicate-group-object}

| الحقل | النوع | الوصف |
|-------|------|-------------|
| groupId | number | معرّف المجموعة |
| files | array | الصور في مجموعة التكرار هذه |

### كائن الملف (ضمن مجموعة) {#file-object-within-a-group}

| الحقل | النوع | الوصف |
|-------|------|-------------|
| filename | string | اسم الملف الأصلي |
| similarity | number | نسبة التشابه مع الصورة المرجعية (الأولى في المجموعة) |
| width | number | عرض الصورة بالبكسل |
| height | number | ارتفاع الصورة بالبكسل |
| fileSize | number | حجم الملف بالبايت |
| format | string | صيغة الصورة |
| isBest | boolean | ما إذا كانت هذه أعلى نسخة جودة (أكثر بكسلات، أكبر ملف) |
| thumbnail | string أو null | صورة مصغرة Base64 JPEG (بعرض 200 بكسل) للمعاينة |

## ملاحظات {#notes}

- يستخدم dHash بحجم 128 بت (64 بت للصف + 64 بت للعمود) لاكتشاف التشابه الإدراكي. هذا يلتقط التكرارات حتى عبر إعادة التحجيم وإعادة الضغط والتعديلات الطفيفة.
- يمثّل العتبة أقصى مسافة Hamming بين التجزئات. الافتراضي 8 يلتقط شبه التكرارات مع تجنّب النتائج الإيجابية الخاطئة. استخدم 0 للتطابق البكسلي فقط، أو 15-20 للمطابقة الفضفاضة جداً.
- الصورة "الأفضل" في كل مجموعة هي التي تحتوي على أكثر بكسلات (العرض × الارتفاع)، مع حجم الملف كعامل فاصل.
- مطلوب صورتان على الأقل. تُبلَّغ الملفات التي تفشل في التحقق أو فك الترميز في `skippedFiles` بدلاً من التسبب في فشل الطلب بأكمله.
- الصور المصغرة هي معاينات JPEG بعرض 200 بكسل مُرمّزة كـ data URIs.
- جميع الصيغ الشائعة مدعومة (HEIC وRAW وPSD وSVG تُفك ترميزها تلقائياً).
