---
description: "Tạo hình ảnh trực quan hóa dạng sóng dưới dạng ảnh PNG từ một tệp âm thanh."
i18n_source_hash: 5480106dfe48
i18n_provenance: human
i18n_output_hash: 0ee8f9af1835
---

# Waveform Image {#waveform-image}

Tạo hình ảnh trực quan hóa dạng sóng dưới dạng ảnh PNG từ một tệp âm thanh, với kích thước và màu sắc có thể cấu hình.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/waveform-image`

Nhận dữ liệu multipart form với một tệp âm thanh và một trường JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| width | integer | No | `1024` | Chiều rộng ảnh tính bằng pixel (256 đến 3840) |
| height | integer | No | `256` | Chiều cao ảnh tính bằng pixel (64 đến 1080) |
| color | string | No | `"#4f46e5"` | Màu hex của dạng sóng (ví dụ `"#4f46e5"`) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/waveform-image \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"width": 1920, "height": 400, "color": "#e07832"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.png",
  "originalSize": 4500000,
  "processedSize": 45000
}
```

## Notes {#notes}

- Đầu ra luôn là một ảnh PNG, bất kể định dạng âm thanh đầu vào.
- Dạng sóng được vẽ trên nền trong suốt.
- Hữu ích cho ảnh thu nhỏ, xem trước trên mạng xã hội, hoặc nhúng vào trang web.
