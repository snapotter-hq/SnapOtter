---
description: "دمج النماذج والتعليقات التوضيحية داخل محتوى الصفحة."
i18n_source_hash: b25c2a2b6f40
i18n_provenance: human
i18n_output_hash: 6c585a17086d
---

# Flatten PDF {#flatten-pdf}

ادمج حقول النماذج التفاعلية والتعليقات التوضيحية داخل محتوى الصفحة، مُنتِجاً ملف PDF ثابتاً يظهر بالشكل نفسه في كل مكان.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/flatten-pdf`

يقبل بيانات نموذج multipart تحتوي على ملف PDF.

## Parameters {#parameters}

ليس لهذه الأداة أي معاملات قابلة للتهيئة. ارفع ملف PDF وستُدمج جميع النماذج والتعليقات التوضيحية.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/flatten-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@form.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/form.pdf",
  "originalSize": 185000,
  "processedSize": 172000
}
```

## Notes {#notes}

- صيغة الإدخال المقبولة: `.pdf`.
- هذه أداة سريعة (متزامنة) تُعيد النتيجة مباشرة.
- تُحفظ قيم حقول النماذج كنص ثابت في المخرجات.
- تصبح التعليقات التوضيحية (التعليقات والتمييزات والملاحظات اللاصقة) جزءاً من محتوى الصفحة ولا يمكن تحريرها بعد ذلك.
