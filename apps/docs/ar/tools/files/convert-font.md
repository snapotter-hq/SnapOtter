---
description: "تحويل الخطوط بين TTF وOTF وWOFF وWOFF2."
i18n_source_hash: a17c8ef18e42
i18n_provenance: machine
i18n_output_hash: ccb0b9a02686
i18n_hash_version: 2
---

# تحويل خط {#convert-font}

يحوّل ملف خط بين TrueType (TTF) وOpenType CFF (OTF) وWOFF وWOFF2. استخدمه لتحويل خط سطح مكتب إلى خط ويب، أو للحصول على TTF من OTF لتطبيق لا يقبل إلا TrueType.

## نقطة نهاية API {#api-endpoint}

`POST /api/v1/tools/files/convert-font`

يقبل بيانات نموذج متعدّد الأجزاء (multipart) مع ملف `.ttf` أو `.otf` أو `.woff` أو `.woff2` وحقل JSON باسم `settings`.

## المعاملات {#parameters}

| المعامل | النوع | مطلوب | الافتراضي | الوصف |
|-----------|------|----------|---------|-------------|
| format | string | لا | `ttf` | تنسيق الإخراج: `ttf` أو `otf` أو `woff` أو `woff2` |

## مثال على الطلب {#example-request}

من OTF إلى TTF:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-font \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@MyFont.otf" \
  -F 'settings={"format": "ttf"}'
```

من TTF إلى WOFF2 للويب:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-font \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@MyFont.ttf" \
  -F 'settings={"format": "woff2"}'
```

## مثال على الاستجابة {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/MyFont.ttf",
  "originalSize": 48120,
  "processedSize": 61344
}
```

## ملاحظات {#notes}

- WOFF وWOFF2 غلافان مضغوطان حول بيانات الخط نفسها، لذا فإن التحويل منهما أو إليهما يُبقي المخططات دون تغيير.
- يحوّل التحويل من OTF إلى TTF المنحنيات التكعيبية (CFF) إلى منحنيات TrueType تربيعية. يبقى كل منحنى ضمن وحدة خط واحدة من الأصل، وهذا غير مرئي في الأحجام العادية، لكن التحويل لا يمكن عكسه بدقة. أما التحويل من TTF إلى OTF فيحافظ على أشكال المنحنيات ويكتفي بتقريب نقاط التحكم إلى وحدات خط صحيحة.
- تبقى أذونات تضمين الخط (حقل OS/2 المسمّى `fsType`) كما هي.
- مجموعات الخطوط (`.ttc`) غير مدعومة. لا يمكن تحويل خطوط TrueType المتغيرة إلى OTF، ولا خطوط CFF2 المتغيرة إلى TTF؛ حوّلها إلى WOFF أو WOFF2 بدلًا من ذلك.
- يجري التحويل في عامل المستندات المكتوب بلغة Python بالمهلة نفسها المستخدمة لأدوات المستندات الأخرى، وليس داخل عملية API.
