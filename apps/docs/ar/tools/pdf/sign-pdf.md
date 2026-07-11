---
description: "ختم صور توقيع مرفوعة على ملف PDF باستخدام مواضع صفحات مُطبَّعة."
i18n_source_hash: c28f78c2e7fd
i18n_provenance: human
i18n_output_hash: c0419e50518e
---

# Sign PDF {#sign-pdf}

اختم صورة توقيع PNG مرفوعة واحدة أو أكثر على أي صفحة من ملف PDF. يستخدم هذا المسار عقد multipart مخصّصاً لأنه يحتاج إلى ملف PDF، وصورة توقيع واحدة أو أكثر، وإحداثيات المواضع.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/sign-pdf`

يقبل بيانات نموذج multipart. يُرسل ملف PDF بوصفه `file`؛ وتُرسل التواقيع بوصفها `sig0` و`sig1` وهكذا؛ وتُرسل المواضع في حقل `placements` بصيغة JSON.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | ملف PDF المراد توقيعه |
| sig0 | file | Yes | - | صورة التوقيع الأولى. تستخدم الصور الإضافية `sig1` و`sig2` وهكذا |
| placements | JSON string | Yes | - | مصفوفة كائنات المواضع: `{ "sig": 0, "page": 0, "x": 0.2, "y": 0.7, "w": 0.25, "h": 0.08 }` |
| clientJobId | string | No | - | UUID اختياري لتتبّع التقدّم عبر SSE |
| fileId | string | No | - | معرّف مكتبة ملفات اختياري لحفظ النتيجة المُوقَّعة كإصدار جديد |

## Placement Coordinates {#placement-coordinates}

| Field | Type | Description |
|-------|------|-------------|
| sig | integer | فهرس صورة التوقيع. يُطابِق `0` إلى `sig0` |
| page | integer | فهرس صفحة PDF يبدأ من الصفر |
| x | number | الموضع الأيسر ككسر من الصفحة |
| y | number | الموضع العلوي ككسر من الصفحة |
| w | number | عرض التوقيع ككسر من الصفحة |
| h | number | ارتفاع التوقيع ككسر من الصفحة |

تستخدم الإحداثيات نقطة أصل في الزاوية العلوية اليسرى. قد تتجاوز القيم حافة الصفحة قليلاً؛ يقصّ عارض PDF الختم النهائي عند حدود الصفحة.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/sign-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@contract.pdf" \
  -F "sig0=@signature.png" \
  -F 'placements=[{"sig":0,"page":0,"x":0.64,"y":0.82,"w":0.22,"h":0.08}]'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/contract_signed.pdf",
  "previewUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/preview.png",
  "originalSize": 245000,
  "processedSize": 249000
}
```

إذا تعذّر إنهاء الطلب داخل نافذة الانتظار المتزامنة، يُعيد الـ API:

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

اتصل بـ `/api/v1/jobs/<jobId>/progress` ونزّل النتيجة عند اكتمال المهمة.

## Notes {#notes}

- صيغة إدخال PDF المقبولة: `.pdf`.
- يجب أن تكون صور التوقيع ملفات صور صالحة، عادةً بصيغة PNG مع الشفافية.
- يُقبل ما يصل إلى 100 صورة توقيع و100 موضع.
- `sign-pdf` هو مسار مخصّص ولا يستخدم حقل `settings` القياسي للأداة بصيغة JSON.
