---
description: "توليد الباركود بصيغ Code 128 وEAN-13 وUPC-A وCode 39 وITF-14 وData Matrix."
i18n_source_hash: e84b1df40c7e
i18n_provenance: human
i18n_output_hash: a29a8594bb32
---

# مولّد الباركود {#barcode-generator}

ولّد صور باركود من نص مُدخَل. يدعم صيغ Code 128 وEAN-13 وUPC-A وCode 39 وITF-14 وData Matrix.

## نقطة نهاية API {#api-endpoint}

`POST /api/v1/tools/image/barcode-generate`

يقبل جسم `application/json` (وليس multipart). يُولَّد الباركود من النص المُقدَّم، لا من ملف مرفوع.

## المعاملات {#parameters}

| المعامل | النوع | مطلوب | الافتراضي | الوصف |
|-----------|------|----------|---------|-------------|
| text | string | نعم | - | النص المراد ترميزه في الباركود (1-256 حرفًا) |
| type | string | لا | `"code128"` | صيغة الباركود: `code128`، `ean13`، `upca`، `code39`، `itf14`، `datamatrix` |
| scale | integer | لا | `3` | عامل تكبير الصورة (1-8) |
| includeText | boolean | لا | `true` | ما إذا كان يُصيَّر النص أسفل الباركود |

## مثال على الطلب {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/barcode-generate \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "5901234123457", "type": "ean13", "scale": 4}'
```

## مثال على الاستجابة {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/barcode.png",
  "originalSize": 0,
  "processedSize": 4520
}
```

## ملاحظات {#notes}

- على خلاف معظم الأدوات، تقبل نقطة النهاية هذه جسم JSON لا بيانات نموذج متعدّد الأجزاء، لأن الباركود يُولَّد من نص لا من ملف مرفوع.
- يتطلّب EAN-13 ما يعادل 12 أو 13 رقمًا بالضبط. ويتطلّب UPC-A ما يعادل 11 أو 12 رقمًا بالضبط. وإذا حُذف رقم التحقّق، فإنه يُحسَب تلقائيًا.
- Code 128 هو الصيغة الأكثر مرونة ويدعم مجموعة أحرف ASCII الكاملة.
- تُنتج Data Matrix باركود ثنائي الأبعاد مناسبًا لترميز سلاسل أطول في مربّع مضغوط.
