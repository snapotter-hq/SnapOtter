---
description: "إزالة ظهور نصوص من ملف PDF بشكل دائم (تنقيح حقيقي موثّق)."
i18n_source_hash: 296ad2a701b2
i18n_provenance: human
i18n_output_hash: be2ce61ba138
---

# Redact PDF {#redact-pdf}

أزِل بشكل دائم ظهور نصوص محدّدة من ملف PDF باستخدام تنقيح حقيقي موثّق. يُحذف النص المُنقَّح تماماً من الملف، وليس مجرد تغطيته بمربّع أسود.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/redact-pdf`

يقبل بيانات نموذج multipart تحتوي على ملف PDF وحقل `settings` بصيغة JSON.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| terms | string[] | Yes | - | سلاسل النصوص المراد تنقيحها (من 1 إلى 50 عبارة، كل منها بحد أقصى 200 حرف) |
| caseSensitive | boolean | No | `false` | ما إذا كانت المطابقة حساسة لحالة الأحرف |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/redact-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@contract.pdf" \
  -F 'settings={"terms": ["John Doe", "555-0123"], "caseSensitive": false}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/contract.pdf",
  "originalSize": 245000,
  "processedSize": 243000,
  "found": 7
}
```

## Notes {#notes}

- صيغة الإدخال المقبولة: `.pdf`.
- هذه أداة سريعة (متزامنة) تُعيد النتيجة مباشرة.
- يُجري هذا تنقيحاً حقيقياً: يُزال النص المطابق من تدفّق محتوى PDF، وليس مجرد إخفائه بصرياً.
- يشير حقل `found` في الاستجابة إلى عدد مرات الظهور التي جرى تنقيحها.
- يمكنك تنقيح ما يصل إلى 50 عبارة في طلب واحد.
