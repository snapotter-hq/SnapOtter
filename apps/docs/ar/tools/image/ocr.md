---
description: "استخراج النص من الصور باستخدام التعرّف الضوئي على الحروف المدعوم بالذكاء الاصطناعي."
i18n_source_hash: 3d85d423b82c
i18n_provenance: human
i18n_output_hash: 982e52ed678e
---

# التعرّف الضوئي على الحروف / استخراج النص {#ocr-text-extraction}

استخرج النص من الصور باستخدام التعرّف الضوئي على الحروف المدعوم بالذكاء الاصطناعي. يدعم لغات متعددة ومستويات جودة متعددة.

## نقطة نهاية الـ API {#api-endpoint}

`POST /api/v1/tools/image/ocr`

**المعالجة:** استجابة JSON متزامنة. إذا تم توفير `clientJobId`، يُبلَّغ عن التقدّم أيضًا عبر SSE.

**حزمة النموذج:** `ocr` (5-6 غيغابايت)

## المعاملات {#parameters}

| المعامل | النوع | مطلوب | القيمة الافتراضية | الوصف |
|-----------|------|----------|---------|-------------|
| file | file | نعم | - | ملف الصورة (متعدد الأجزاء) |
| quality | string | لا | `"balanced"` | مستوى الجودة: `fast` (Tesseract)، `balanced` (PaddleOCR v5)، `best` (PaddleOCR VL) |
| language | string | لا | `"auto"` | تلميح اللغة: `auto`، `en`، `de`، `fr`، `es`، `zh`، `ja`، `ko` |
| enhance | boolean | لا | `true` | معالجة الصورة مسبقًا لتحسين دقة التعرّف الضوئي |
| engine | string | لا | - | مهجور. استخدم `quality` بدلًا منه. يربط `tesseract` بـ `fast`، و `paddleocr` بـ `balanced` |

## مثال على الطلب {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/ocr \
  -F "file=@document.png" \
  -F 'settings={"quality":"best","language":"en","enhance":true}'
```

## الاستجابة (200 OK) {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "filename": "document.png",
  "text": "Extracted text content from the image...",
  "engine": "paddleocr-vl"
}
```

### التقدّم (SSE، اختياري) {#progress-sse-optional}

إذا تم توفير حقل نموذج `clientJobId`، تُبثّ أحداث التقدّم:

```
event: progress
data: {"phase":"processing","stage":"Recognizing text...","percent":50}
```

## ملاحظات {#notes}

- يتطلب تثبيت حزمة النموذج `ocr` (5-6 غيغابايت).
- يُرجع التعرّف الضوئي النص المستخرج مباشرةً بدلًا من رابط تنزيل صورة.
- يستخدم سلسلة احتياطية: إذا تعطّل مستوى جودة أعلى (مثل انهيار PaddleOCR)، يُعيد المحاولة تلقائيًا بالمستوى الأدنى التالي.
- إذا أرجع مستوى ما نصًا فارغًا دون انهيار، فإنه يتراجع أيضًا إلى المستوى التالي.
- تُربط مستويات الجودة بالمحرّكات: `fast` = Tesseract، `balanced` = PaddleOCR v5، `best` = PaddleOCR VL.
- يدعم صيغ الإدخال HEIC/HEIF وRAW وTGA وPSD وEXR وHDR عبر فك الترميز التلقائي.
