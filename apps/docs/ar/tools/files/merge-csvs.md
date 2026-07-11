---
description: "دمج عدّة ملفات CSV أو TSV ذات أعمدة متطابقة في ملف واحد."
i18n_source_hash: 109b5f399ac8
i18n_provenance: human
i18n_output_hash: b2ce9021384c
---

# دمج ملفات CSV {#merge-csvs}

ادمج عدّة ملفات CSV أو TSV ذات أعمدة متطابقة في ملف واحد مدمج. يجب أن تحمل جميع ملفات الإدخال رؤوس الأعمدة نفسها.

## نقطة نهاية API {#api-endpoint}

`POST /api/v1/tools/files/merge-csvs`

يقبل بيانات نموذج متعدّد الأجزاء (multipart) مع ملفَّي CSV أو أكثر. لا يلزم حقل إعدادات.

## المعاملات {#parameters}

لا تحتوي هذه الأداة على أي معاملات قابلة للضبط. ارفع من 2 إلى 20 ملف CSV أو TSV ذات رؤوس أعمدة متطابقة.

## مثال على الطلب {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/merge-csvs \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@january.csv" \
  -F "file=@february.csv" \
  -F "file=@march.csv"
```

## مثال على الاستجابة {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/merged.csv",
  "originalSize": 30000,
  "processedSize": 28500
}
```

## ملاحظات {#notes}

- يتطلّب ما بين 2 و20 ملف إدخال.
- يجب أن تشترك جميع الملفات في رؤوس الأعمدة نفسها. سيفشل الدمج إذا لم تتطابق الأعمدة.
- يُدرَج صف الرأس مرّة واحدة في المخرجات؛ وتُدمَج صفوف البيانات من جميع الملفات بترتيب الرفع.
- تُقبل ملفات CSV وTSV معًا، لكن ينبغي أن تستخدم كل الملفات في الطلب الواحد الفاصل نفسه.
