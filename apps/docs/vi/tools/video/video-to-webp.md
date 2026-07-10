---
description: "Chuyển đổi một clip video thành ảnh WebP động."
i18n_source_hash: 7b1a22459bd1
i18n_provenance: human
i18n_output_hash: 39aa5bc2b67b
---

# Video to WebP {#video-to-webp}

Chuyển đổi một clip video thành ảnh WebP động với tốc độ khung hình, chiều rộng và chất lượng có thể cấu hình.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-to-webp`

Nhận multipart form data gồm một file video và một trường JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fps | integer | No | `12` | Tốc độ khung hình đầu ra (1-30) |
| width | integer | No | `480` | Chiều rộng đầu ra tính bằng pixel (16-1920). Chiều cao đổi tỷ lệ theo tương ứng |
| quality | integer | No | `75` | Chất lượng nén WebP (1-100) |
| loop | boolean | No | `true` | Lặp lại hoạt ảnh |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-webp \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"fps": 15, "width": 640, "quality": 80}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.webp",
  "originalSize": 12500000,
  "processedSize": 2800000
}
```

## Notes {#notes}

- WebP động tạo ra file nhỏ hơn GIF với khả năng hỗ trợ màu tốt hơn (bảng màu 24-bit so với 8-bit).
- Giá trị `quality` thấp hơn tạo ra file nhỏ hơn với cái giá là độ trung thực hình ảnh.
- Đặt `loop` thành `false` cho các hoạt ảnh chỉ phát một lần rồi dừng.
