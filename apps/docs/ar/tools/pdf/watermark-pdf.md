---
description: "إضافة علامة مائية نصية إلى كل صفحة في ملف PDF."
i18n_source_hash: f1f7d8912fbd
i18n_provenance: human
i18n_output_hash: b5110c878e2d
---

# Watermark PDF {#watermark-pdf}

اختم علامة مائية نصية على كل صفحة في ملف PDF مع إمكانية تهيئة الموضع والحجم والشفافية والتدوير.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/watermark-pdf`

يقبل بيانات نموذج multipart تحتوي على ملف PDF وحقل `settings` بصيغة JSON.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| text | string | Yes | - | نص العلامة المائية (من 1 إلى 200 حرف) |
| position | string | No | `"c"` | الموضع على الصفحة: `tl` أو `tc` أو `tr` أو `l` أو `c` أو `r` أو `bl` أو `bc` أو `br` |
| fontSize | integer | No | `48` | حجم الخط بالنقاط (من 6 إلى 72) |
| opacity | number | No | `0.3` | شفافية العلامة المائية (من 0.05 إلى 1) |
| rotation | number | No | `45` | زاوية التدوير بالدرجات (من -180 إلى 180) |

### Position Values {#position-values}

- `tl` أعلى اليسار، `tc` أعلى الوسط، `tr` أعلى اليمين
- `l` وسط اليسار، `c` الوسط، `r` وسط اليمين
- `bl` أسفل اليسار، `bc` أسفل الوسط، `br` أسفل اليمين

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/watermark-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"text": "CONFIDENTIAL", "position": "c", "opacity": 0.2, "rotation": 45}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2500000
}
```

## Notes {#notes}

- تُعرض العلامة المائية كطبقة نصية فوق كل صفحة.
- يُطبَّق نص العلامة المائية نفسه وموضعها ونمطها بشكل موحّد على جميع الصفحات.
- استخدم قيم شفافية أقل (من 0.1 إلى 0.3) للعلامات المائية الخفيفة التي لا تحجب المحتوى.
