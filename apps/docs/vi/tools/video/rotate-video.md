---
description: "Xoay hoặc lật một video."
i18n_source_hash: cf9620ca62c7
i18n_provenance: human
i18n_output_hash: e972d6730756
---

# Rotate Video {#rotate-video}

Xoay video 90, 180 hoặc 270 độ, hoặc lật nó theo chiều ngang hoặc chiều dọc.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/rotate-video`

Nhận multipart form data gồm một file video và một trường JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| transform | string | Yes | - | Phép biến đổi cần áp dụng: `cw90`, `ccw90`, `180`, `hflip`, `vflip` |

### Transform Values {#transform-values}

- **cw90** - Xoay 90 độ theo chiều kim đồng hồ
- **ccw90** - Xoay 90 độ ngược chiều kim đồng hồ
- **180** - Xoay 180 độ
- **hflip** - Lật ngang (soi gương)
- **vflip** - Lật dọc

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

- Xoay 90 hoặc 270 độ sẽ hoán đổi chiều rộng và chiều cao của video.
- Các thao tác lật (hflip, vflip) không thay đổi kích thước video.
