---
description: "تجميع ملفات متعددة في أرشيف ZIP واحد."
i18n_source_hash: 9ff1250dbd36
i18n_provenance: human
i18n_output_hash: cb11a75c7418
---

# إنشاء ZIP {#create-zip}

اجمع ملفات متعددة من أي نوع في أرشيف ZIP واحد. تُزال الأسماء المكرّرة للملفات تلقائيًا.

## نقطة نهاية API {#api-endpoint}

`POST /api/v1/tools/files/create-zip`

يقبل بيانات نموذج متعدد الأجزاء تحتوي على ملفين أو أكثر. لا يلزم حقل إعدادات.

## المعاملات {#parameters}

ليس لهذه الأداة معاملات قابلة للتهيئة. ارفع من 2 إلى 50 ملفًا من أي نوع لتجميعها.

## مثال على الطلب {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/create-zip \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf" \
  -F "file=@data.csv" \
  -F "file=@photo.jpg"
```

## مثال على الاستجابة {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/archive.zip",
  "originalSize": 3500000,
  "processedSize": 2800000
}
```

## ملاحظات {#notes}

- يتطلب بين 2 و50 ملف دخل.
- يُقبل أي نوع ملف؛ ولا توجد قيود على تنسيق الدخل.
- إذا تشارك عدة ملفات الاسم نفسه، تُزال أسماؤها المكرّرة تلقائيًا بلواحق رقمية.
- يستخدم أرشيف الخرج ضغط ZIP القياسي (deflate).
