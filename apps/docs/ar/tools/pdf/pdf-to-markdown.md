---
description: "تحويل ملف PDF إلى Markdown مع الإبقاء على العناوين والقوائم والجداول حيث توجد في ملف PDF."
i18n_source_hash: 93a7fdc45eae
i18n_provenance: machine
i18n_output_hash: 5f766591c303
i18n_hash_version: 2
---

# PDF to Markdown {#pdf-to-markdown}

حوّل ملف PDF إلى ملف Markdown يمكنك وضعه في ويكي أو موقع ثابت أو مسار معالجة يعتمد على LLM.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-to-markdown`

يقبل بيانات نموذج multipart تحتوي على ملف PDF.

## Parameters {#parameters}

ليس لهذه الأداة أي معاملات قابلة للتهيئة. ارفع ملف PDF وستحصل على ملف `.md`.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-markdown \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/report.md",
  "originalSize": 520000,
  "processedSize": 14300,
  "chars": 14300
}
```

قد يستغرق ملف PDF الكبير وقتاً أطول من نافذة المعالجة المتزامنة. عندها يردّ API بالرمز `202` مع `jobId`، وتتابع التقدم على `/api/v1/jobs/{jobId}/progress`.

## What gets kept {#what-gets-kept}

يخزّن ملف PDF نصاً محدد المواضع لا بنية، لذلك يستنتجها المحوّل:

- **العناوين.** تتحول الأسطر القصيرة الأكبر حجماً بوضوح من النص الأساسي إلى عناوين من `#` إلى `######`، مرتّبة حسب الحجم في المستند كله.
- **القوائم.** تتحول الأسطر التي تبدأ برمز نقطي أو رقم إلى عناصر قائمة.
- **الخط العريض والمائل والروابط.** تبقى ضمن النص. تبقى فقط الروابط `http` و`https` و`mailto`.
- **الجداول.** تخرج الجداول المرسومة بخطوط فاصلة على شكل جداول Markdown. أما الجداول المنسّقة بالمسافات وحدها فتخرج غالباً كفقرات عادية.

تُحذف الصور. تُعالَج التخطيطات متعددة الأعمدة وتصاميم الصفحات غير المعتادة بأفضل جهد ممكن، لذا راجع الناتج قبل الاعتماد عليه.

## Notes {#notes}

- صيغة الإدخال المقبولة: `.pdf`.
- الحقل `chars` في الاستجابة هو طول ناتج Markdown.
- ملف PDF الممسوح ضوئياً ليس فيه طبقة نصية للتحويل. ترفضه الأداة بالرمز `422` وبالرمز البرمجي `NO_TEXT_LAYER` بدلاً من إرجاع ملف فارغ. استخدم أداة [PDF OCR](./ocr-pdf) لمثل هذه الملفات.
- للتحويل في الاتجاه المعاكس، تقرأ [Markdown إلى PDF](../files/markdown-to-pdf) و[Markdown إلى DOCX](../files/markdown-to-docx) و[Markdown إلى HTML](../files/markdown-to-html) ملفات `.md`.
