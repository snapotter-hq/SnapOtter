---
description: "التحويل بين YAML وJSON في الاتجاهين."
i18n_source_hash: ef0c9b633797
i18n_provenance: human
i18n_output_hash: 3f6fafb6b475
---

# تحويل YAML / JSON {#yaml-json}

حوّل بين صيغتَي YAML وJSON في كلا الاتجاهين. ارفع ملف YAML لتحصل على JSON، أو ارفع ملف JSON لتحصل على YAML.

## نقطة نهاية API {#api-endpoint}

`POST /api/v1/tools/files/yaml-json`

يقبل بيانات نموذج متعدّد الأجزاء (multipart) مع ملف YAML أو JSON. لا يلزم حقل إعدادات.

## المعاملات {#parameters}

لا تحتوي هذه الأداة على أي معاملات قابلة للضبط. يُحدَّد اتجاه التحويل من امتداد ملف الإدخال.

## مثال على الطلب {#example-request}

من YAML إلى JSON:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/yaml-json \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@config.yaml"
```

من JSON إلى YAML:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/yaml-json \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@config.json"
```

## مثال على الاستجابة {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/config.json",
  "originalSize": 620,
  "processedSize": 780
}
```

## ملاحظات {#notes}

- يُكتشَف اتجاه التحويل تلقائيًا من امتداد ملف الإدخال: `.yaml` أو `.yml` يُنتج `.json`، و`.json` يُنتج `.yaml`.
- يُقبل امتدادا `.yaml` و`.yml` معًا.
- يُحوَّل المستند الأول فقط في ملف YAML متعدّد المستندات؛ وتُتجاهَل المستندات الإضافية المفصولة بـ `---`.
