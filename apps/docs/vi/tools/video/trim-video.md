---
description: "Cắt một clip ra khỏi video bằng cách chỉ định thời điểm bắt đầu và kết thúc."
i18n_source_hash: c84481641979
i18n_provenance: human
i18n_output_hash: 4fcd2ffb3ccc
---

# Trim Video {#trim-video}

Cắt một clip ra khỏi video bằng cách chỉ định thời điểm bắt đầu và kết thúc tính bằng giây, với tùy chọn cắt chính xác theo khung hình.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/trim-video`

Nhận multipart form data gồm một file video và một trường JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| startS | number | No | `0` | Thời điểm bắt đầu tính bằng giây (phải >= 0) |
| endS | number | Yes | - | Thời điểm kết thúc tính bằng giây (phải sau startS) |
| precise | boolean | No | `false` | Mã hóa lại để cắt chính xác theo khung hình thay vì tua theo keyframe |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/trim-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"startS": 5, "endS": 30, "precise": true}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 4200000
}
```

## Notes {#notes}

- Khi `precise` là `false` (mặc định), công cụ dùng cách tua theo keyframe, vốn nhanh nhưng có thể bắt đầu sớm hơn thời điểm yêu cầu vài khung hình.
- Đặt `precise` thành `true` sẽ mã hóa lại đoạn để có ranh giới khung hình chính xác, nhưng mất nhiều thời gian hơn.
- Giá trị `endS` phải lớn hơn `startS`.
