---
description: "تدوير الفيديو أو قلبه."
i18n_source_hash: cf9620ca62c7
i18n_provenance: human
i18n_output_hash: 11992779aecb
---

# Rotate Video {#rotate-video}

تدوير الفيديو بمقدار 90 أو 180 أو 270 درجة، أو قلبه أفقياً أو رأسياً.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/rotate-video`

يقبل بيانات نموذج متعدد الأجزاء تحتوي على ملف فيديو وحقل JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| transform | string | Yes | - | التحويل المطلوب تطبيقه: `cw90` أو `ccw90` أو `180` أو `hflip` أو `vflip` |

### Transform Values {#transform-values}

- **cw90** - التدوير 90 درجة باتجاه عقارب الساعة
- **ccw90** - التدوير 90 درجة عكس عقارب الساعة
- **180** - التدوير 180 درجة
- **hflip** - القلب أفقياً (انعكاس مرآوي)
- **vflip** - القلب رأسياً

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/rotate-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"transform": "cw90"}'
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

- يؤدي التدوير بمقدار 90 أو 270 درجة إلى تبديل عرض الفيديو وارتفاعه.
- لا تغير عمليات القلب (hflip وvflip) أبعاد الفيديو.
