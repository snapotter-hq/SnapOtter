---
description: "تقليل حجم ملف PDF عن طريق ضغط الصور المضمّنة."
i18n_source_hash: a8bb0baaca25
i18n_provenance: human
i18n_output_hash: ffa796aa161e
---

# Compress PDF {#compress-pdf}

قلّل حجم ملف PDF عن طريق تقليل دقة الصور المضمّنة. اختر بين شريط تمرير للجودة أو حجم ملف مستهدف.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/compress-pdf`

يقبل بيانات نموذج multipart تحتوي على ملف PDF وحقل `settings` بصيغة JSON.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `"quality"` | وضع الضغط: `quality` أو `targetSize` |
| quality | integer | No | `75` | جودة الضغط، من 1 إلى 100 (الأعلى = ضغط أقل). يُستخدم في وضع `quality` |
| targetSizeKb | number | No | - | حجم الملف المستهدف بالكيلوبايت. يُستخدم في وضع `targetSize` |

## Example Request {#example-request}

الضغط حسب الجودة:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/compress-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"mode": "quality", "quality": 60}'
```

الضغط إلى حجم مستهدف:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/compress-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"mode": "targetSize", "targetSizeKb": 500}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 5200000,
  "processedSize": 1800000
}
```

## Notes {#notes}

- في وضع `quality`، تُنتج القيم الأقل ملفات أصغر مع تدهور أكبر في الصور.
- في وضع `targetSize`، يعثر البحث الثنائي على أعلى قيمة DPI تناسب الحجم المطلوب.
- إذا كان الضغط سيؤدي إلى تكبير الملف، تُعاد وحدات البايت الأصلية دون تغيير.
- لا يتأثر المحتوى النصي والمتّجه؛ تُقلّل دقة الصور النقطية المضمّنة فقط.
