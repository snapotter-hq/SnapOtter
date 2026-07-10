---
description: "Biến một clip video thành ảnh GIF động."
i18n_source_hash: f729dde8cd55
i18n_provenance: human
i18n_output_hash: 46fc0cd846d6
---

# Video to GIF {#video-to-gif}

Biến một clip video thành ảnh GIF động với tốc độ khung hình, chiều rộng, thời điểm bắt đầu và thời lượng có thể cấu hình.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-to-gif`

Nhận multipart form data gồm một file video và một trường JSON `settings`. Đây là endpoint bất đồng bộ - nó trả về `202 Accepted` ngay lập tức và tiến độ được truyền qua SSE tại `GET /api/v1/jobs/{jobId}/progress`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fps | integer | No | `12` | Tốc độ khung hình đầu ra (1-30) |
| width | integer | No | `480` | Chiều rộng đầu ra tính bằng pixel (64-1280). Chiều cao đổi tỷ lệ theo tương ứng |
| startS | number | No | `0` | Thời điểm bắt đầu tính bằng giây (phải >= 0) |
| durationS | number | No | `5` | Thời lượng tính bằng giây (trên 0, tối đa 60) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-gif \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"fps": 15, "width": 320, "startS": 2, "durationS": 8}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Giá trị `fps` và `width` thấp hơn tạo ra file GIF nhỏ hơn. Một GIF rộng 480px ở 12 fps thường là sự cân bằng tốt.
- Thời lượng tối đa là 60 giây. Các clip dài hơn tạo ra file rất lớn.
- Cập nhật tiến độ có sẵn qua SSE tại `GET /api/v1/jobs/{jobId}/progress` cho đến khi tác vụ hoàn tất.
