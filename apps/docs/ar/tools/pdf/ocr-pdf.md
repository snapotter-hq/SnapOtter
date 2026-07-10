---
description: "استخراج النص من مستندات PDF باستخدام OCR مدعوم بالذكاء الاصطناعي."
i18n_source_hash: 1431fcba180b
i18n_provenance: human
i18n_output_hash: f0b6d4c18b31
---

# PDF OCR {#pdf-ocr}

استخرج النص من مستندات PDF باستخدام التعرّف الضوئي على الحروف المدعوم بالذكاء الاصطناعي. يدعم عدة مستويات جودة ولغات. يتطلّب تثبيت حزمة ميزة OCR.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/ocr-pdf`

يقبل بيانات نموذج multipart تحتوي على ملف PDF وحقل `settings` اختياري بصيغة JSON.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| quality | string | No | `"balanced"` | مستوى جودة OCR: `fast` أو `balanced` أو `best` |
| language | string | No | `"auto"` | لغة المستند: `auto` أو `en` أو `de` أو `fr` أو `es` أو `zh` أو `ja` أو `ko` |
| pages | string | No | `"all"` | تحديد الصفحات، مثل `"all"` أو `"1-3"` أو `"1,3,5"` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/ocr-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@scanned.pdf" \
  -F 'settings={"quality": "best", "language": "en", "pages": "1-5"}'
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
- هذه أداة ذكاء اصطناعي تتطلّب تثبيت **حزمة ميزة OCR**. إذا لم تكن الحزمة مثبّتة، يُعيد الـ API `501 Not Implemented`.
- يستخدم مستوى الجودة `fast` نموذجاً أخفّ لمعالجة أسرع؛ ويستخدم `best` نموذجاً أدقّ على حساب السرعة.
- يحاول إعداد اللغة `auto` اكتشاف لغة المستند تلقائياً.
- يمكنك استهداف صفحات محدّدة باستخدام النطاقات (`"1-3"`) أو القوائم المفصولة بفواصل (`"1,3,5"`) أو `"all"` لكل صفحة.
- بالنسبة لملفات PDF التي تحتوي بالفعل على نص قابل للتحديد، فكّر في استخدام أداة [PDF to Text](./pdf-to-text) الأسرع بدلاً من ذلك.
