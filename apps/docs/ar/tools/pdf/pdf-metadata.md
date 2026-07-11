---
description: "قراءة وكتابة البيانات الوصفية لمستند PDF."
i18n_source_hash: b2eaebf7467f
i18n_provenance: human
i18n_output_hash: 981a55829a3e
---

# PDF Metadata {#pdf-metadata}

اقرأ وحدّث حقول البيانات الوصفية لمستند PDF مثل العنوان والمؤلف والموضوع والكلمات المفتاحية. عندما لا تُقدَّم أي إعدادات، تُعاد البيانات الوصفية الموجودة دون تعديل.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-metadata`

يقبل بيانات نموذج multipart تحتوي على ملف PDF وحقل `settings` اختياري بصيغة JSON.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| title | string | No | - | عنوان المستند (بحد أقصى 500 حرف) |
| author | string | No | - | مؤلف المستند (بحد أقصى 500 حرف) |
| subject | string | No | - | موضوع المستند (بحد أقصى 500 حرف) |
| keywords | string | No | - | الكلمات المفتاحية للمستند (بحد أقصى 500 حرف) |

جميع المعاملات اختيارية. تُترك الحقول المحذوفة دون تغيير.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf" \
  -F 'settings={"title": "Q2 Report", "author": "Finance Team"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/report.pdf",
  "originalSize": 245000,
  "processedSize": 245200,
  "metadata": {
    "title": "Q2 Report",
    "author": "Finance Team",
    "subject": "",
    "keywords": ""
  }
}
```

## Notes {#notes}

- صيغة الإدخال المقبولة: `.pdf`.
- هذه أداة سريعة (متزامنة) تُعيد النتيجة مباشرة.
- يحتوي حقل `metadata` في الاستجابة على البيانات الوصفية الناتجة بعد أي تحديثات.
- لقراءة البيانات الوصفية دون تعديلها، احذف حقل `settings` أو أرسل كائناً فارغاً.
- كل حقل بيانات وصفية محدود بـ 500 حرف.
