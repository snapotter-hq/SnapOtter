---
description: "Chuyển đổi một clip video thành ảnh AVIF động."
i18n_source_hash: 824c23e5d184
i18n_provenance: machine
i18n_output_hash: 50b520e85ba2
i18n_hash_version: 2
---

# Video to AVIF {#video-to-avif}

Chuyển đổi một clip video thành ảnh AVIF động với tốc độ khung hình, chiều rộng, chất lượng và đoạn clip có thể cấu hình.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-to-avif`

Nhận multipart form data gồm một file video và một trường JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fps | integer | No | `12` | Tốc độ khung hình đầu ra (1-30) |
| width | integer | No | `480` | Chiều rộng đầu ra tính bằng pixel (64-1280). Chiều cao đổi tỷ lệ theo tương ứng |
| startS | number | No | `0` | Điểm bắt đầu của clip, tính bằng giây |
| durationS | number | No | `5` | Độ dài clip tính bằng giây (tối đa 60) |
| quality | integer | No | `50` | Chất lượng AVIF (1-100) |
| loop | boolean | No | `true` | Lặp lại hoạt ảnh |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-avif \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"fps": 15, "width": 640, "durationS": 4}'
```

## Example Response {#example-response}

Mã hóa AV1 chậm hơn GIF hoặc WebP, nên công cụ này thường trả về `202` kèm một job để theo dõi qua SSE tại `/api/v1/jobs/{jobId}/progress`. Một clip ngắn có thể hoàn tất trong khoảng chờ đồng bộ và trả kết quả trực tiếp:

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.avif",
  "originalSize": 12500000,
  "processedSize": 900000
}
```

## Notes {#notes}

- AVIF động miễn phí bản quyền và thường nhỏ hơn WebP hoặc GIF động ở cùng chất lượng hình ảnh.
- Các trình duyệt hiện tại phát được AVIF động. Một số trình xem ảnh trên máy tính chỉ hiển thị khung hình đầu tiên.
- Rãnh âm thanh bị loại bỏ.
