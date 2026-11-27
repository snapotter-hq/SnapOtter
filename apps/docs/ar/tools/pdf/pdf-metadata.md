---
description: "قراءة وكتابة البيانات الوصفية لمستند PDF."
i18n_source_hash: 11de4f7991e4
i18n_provenance: machine
i18n_output_hash: c35c397d628e
i18n_hash_version: 2
---

# PDF Metadata {#pdf-metadata}

اقرأ وحدّث حقول البيانات الوصفية لمستند PDF مثل العنوان والمؤلف والموضوع والكلمات المفتاحية، أو أزل البيانات الوصفية للمستند بالكامل. عندما لا تُقدَّم أي إعدادات، تُعاد البيانات الوصفية الموجودة دون تعديل.

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
| stripAll | boolean | No | false | إزالة قاموس Info بالكامل (التواريخ وCreator وProducer والمفاتيح المخصصة)، وكل تدفقات XMP (المستند والصفحات والصور) وجميع بيانات تطبيقات PieceInfo، ثم كتابة أي حقول مذكورة أعلاه |
| removeAttachments | boolean | No | false | إزالة الملفات المضمّنة أيضًا: قائمة مرفقات المستند وتعليقات المرفقات الملفية والملفات المرتبطة (`/AF`). يتطلب `stripAll` |

جميع المعاملات اختيارية. تُترك الحقول المحذوفة دون تغيير ما لم يُضبط `stripAll`.

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
- مع `stripAll`، تتضمن الاستجابة أيضًا `stripped`: مفاتيح Info التي أُزيلت (`removed`)، وهل أُزيل تدفق XMP للمستند (`xmpRemoved`)، ومستوى PDF/A الذي أعلنه الدخل (`pdfa`، أو `null`)، وعدد تدفقات XMP التي أُزيلت من الصفحات والصور والكائنات الأخرى (`objectXmpRemoved`)، وعدد قواميس PieceInfo التي أُزيلت (`pieceInfoRemoved`)، وعدد الملفات المضمّنة التي أُزيلت (`attachmentsRemoved`، وتكون دائمًا `0` بدون `removeAttachments`). إزالة XMP تُخلّ بمطابقة PDF/A.
- `stripAll` وحده يُبقي الملفات المضمّنة المرفقة، لأن إزالتها تغيّر محتوى المستند. أضف `removeAttachments` لإسقاطها أيضًا. وهذا يزيل ملف XML المرفق من فواتير ZUGFeRD وFactur-X الإلكترونية ويُخلّ بمطابقة PDF/A-3.
- إرسال `removeAttachments` دون `stripAll` يعيد 400.
