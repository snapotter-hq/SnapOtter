---
description: "Áp dụng hiệu ứng pixel hóa cho toàn bộ ảnh hoặc một vùng cụ thể."
i18n_source_hash: a3ad29841f7b
i18n_provenance: human
i18n_output_hash: bafa897197cd
---

# Pixelate {#pixelate}

Áp dụng hiệu ứng pixel hóa cho toàn bộ ảnh hoặc một vùng hình chữ nhật cụ thể. Hữu ích để che nội dung nhạy cảm như khuôn mặt, biển số xe hoặc thông tin cá nhân.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/pixelate`

Chấp nhận multipart form data với một tệp ảnh và một trường JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| blockSize | integer | No | `12` | Kích thước khối pixel (2-128); giá trị càng lớn tạo pixel hóa càng thô |
| region | object | No | - | Giới hạn pixel hóa trong một hình chữ nhật (xem bên dưới) |

### Region Object {#region-object}

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| left | integer | Yes | Độ lệch trái tính bằng pixel (>= 0) |
| top | integer | Yes | Độ lệch trên tính bằng pixel (>= 0) |
| width | integer | Yes | Chiều rộng vùng tính bằng pixel (>= 1) |
| height | integer | Yes | Chiều cao vùng tính bằng pixel (>= 1) |

## Example Request {#example-request}

Pixel hóa toàn bộ ảnh:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/pixelate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"blockSize": 20}'
```

Pixel hóa một vùng cụ thể:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/pixelate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"blockSize": 16, "region": {"left": 100, "top": 50, "width": 200, "height": 150}}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2380000
}
```

## Notes {#notes}

- Khi bỏ qua `region`, toàn bộ ảnh sẽ được pixel hóa.
- Tọa độ vùng tính bằng pixel tương đối với góc trên bên trái của ảnh. Vùng phải nằm trong ranh giới ảnh.
- Định dạng đầu ra khớp với định dạng đầu vào. Các đầu vào HEIC, RAW, PSD và SVG được tự động giải mã trước khi xử lý.
