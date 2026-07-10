---
description: "طبع علامة مائية نصية على إطارات الفيديو."
i18n_source_hash: 937bb075b894
i18n_provenance: human
i18n_output_hash: ebf40444fe58
---

# Watermark Video {#watermark-video}

طبع علامة مائية نصية على كل إطار من إطارات الفيديو مع موضع وحجم وشفافية ولون قابلة للتهيئة.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/watermark-video`

يقبل بيانات نموذج متعدد الأجزاء تحتوي على ملف فيديو وحقل JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| text | string | Yes | - | نص العلامة المائية (1-200 حرف) |
| position | string | No | `"br"` | الموضع على الإطار: `tl` أو `tc` أو `tr` أو `l` أو `c` أو `r` أو `bl` أو `bc` أو `br` |
| fontSize | integer | No | `36` | حجم الخط بالبكسل (8-120) |
| opacity | number | No | `0.5` | شفافية العلامة المائية (0.05-1) |
| color | string | No | `"#ffffff"` | لون سداسي عشري للنص (مثل `"#ffffff"`) |

### Position Values {#position-values}

- **tl** - أعلى اليسار، **tc** - أعلى الوسط، **tr** - أعلى اليمين
- **l** - منتصف اليسار، **c** - الوسط، **r** - منتصف اليمين
- **bl** - أسفل اليسار، **bc** - أسفل الوسط، **br** - أسفل اليمين

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/watermark-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"text": "PREVIEW", "position": "c", "fontSize": 48, "opacity": 0.3}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12400000
}
```

## Notes {#notes}

- تُطبَع العلامة المائية بشكل دائم في إطارات الفيديو ولا يمكن إزالتها بعد المعالجة.
- تستخدم العلامة المائية خطاً بلا زوائد مدمجاً في FFmpeg.
- للعلامات المائية بالصور، استخدم أداة Watermark للصور بدلاً من ذلك.
