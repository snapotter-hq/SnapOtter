---
description: "Biến một tập ảnh thành video trình chiếu."
i18n_source_hash: 2c6f183feb6d
i18n_provenance: human
i18n_output_hash: 6594de4c660e
---

# Images to Video {#images-to-video}

Biến một tập ảnh thành video trình chiếu với thời lượng mỗi ảnh, độ phân giải và tốc độ khung hình có thể cấu hình.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/images-to-video`

Nhận multipart form data gồm hai hoặc nhiều file ảnh và một trường JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| secondsPerImage | number | No | `2` | Thời lượng hiển thị mỗi ảnh tính bằng giây (0.5-10) |
| resolution | string | No | `"720p"` | Độ phân giải đầu ra: `1080p`, `720p`, `square` |
| fps | integer | No | `30` | Tốc độ khung hình đầu ra (10-60) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/images-to-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@slide1.jpg" \
  -F "file=@slide2.jpg" \
  -F "file=@slide3.jpg" \
  -F "file=@slide4.jpg" \
  -F 'settings={"secondsPerImage": 3, "resolution": "1080p"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/slideshow.mp4",
  "originalSize": 3500000,
  "processedSize": 1200000
}
```

## Notes {#notes}

- Chấp nhận 2-60 file ảnh mỗi yêu cầu. Các ảnh xuất hiện trong video theo thứ tự tải lên.
- Ảnh được đổi kích thước và thêm viền đệm để vừa với độ phân giải mục tiêu trong khi giữ nguyên tỷ lệ khung hình.
- Tùy chọn độ phân giải `square` tạo ra video 1080x1080, hữu ích cho mạng xã hội.
- Định dạng đầu ra luôn là MP4 (H.264).
