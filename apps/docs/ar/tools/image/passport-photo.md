---
description: "مولّد صور جوازات السفر وبطاقات الهوية المدعوم بالذكاء الاصطناعي مع كشف الوجه وإزالة الخلفية وترتيب أوراق الطباعة."
i18n_source_hash: d4b4f4ced988
i18n_provenance: human
i18n_output_hash: 455734f143be
---

# صورة جواز السفر {#passport-photo}

مولّد صور جوازات السفر وبطاقات الهوية المدعوم بالذكاء الاصطناعي. سير عمل من مرحلتين: التحليل (كشف الوجه + إزالة الخلفية) ثم التوليد (القص وتغيير الحجم والترتيب للطباعة).

## نقاط نهاية الـ API {#api-endpoints}

يستخدم هذا الأداة تدفقًا من مرحلتين مع نقاط نهاية منفصلة للتحليل والتوليد.

**حزم النماذج:** `background-removal` و `face-detection`

---

### المرحلة 1: التحليل {#phase-1-analyze}

`POST /api/v1/tools/image/passport-photo/analyze`

يكشف معالم الوجه ويزيل الخلفية. يُرجع بيانات المعالم ومعاينة لتعرضها الواجهة الأمامية كمعاينة قص.

#### المعاملات {#parameters}

| المعامل | النوع | مطلوب | القيمة الافتراضية | الوصف |
|-----------|------|----------|---------|-------------|
| file | file | نعم | - | ملف الصورة (متعدد الأجزاء) |
| clientJobId | string | لا | - | معرّف مهمة اختياري لتتبّع التقدّم عبر SSE |

#### مثال على الطلب {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/passport-photo/analyze \
  -F "file=@headshot.jpg"
```

#### الاستجابة (200 OK) {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "filename": "headshot.jpg",
  "preview": "<base64-encoded PNG>",
  "previewWidth": 800,
  "previewHeight": 1067,
  "landmarks": {
    "leftEye": { "x": 0.42, "y": 0.35 },
    "rightEye": { "x": 0.58, "y": 0.35 },
    "eyeCenter": { "x": 0.50, "y": 0.35 },
    "chin": { "x": 0.50, "y": 0.65 },
    "forehead": { "x": 0.50, "y": 0.22 },
    "crown": { "x": 0.50, "y": 0.18 },
    "nose": { "x": 0.50, "y": 0.48 },
    "faceCenterX": 0.50
  },
  "imageWidth": 2400,
  "imageHeight": 3200
}
```

#### التقدّم (SSE، اختياري) {#progress-sse-optional}

إذا تم توفير `clientJobId`، يُبثّ التقدّم (0-30% لكشف الوجه، و30-95% لإزالة الخلفية).

#### خطأ: لم يُكتشف وجه (422) {#error-no-face-detected-422}

```json
{
  "error": "No face detected",
  "details": "Could not detect a face in the uploaded image. Please upload a clear, front-facing photo with good lighting."
}
```

---

### المرحلة 2: التوليد {#phase-2-generate}

`POST /api/v1/tools/image/passport-photo/generate`

يقص الصورة ويغيّر حجمها ويرتّبها اختياريًا على ورقة طباعة. يستخدم الصور المخزّنة مؤقتًا من المرحلة 1 (دون إعادة تشغيل الذكاء الاصطناعي).

#### المعاملات (جسم JSON) {#parameters-json-body}

| المعامل | النوع | مطلوب | القيمة الافتراضية | الوصف |
|-----------|------|----------|---------|-------------|
| jobId | string | نعم | - | معرّف المهمة من المرحلة 1 |
| filename | string | نعم | - | اسم الملف الأصلي من المرحلة 1 |
| countryCode | string | نعم | - | رمز الدولة لمواصفات جواز السفر (مثل `US`، `GB`، `IN`) |
| documentType | string | لا | `"passport"` | نوع المستند (من مواصفات الدولة) |
| bgColor | string | لا | `"#FFFFFF"` | لون الخلفية بصيغة hex |
| printLayout | string | لا | `"none"` | تخطيط ورق الطباعة: `none`، `4x6`، `a4` |
| maxFileSizeKb | number | لا | `0` | قيد أقصى حجم للملف بالكيلوبايت (0 = بلا حد) |
| dpi | number | لا | `300` | دقة الإخراج DPI (72-1200) |
| customWidthMm | number | لا | - | عرض الصورة المخصص بالمليمتر (يتجاوز مواصفات الدولة) |
| customHeightMm | number | لا | - | ارتفاع الصورة المخصص بالمليمتر (يتجاوز مواصفات الدولة) |
| zoom | number | لا | `1` | معامل التكبير (0.5-3). القيم > 1 تقص بشكل أضيق |
| adjustX | number | لا | `0` | ضبط الموضع الأفقي |
| adjustY | number | لا | `0` | ضبط الموضع الرأسي |
| landmarks | object | نعم | - | كائن المعالم من استجابة المرحلة 1 |
| imageWidth | number | نعم | - | عرض الصورة من استجابة المرحلة 1 |
| imageHeight | number | نعم | - | ارتفاع الصورة من استجابة المرحلة 1 |

#### مثال على الطلب {#example-request-1}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/passport-photo/generate \
  -H "Content-Type: application/json" \
  -d '{
    "jobId": "a1b2c3d4-...",
    "filename": "headshot.jpg",
    "countryCode": "US",
    "documentType": "passport",
    "bgColor": "#FFFFFF",
    "printLayout": "4x6",
    "dpi": 300,
    "zoom": 1,
    "adjustX": 0,
    "adjustY": 0,
    "landmarks": { "leftEye": {"x":0.42,"y":0.35}, "rightEye": {"x":0.58,"y":0.35}, "eyeCenter": {"x":0.50,"y":0.35}, "chin": {"x":0.50,"y":0.65}, "forehead": {"x":0.50,"y":0.22}, "crown": {"x":0.50,"y":0.18}, "nose": {"x":0.50,"y":0.48}, "faceCenterX": 0.50 },
    "imageWidth": 2400,
    "imageHeight": 3200
  }'
```

#### الاستجابة (200 OK) {#response-200-ok-1}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/{jobId}/headshot_passport.jpg",
  "dimensions": {
    "widthMm": 51,
    "heightMm": 51,
    "widthPx": 602,
    "heightPx": 602,
    "dpi": 300
  },
  "spec": {
    "country": "United States",
    "countryCode": "US",
    "documentType": "passport",
    "documentLabel": "Passport"
  },
  "printDownloadUrl": "/api/v1/download/{jobId}/headshot_passport_print_4x6.jpg"
}
```

---

### المسار الأساسي {#base-route}

`POST /api/v1/tools/image/passport-photo`

يُرجع إرشادات لاستخدام نقطة النهاية الفرعية الصحيحة.

```json
{
  "error": "Use /api/v1/tools/image/passport-photo/analyze or /generate"
}
```

## ملاحظات {#notes}

- يتطلب تثبيت حزمتي النماذج `background-removal` و `face-detection`.
- تُشغّل المرحلة 1 الذكاء الاصطناعي (معالم الوجه + إزالة الخلفية) وتخزّن النتائج مؤقتًا. المرحلة 2 هي معالجة صور خالصة عبر Sharp (سريعة، لا حاجة للذكاء الاصطناعي).
- تُرجع المعالم كإحداثيات مُطبَّعة (نطاق 0-1 نسبةً إلى أبعاد الصورة).
- حقل `preview` في استجابة التحليل هو صورة PNG مُرمَّزة بترميز base64 (أقصى عرض 800 بكسل) للعرض السريع.
- تتضمن مواصفات الدول أبعاد المستند ونسب ارتفاع الرأس وتموضع خط العين استنادًا إلى المتطلبات الرسمية لصور جوازات السفر.
- يولّد خيار `printLayout` ورقة مرتّبة على ورق مقاس 4x6 بوصة أو A4 مع فواصل بمقدار 2 مليمتر بين الصور.
- عند ضبط `maxFileSizeKb`، يُضغط الإخراج بشكل تكراري ليناسب حد الحجم.
