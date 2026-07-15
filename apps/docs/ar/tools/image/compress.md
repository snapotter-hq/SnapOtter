---
description: "تقليل حجم ملف الصورة حسب مستوى الجودة أو إلى حجم ملف مستهدف."
i18n_source_hash: 342c5cf1f864
i18n_provenance: human
i18n_output_hash: afd5e716e0ea
---

# ضغط الصورة {#compress}

قلّل حجم ملف الصورة بتحديد مستوى جودة أو حجم ملف مستهدف بالكيلوبايت. تستخدم الأداة بحثًا ثنائيًا تكراريًا للوصول إلى أحجام الأهداف بدقة.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/compress`

يقبل بيانات نموذج multipart تحتوي على ملف صورة وحقل JSON باسم `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `"quality"` | وضع الضغط: `quality` أو `targetSize` |
| quality | number | No | `80` | مستوى الجودة (1-100). يُستخدَم عندما يكون الوضع `quality`. |
| targetSizeKb | number | No | - | حجم الملف المستهدف بالكيلوبايت. يُستخدَم عندما يكون الوضع `targetSize`. |

## Example Request {#example-request}

الضغط إلى جودة 60:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compress \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"mode": "quality", "quality": 60}'
```

الضغط إلى حجم مستهدف قدره 200 كيلوبايت:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compress \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"mode": "targetSize", "targetSizeKb": 200}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 204800
}
```

## Notes {#notes}

- في وضع `quality`، تنتج القيم الأقل ملفات أصغر بمزيد من عيوب الضغط. القيمة 80 افتراضية جيدة للاستخدام على الويب.
- في وضع `targetSize`، ينفّذ المحرّك ضغطًا تكراريًا للاقتراب من الهدف قدر الإمكان دون تجاوزه.
- صيغة الإخراج تطابق صيغة الإدخال. يُطبَّق الضغط على الترميز الأصلي للصيغة (مثل جودة JPEG لملفات JPEG، وجودة WebP لملفات WebP).
- إذا كانت الجودة الافتراضية (80) مقبولة، يمكنك حذف المُعامِل `quality` بالكامل.
