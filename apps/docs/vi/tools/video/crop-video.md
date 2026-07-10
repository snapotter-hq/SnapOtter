---
description: "Cắt một vùng ra khỏi video."
i18n_source_hash: fab11f71a202
i18n_provenance: human
i18n_output_hash: 525678d36172
---

# Crop Video {#crop-video}

Cắt một vùng hình chữ nhật ra khỏi video bằng cách chỉ định kích thước và vị trí của vùng đó.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/crop-video`

Nhận multipart form data gồm một file video và một trường JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| width | integer | Yes | - | Chiều rộng vùng cắt tính bằng pixel (tối thiểu 16) |
| height | integer | Yes | - | Chiều cao vùng cắt tính bằng pixel (tối thiểu 16) |
| x | integer | No | `0` | Độ lệch ngang từ góc trên bên trái |
| y | integer | No | `0` | Độ lệch dọc từ góc trên bên trái |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/crop-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"width": 640, "height": 480, "x": 100, "y": 50}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 5200000
}
```

## Notes {#notes}

- Vùng cắt phải nằm gọn trong kích thước video. Nếu `x + width` hoặc `y + height` vượt quá kích thước nguồn, yêu cầu trả về lỗi 400.
- Kích thước cắt tối thiểu là 16x16 pixel.
- Kích thước được làm tròn thành số chẵn theo yêu cầu của hầu hết các codec video.
