---
description: "استخراج الملفات بأمان من أرشيف ZIP مع الحماية من قنابل الضغط."
i18n_source_hash: 484a1f1051b8
i18n_provenance: human
i18n_output_hash: 206f003849a5
---

# استخراج ZIP {#extract-zip}

استخرج الملفات بأمان من أرشيف ZIP. تُرجع الأرشيفات ذات الملف الواحد الملف المُحتوى مباشرةً؛ وتُرجع الأرشيفات متعددة الملفات ملف ZIP مسطّحًا يضم المحتويات المستخرجة.

## نقطة نهاية API {#api-endpoint}

`POST /api/v1/tools/files/extract-zip`

يقبل بيانات نموذج متعدد الأجزاء تحتوي على ملف ZIP. لا يلزم حقل إعدادات.

## المعاملات {#parameters}

ليس لهذه الأداة معاملات قابلة للتهيئة. ارفع ملف `.zip` لاستخراجه.

## مثال على الطلب {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/extract-zip \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@archive.zip"
```

## مثال على الاستجابة {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/archive_extracted.zip",
  "originalSize": 2800000,
  "processedSize": 3500000
}
```

## ملاحظات {#notes}

- تُقبل ملفات `.zip` فقط كدخل.
- إذا احتوى الأرشيف على ملف واحد، يُرجع ذلك الملف مباشرةً (دون تغليفه في ZIP).
- إذا احتوى الأرشيف على ملفات متعددة، يُرجع ZIP مسطّح بجميع الملفات المستخرَجة إلى المستوى الجذري (تُسطَّح بنية الأدلة المتداخلة).
- ترفض الحماية المدمجة من قنابل الضغط الأرشيفات ذات نسب الضغط المفرطة أو أعداد الملفات المفرطة لمنع استنزاف الموارد.
