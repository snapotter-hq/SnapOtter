---
description: "Đổi tỷ lệ video sang độ phân giải mới hoặc kích thước preset."
i18n_source_hash: bb1f67871fea
i18n_provenance: human
i18n_output_hash: d47762829e04
---

# Resize Video {#resize-video}

Đổi tỷ lệ video sang độ phân giải mới bằng cách dùng kích thước pixel tùy chỉnh hoặc một preset chuẩn.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/resize-video`

Nhận multipart form data gồm một file video và một trường JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| width | integer | No | - | Chiều rộng mục tiêu tính bằng pixel (16-7680) |
| height | integer | No | - | Chiều cao mục tiêu tính bằng pixel (16-4320) |
| preset | string | No | `"custom"` | Preset độ phân giải: `custom`, `2160p`, `1440p`, `1080p`, `720p`, `480p`, `360p` |

Khi `preset` là `"custom"`, phải cung cấp ít nhất một trong `width` hoặc `height`. Kích thước còn lại đổi tỷ lệ theo tương ứng.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/resize-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"preset": "720p"}'
```

Đổi kích thước sang kích thước tùy chỉnh:

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/resize-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"width": 1280, "height": 720}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 25000000,
  "processedSize": 8500000
}
```

## Notes {#notes}

- Các giá trị preset ánh xạ tới các chiều cao chuẩn (ví dụ `720p` = 1280x720, `1080p` = 1920x1080). Chiều rộng đổi tỷ lệ theo tỷ lệ khung hình của nguồn.
- Kích thước được làm tròn thành số chẵn theo yêu cầu của hầu hết các codec video.
- Độ phân giải tối đa được hỗ trợ là 7680x4320 (8K UHD).
