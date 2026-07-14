---
description: "استخراج النص من الصور محليا مع المدمج في Tesseract أو الدقة العالية الاختيارية RapidOCR وقت التشغيل."
i18n_output_hash: 69c851611013
i18n_source_hash: 0d453b49db02
i18n_provenance: human
---

# التعرّف الضوئي على الحروف / استخراج النص {#ocr-text-extraction}

استخراج النص من الصور دون إرسال الصورة إلى خدمة خارجية. تستخدم طبقة `fast` المدمجة Tesseract. تستخدم طبقات `balanced` و`best` الاختيارية RapidOCR مع نماذج PP-OCR ONNX المثبتة.


<!-- korean-ocr-contract:start -->
::: info توافق OCR الكوري
يدعم Fast OCR اللغات `auto` و`en` و`de` و`es` و`fr` و`zh` و`ja`، لكنه لا يدعم الكورية (`ko`). تتطلب الكورية حزمة OCR الدقيقة ومستوى `balanced` أو `best`. تعمل الحزمة على حاويات Linux amd64 وarm64 الرسمية، بما في ذلك مضيفات NVIDIA حيث يبقى OCR على CPU. تُرجع الأنظمة غير المدعومة خطأ توافق صريحاً ولا تعود بصمت إلى `fast`. كما يُرفض طلب Korean مع `fast` أو الاسم القديم `tesseract` قبل وضعه في قائمة الانتظار، مع `FEATURE_INCOMPATIBLE` والسبب `fast-korean-unsupported`.
:::
<!-- korean-ocr-contract:end -->
## نقطة نهاية الـ API {#api-endpoint}

`POST /api/v1/tools/image/ocr`

**المعالجة:** يعمل OCR دائماً بشكل غير متزامن. بعد التحقق ووضع المهمة في قائمة الانتظار، تعيد نقطة النهاية فوراً `202 Accepted` مع `jobId`. اتبع تدفق تقدم SSE للمهمة حتى حدث `complete` أو `failed` النهائي؛ يحتوي `result` في حدث النجاح على حقول OCR.

**حزمة OCR الدقيقة:** وقت تشغيل `ocr` اختياري (حوالي 208-234 MiB للتنزيل و409-488 MiB مثبتة، حسب الهدف). `fast` لا يتطلب هذه الحزمة؛ يتحقق المثبت من الأحجام الدقيقة المرتبطة بالفهرس الموقع.

## المعاملات {#parameters}

| المعامل | النوع | مطلوب | القيمة الافتراضية | الوصف |
|-----------|------|----------|---------|-------------|
| file | file | نعم | - | ملف صورة (متعدد الأجزاء)، مشفر حتى 512 MiB و40 ميجابكسل مشفر؛ ولا يزال الحد الأدنى للتحميل الخاص بالمشغل مطبقًا |
| quality | string | لا | متحرك | مستوى الجودة: `fast` (Tesseract)، `balanced` (RapidOCR مع موديلات PP-OCRv6 الصغيرة)، أو `best` (نماذج PP-OCRv6 المتوسطة عالية الدقة مع تسجيل متغير مُعاير) |
| language | string | لا | `"auto"` | تلميح اللغة: `auto`، `en`، `de`، `fr`، `es`، `zh`، `ja`، `ko` |
| enhance | boolean | لا | تعتمد على الطبقة | تحسين التباين المحلي قبل التعرف عليه. سريع يطبقه مباشرة؛ يحتفظ الخيار Balanced وBest بالمتغير فقط عندما يؤدي تسجيل المعايرة إلى تحسين النتيجة. الإعدادات الافتراضية هي `true` لـ `best` و`false` لـ `fast`/`balanced` |
| engine | string | لا | - | الاسم المستعار للتوافق مهمل. استخدم `quality` بدلاً من ذلك. يقوم `tesseract` بتعيين `fast`؛ يتم تعيين قيمة `paddleocr` القديمة إلى `balanced` ولكنها لا تقوم بتحميل PaddlePaddle |

عند حذف `quality` و`engine`، يختار SnapOtter أعلى مستوى متاح بالترتيب: `best` ثم `balanced` ثم `fast`. لا تختار اللغة الكورية `fast` أبداً؛ بل تستخدم `best` ثم `balanced`، أو تُرجع خطأ تثبيت أو توافق لوقت التشغيل الدقيق.

## مثال على الطلب {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/ocr \
  -F "file=@document.png" \
  -F 'settings={"quality":"best","language":"en","enhance":true}'
```

## الاستجابة المقبولة (202) {#accepted-response-202}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### التقدم والنتيجة (SSE) {#progress-sse-optional}

اتصل بالمسار `GET /api/v1/jobs/{jobId}/progress` باستخدام `jobId` الذي أعادته استجابة `202` (أو `clientJobId` الذي قدمته). أبقِ التدفق مفتوحاً حتى حدث `complete` أو `failed` النهائي. يحتوي الإطار النهائي الناجح على ناتج OCR في `result`:

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "type": "single",
  "phase": "complete",
  "stage": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document_ocr.txt",
    "originalSize": 12345,
    "processedSize": 47,
    "text": "Extracted text content from the image...",
    "engine": "rapidocr-onnx",
    "requestedQuality": "best",
    "actualQuality": "best",
    "device": "cpu",
    "provider": "CPUExecutionProvider",
    "degraded": false,
    "warnings": [],
    "runtimeVersion": "2.1.0",
    "modelVersion": "PP-OCRv6-best-v1-medium"
  }
}
```

تصل حالات فشل المعالجة في الحقل `error` لحدث `failed` النهائي؛ ولا تُعاد كاستجابة HTTP `422` بعد وضع المهمة في قائمة الانتظار.

## ملاحظات {#notes}

- `fast` متاح دائمًا في صور SnapOtter المدعومة. يتطلب `balanced` و`best` حزمة OCR الاختيارية الدقيقة.
- يضيف Tesseract المدمج حوالي 25 MiB إلى الصورة الرسمية. يتم تخزين الحزمة الدقيقة في `/data/ai`، ولا يتم تخزينها في الصورة.
- تم نشر الحزمة الدقيقة لحاويات Linux amd64 و arm64 الرسمية. يستخدم عمدًا موفر ONNX Runtime الخاص بـ CPU، بما في ذلك على مضيفي NVIDIA، لذلك فهو لا يعتمد على مكتبات CUDA أو توافق GPU. تستخدم عمليات تثبيت bare-metal المصدر والمُنشأة مسبقًا Fast OCR ما لم توفر وقت تشغيل متوافقًا خاصًا بها.
- يتضمن `result` النهائي الناجح كلاً من النص المستخرج في `text` وملف `.txt` قابلاً للتنزيل في `downloadUrl`.
- SnapOtter يكرم الطبقة المطلوبة بشكل صريح. في حالة عدم توفر `balanced` أو `best`، تقوم API بإرجاع `501` مع `FEATURE_NOT_INSTALLED` أو `FEATURE_INCOMPATIBLE`؛ ولا يؤدي أبدًا إلى خفض مستوى الطلب بصمت إلى مستوى آخر.
- النتيجة الفارغة الناجحة تبقى نتيجة فارغة. تؤدي حالات الفشل في وقت التشغيل إلى ظهور خطأ بدلاً من إعادة المحاولة باستخدام محرك منخفض الجودة.
- يبلغ `result` النهائي الناجح عن كل من `requestedQuality` و`actualQuality`، بالإضافة إلى المحرك والجهاز والموفر ووقت التشغيل وإصدارات الطراز وأي تحذيرات.
- يدعم صيغ الإدخال HEIC/HEIF وRAW وTGA وPSD وEXR وHDR عبر فك الترميز التلقائي.
- تُرجع المدخلات المشفرة كبيرة الحجم `413`. يتم رفض الصور التي يزيد حجمها عن 40 ميجابكسل واستجابات OCR التي تتجاوز حدود الإخراج المحددة الخاصة بها بدلاً من معالجتها جزئيًا.
