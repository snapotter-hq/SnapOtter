---
description: "Thay đổi tốc độ khung hình của video."
i18n_source_hash: 2bffbd04a1cb
i18n_provenance: human
i18n_output_hash: bdc2fade7408
---

# Change FPS {#change-fps}

Thay đổi tốc độ khung hình của video sang một giá trị mục tiêu từ 1 đến 120 fps.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/change-fps`

Nhận multipart form data gồm một file video và một trường JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fps | number | No | `30` | Tốc độ khung hình mục tiêu (1-120) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/change-fps \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"fps": 24}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 10200000
}
```

## Notes {#notes}

- Giảm tốc độ khung hình sẽ loại bỏ các khung hình và giảm kích thước file. Tăng nó sẽ nhân đôi các khung hình để lấp đầy khoảng trống nhưng không thêm chi tiết chuyển động thực.
- Các giá trị mục tiêu phổ biến: 24 (điện ảnh), 30 (web/phát sóng), 60 (phát mượt).
- Track âm thanh được giữ nguyên ở tốc độ lấy mẫu gốc.
