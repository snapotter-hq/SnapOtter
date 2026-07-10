---
description: "دمج عدة ملفات PDF في مستند واحد."
i18n_source_hash: e82e389cb8b6
i18n_provenance: human
i18n_output_hash: dcbb777d5290
---

# Merge PDFs {#merge-pdfs}

ادمج ملفَّي PDF أو أكثر في مستند واحد، مع الحفاظ على ترتيب صفحات كل ملف إدخال.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/merge-pdf`

يقبل بيانات نموذج multipart تحتوي على ملفَّي PDF أو أكثر. لا حاجة إلى حقل `settings`.

## Parameters {#parameters}

ليس لهذه الأداة أي معاملات إعدادات. ما عليك سوى رفع ملفَّي PDF أو أكثر.

| Constraint | Value |
|------------|-------|
| الحد الأدنى للملفات | 2 |
| الحد الأقصى للملفات | 20 |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/merge-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document1.pdf" \
  -F "file=@document2.pdf" \
  -F "file=@document3.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/merged.pdf",
  "originalSize": 4500000,
  "processedSize": 4200000
}
```

## Notes {#notes}

- تُدمج الملفات بالترتيب الذي رُفعت به.
- يلزم توفّر ملفَّي PDF على الأقل؛ سيفشل الطلب بخطأ 400 إذا قُدِّم عدد أقل.
- الحد الأقصى لعدد ملفات الإدخال هو 20.
- يجب إلغاء قفل ملفات PDF المشفَّرة قبل الدمج.
