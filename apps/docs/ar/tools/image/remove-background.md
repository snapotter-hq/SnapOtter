---
description: "إزالة الخلفية المدعومة بالذكاء الاصطناعي مع تأثيرات اختيارية (تمويه، ظل، تدرّج، خلفية مخصصة)."
i18n_source_hash: 0814cd471fc1
i18n_provenance: human
i18n_output_hash: 340f8217244d
---

# إزالة الخلفية {#remove-background}

إزالة الخلفية المدعومة بالذكاء الاصطناعي مع تأثيرات اختيارية (تمويه، ظل، تدرّج، خلفية مخصصة).

## نقطة نهاية الـ API {#api-endpoint}

`POST /api/v1/tools/image/remove-background`

**المعالجة:** غير متزامنة (تُرجع 202، استعلم عن `/api/v1/jobs/{jobId}/progress` لمعرفة الحالة عبر SSE)

**حزمة النموذج:** `background-removal` (4-5 غيغابايت)

## المعاملات {#parameters}

تُزيل المرحلة 1 الخلفية وتخزّن مؤقتًا قناع PNG الشفاف والصورة الأصلية. يتم تطبيق استبدال الخلفية والتمويه والظل المُسقَط وتحويل صيغة الإخراج في [المرحلة 2 (`/api/v1/tools/image/remove-background/effects`)](#effects-endpoint-phase-2) (أو عند تشغيل `remove-background` كخطوة في خط أنابيب أو كمهمة دفعية)؛ تمرير تلك الحقول إلى المرحلة 1 يعيد 400.

| المعامل | النوع | مطلوب | القيمة الافتراضية | الوصف |
|-----------|------|----------|---------|-------------|
| file | file | نعم | - | ملف الصورة (متعدد الأجزاء) |
| model | string | لا | - | متغير نموذج الذكاء الاصطناعي المراد استخدامه |
| edgeRefine | integer | لا | - | مستوى تنقيح الحواف (0-3) |
| decontaminate | boolean | لا | - | إزالة تسرّب الألوان من الحواف |

## مثال على الطلب {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/remove-background \
  -F "file=@photo.jpg" \
  -F 'settings={"model":"birefnet-portrait","edgeRefine":2,"decontaminate":true}'
```

## الاستجابة {#response}

### الاستجابة الأولية (202 Accepted) {#initial-response-202-accepted}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### التقدّم (SSE على `/api/v1/jobs/{jobId}/progress`) {#progress-sse-at-api-v1-jobs-jobid-progress}

```
event: progress
data: {"phase":"processing","stage":"Removing background...","percent":50}
```

### النتيجة النهائية (عبر SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/photo_mask.png",
    "maskUrl": "/api/v1/download/{jobId}/photo_mask.png",
    "originalSize": 245000,
    "processedSize": 180000,
    "filename": "photo.jpg",
    "model": "rembg"
  }
}
```

## نقطة نهاية التأثيرات (المرحلة 2) {#effects-endpoint-phase-2}

`POST /api/v1/tools/image/remove-background/effects`

تُعيد تطبيق تأثيرات الخلفية دون إعادة تشغيل نموذج الذكاء الاصطناعي. تستخدم القناع والصورة الأصلية المخزّنين مؤقتًا من المرحلة 1.

### المعاملات {#parameters-1}

| المعامل | النوع | مطلوب | القيمة الافتراضية | الوصف |
|-----------|------|----------|---------|-------------|
| settings | JSON | نعم | - | JSON مع إعدادات التأثيرات (انظر أدناه) |
| backgroundImage | file | مطلوب عندما يكون `backgroundType` هو `image` | - | صورة خلفية مخصصة |

#### حقول إعدادات JSON {#settings-json-fields}

| الحقل | النوع | مطلوب | القيمة الافتراضية | الوصف |
|-------|------|----------|---------|-------------|
| jobId | string | نعم | - | معرّف المهمة من المرحلة 1 |
| filename | string | نعم | - | اسم الملف الأصلي من المرحلة 1 |
| backgroundType | string | لا | `"transparent"` | أحد الخيارات: `transparent`، `color`، `gradient`، `blur`، `image` |
| backgroundColor | string | مطلوب عندما يكون `backgroundType` هو `color` | - | لون hex: `#RRGGBB` أو `#RGB` (علامة `#` اختيارية) |
| gradientColor1 | string | مطلوب عندما يكون `backgroundType` هو `gradient` | - | لون التدرّج الأول، بصيغة hex مثل `backgroundColor` |
| gradientColor2 | string | مطلوب عندما يكون `backgroundType` هو `gradient` | - | لون التدرّج الثاني، بصيغة hex مثل `backgroundColor` |
| gradientAngle | number | لا | - | زاوية التدرّج بالدرجات |
| blurEnabled | boolean | لا | - | تمويه الخلفية الأصلية خلف الموضوع (`backgroundType: "blur"` يعني تفعيله) |
| blurIntensity | number | لا | - | شدة التمويه (0-100) |
| shadowEnabled | boolean | لا | - | تفعيل الظل المُسقَط على الموضوع |
| shadowOpacity | number | لا | `35` | تعتيم الظل (0-100)، يُستخدم عندما يكون `shadowEnabled` صحيحًا |
| outputFormat | string | لا | `"png"` | صيغة الإخراج: `png` أو `webp` أو `avif` |

### مثال على الطلب {#example-request-1}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/remove-background/effects \
  -F 'settings={"jobId":"a1b2c3d4-...","filename":"photo.jpg","backgroundType":"color","backgroundColor":"#FF5500","outputFormat":"png"}'
```

### الاستجابة (200 OK) {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/{jobId}/photo_nobg.png",
  "processedSize": 195000
}
```

#### خطأ: انتهت صلاحية إزالة الخلفية (410) {#error-background-removal-expired-410}

تعمل نقطة نهاية التأثيرات من القناع والأصل الذي خزّنته المرحلة 1 لـ `jobId`. تُنظَّف المخرجات المخزَّنة بعد فترة، لذا إذا مرّ وقت طويل بين الاستدعاءين، تكون قد ذهبت. شغّل المرحلة 1 مرة أخرى بالصورة نفسها واستخدم `jobId` الذي يعيده.

```json
{
  "error": "This image's background removal has expired. Remove the background again.",
  "code": "BACKGROUND_REMOVAL_EXPIRED"
}
```

`jobId` أو `filename` لا يستطيع تسمية ملف مخزَّن (فاصل مسار، أو `..`، أو نص فارغ) يعيد 400.

## ملاحظات {#notes}

- يتطلب تثبيت حزمة النموذج `background-removal` (4-5 غيغابايت).
- تخزّن المرحلة 1 القناع الشفاف والصورة الأصلية مؤقتًا بحيث يمكن للمرحلة 2 (التأثيرات) إعادة تطبيق خلفيات مختلفة فورًا دون إعادة تشغيل نموذج الذكاء الاصطناعي.
- يدعم صيغ الإدخال HEIC/HEIF وRAW وTGA وPSD وEXR وHDR عبر فك الترميز التلقائي.
- يُصحَّح دوران EXIF تلقائيًا قبل المعالجة.
