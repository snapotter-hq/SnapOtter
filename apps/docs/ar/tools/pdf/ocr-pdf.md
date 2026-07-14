---
description: "استخرج النص من ملفات PDF الممسوحة ضوئيًا محليًا باستخدام ميزة مدمجة Tesseract أو الدقة العالية الاختيارية RapidOCR وقت التشغيل."
i18n_output_hash: 8a637d247049
i18n_source_hash: a19ba25a1ca8
i18n_provenance: human
---

# PDF OCR {#pdf-ocr}

استخراج النص من الممسوحة ضوئيا PDF المستندات صفحة تلو الأخرى دون إرسال PDF إلى خدمة خارجية. المدمج في `fast` استخدامات الطبقة Tesseract. الاختياري `balanced` و `best` استخدام الطبقات RapidOCR مع مثبت PP-OCR موديلات اونكس.


<!-- korean-ocr-contract:start -->
::: info توافق OCR الكوري
يدعم Fast OCR اللغات `auto` و`en` و`de` و`es` و`fr` و`zh` و`ja`، لكنه لا يدعم الكورية (`ko`). تتطلب الكورية حزمة OCR الدقيقة ومستوى `balanced` أو `best`. تعمل الحزمة على حاويات Linux amd64 وarm64 الرسمية، بما في ذلك مضيفات NVIDIA حيث يبقى OCR على CPU. تُرجع الأنظمة غير المدعومة خطأ توافق صريحاً ولا تعود بصمت إلى `fast`. كما يُرفض طلب Korean مع `fast` أو الاسم القديم `tesseract` قبل وضعه في قائمة الانتظار، مع `FEATURE_INCOMPATIBLE` والسبب `fast-korean-unsupported`.
:::
<!-- korean-ocr-contract:end -->
## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/ocr-pdf`

يقبل بيانات نموذج multipart تحتوي على ملف PDF وحقل `settings` اختياري بصيغة JSON.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | نعم | - | ملف PDF (متعدد الأجزاء)، مشفر حتى 512 MiB؛ ولا يزال الحد الأدنى للتحميل الخاص بالمشغل مطبقًا |
| quality | string | لا | متحرك | طبقة الجودة OCR: `fast` أو `balanced` أو `best` |
| language | string | No | `"auto"` | لغة المستند: `auto` أو `en` أو `de` أو `fr` أو `es` أو `zh` أو `ja` أو `ko` |
| pages | string | No | `"all"` | تحديد الصفحات، مثل `"all"` أو `"1-3"` أو `"1,3,5"` |
| enhance | boolean | لا | تعتمد على الطبقة | تحسين التباين المحلي قبل التعرف عليه. سريع يطبقه مباشرة؛ يحتفظ الخيار Balanced وBest بالمتغير فقط عندما يؤدي تسجيل المعايرة إلى تحسين النتيجة. الإعدادات الافتراضية هي `true` لـ `best` و`false` لـ `fast`/`balanced` |
| engine | string | لا | - | الاسم المستعار للتوافق مهمل. استخدم `quality` بدلاً من ذلك. يقوم `tesseract` بتعيين `fast`؛ يتم تعيين قيمة `paddleocr` القديمة إلى `balanced` ولكنها لا تقوم بتحميل PaddlePaddle |

عند حذف `quality` و`engine`، يختار SnapOtter أعلى مستوى متاح بالترتيب: `best` ثم `balanced` ثم `fast`. لا تختار اللغة الكورية `fast` أبداً؛ بل تستخدم `best` ثم `balanced`، أو تُرجع خطأ تثبيت أو توافق لوقت التشغيل الدقيق.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/ocr-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@scanned.pdf" \
  -F 'settings={"quality": "best", "language": "en", "pages": "1-5", "enhance": true}'
```

## Example Response {#example-response}

يُعيد `202 Accepted`. تتبّع التقدّم عبر SSE على `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- صيغة الإدخال المقبولة: `.pdf`.
- `fast` تم بناؤه ويضيف حوالي 25 MiB إلى الصورة الرسمية. `balanced` و `best` تتطلب دقة اختيارية OCR حزمة (حوالي 208-234 MiB للتحميل و409-488 MiB مثبتة، حسب الهدف).
- تدعم الحزمة الدقيقة Linux amd64 و arm64 وتستخدم ONNX Runtime على CPU، بما في ذلك مضيفي NVIDIA.
- لا يتم أبدًا خفض المستوى المطلوب صراحةً بصمت. في حالة عدم توفر `balanced` أو `best`، تقوم API بإرجاع `501` مع `FEATURE_NOT_INSTALLED` أو `FEATURE_INCOMPATIBLE`.
- يتم تنقيط صفحات PDF بدقة عالية قبل OCR. يقوم `best` بتشغيل نماذج PP-OCRv6 المتوسطة عالية الدقة ويسجل متغيرات التوجيه والتحسين، مما يعمل على تحسين التعرف على حساب السرعة.
- يتيح إعداد اللغة `auto` التعرف عبر مجموعة البرامج النصية المدعومة؛ يمكن أن يؤدي التلميح الصريح إلى تحسين النتائج للغة مستند معروفة.
- يمكنك استهداف صفحات محدّدة باستخدام النطاقات (`"1-3"`) أو القوائم المفصولة بفواصل (`"1,3,5"`) أو `"all"` لكل صفحة.
- يمكن معالجة الطلب على الأكثر 50 صفحة. تم تحديد الحد الأقصى لبيانات التسويد النقطية عند 512 MiB وتم تحديد الحد الأقصى لاستجابة UTF-8 OCR عند 1,000,000 بايت؛ تفشل المهام الزائدة عن الحد بدلاً من إرجاع نص جزئي.
- بالنسبة لملفات PDF التي تحتوي بالفعل على نص قابل للتحديد، فكّر في استخدام أداة [PDF to Text](./pdf-to-text) الأسرع بدلاً من ذلك.
