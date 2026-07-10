---
description: "Điều chỉnh độ sáng, độ tương phản, độ bão hòa và gamma của video."
i18n_source_hash: 40483b79d44b
i18n_provenance: human
i18n_output_hash: 65c3dcdcaba5
---

# Video Color {#video-color}

Điều chỉnh độ sáng, độ tương phản, độ bão hòa và hiệu chỉnh gamma trên video.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-color`

Nhận multipart form data gồm một file video và một trường JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| brightness | number | No | `0` | Điều chỉnh độ sáng (-1 đến 1) |
| contrast | number | No | `1` | Hệ số nhân độ tương phản (0-4) |
| saturation | number | No | `1` | Hệ số nhân độ bão hòa (0-3). Đặt về 0 để có ảnh xám |
| gamma | number | No | `1` | Hiệu chỉnh gamma (0.1-10) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-color \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"brightness": 0.1, "contrast": 1.2, "saturation": 1.5}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12300000
}
```

## Notes {#notes}

- Tất cả các giá trị ở mặc định (brightness 0, contrast 1, saturation 1, gamma 1) không tạo ra thay đổi nào.
- Đặt saturation về `0` sẽ chuyển video thành ảnh xám.
- Giá trị gamma dưới 1 làm sáng vùng tối, trong khi giá trị trên 1 làm tối chúng.
