---
description: "غيّر حجم كل صفحة في ملف PDF إلى A4 أو Letter أو ملصق شحن 4x6 بوصة أو حجم مخصص."
i18n_source_hash: 9db88016c07b
i18n_provenance: machine
i18n_output_hash: fcc1e089da63
i18n_hash_version: 2
---

# تغيير حجم صفحات PDF {#resize-pdf-pages}

غيّر حجم كل صفحة في ملف PDF. يُغيَّر مقياس المحتوى ليلائم الصفحة الجديدة ويوضع في المنتصف، فيبقى النص والرسومات المتجهية والباركود واضحة. استخدم هذه الأداة لتحويل ملصق شحن إلى صفحة 4x6 بوصة لطابعة حرارية، أو لنقل مستند بين A4 وUS Letter.

## نقطة نهاية API {#api-endpoint}

`POST /api/v1/tools/pdf/resize-pdf-pages`

تقبل بيانات نموذج متعدد الأجزاء تحتوي على ملف PDF وحقل JSON `settings`.

## المعاملات {#parameters}

| المعامل | النوع | مطلوب | الافتراضي | الوصف |
|-----------|------|----------|---------|-------------|
| pageSize | string | لا | `"4x6in"` | الحجم المستهدف: `4x6in` أو `100x150mm` أو `a4` أو `a5` أو `a6` أو `letter` أو `legal` أو `custom` |
| width | number | لا | `4` | عرض الصفحة المخصص، يُستخدم عندما يكون `pageSize` هو `custom` |
| height | number | لا | `6` | ارتفاع الصفحة المخصص، يُستخدم عندما يكون `pageSize` هو `custom` |
| unit | string | لا | `"in"` | وحدة الحجم المخصص: `in` أو `mm` |
| keepOrientation | boolean | لا | `false` | يدوّر الحجم المستهدف ليطابق اتجاه كل صفحة بدلًا من فرض العرض في الارتفاع |

## مثال طلب {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/resize-pdf-pages \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@label.pdf" \
  -F 'settings={"pageSize": "4x6in"}'
```

## مثال استجابة {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/label_resized.pdf",
  "originalSize": 84200,
  "processedSize": 85100
}
```

## ملاحظات {#notes}

- تُغيَّر مقاييس الصفحات لتلائم الحجم الجديد ولا تُمطَّط أبدًا. عندما تختلف نسبة العرض إلى الارتفاع، تُترك المساحة المتبقية فارغة.
- تغيير الحجم لا يقصّ الصفحة. فالملصق المطبوع على ربع صفحة Letter أو A4 يملأ ربع الصفحة الجديدة فقط.
- يجب أن تكون الأحجام المخصصة بين 0.5 و200 بوصة (12.7-5080 ملم) لكل ضلع.
- يُغيَّر حجم الصفحة انطلاقًا من صندوق القص الخاص بها إن وُجد، لذا تحتفظ الصفحة المقصوصة بالمنطقة المقصوصة فقط.
