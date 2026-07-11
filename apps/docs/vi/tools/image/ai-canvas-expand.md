---
description: "Mở rộng canvas của hình ảnh bằng outpainting AI, kéo dài nó theo mọi hướng và lấp đầy các vùng mới cho khớp với ảnh gốc."
i18n_source_hash: 1b00db4ed40d
i18n_provenance: human
i18n_output_hash: fc25947c5ccc
---

# AI Canvas Expand {#ai-canvas-expand}

Mở rộng canvas của một hình ảnh bằng cách lấp đầy dựa trên AI (outpainting). Kéo dài hình ảnh theo mọi hướng và lấp đầy các vùng mới bằng nội dung do AI tạo ra khớp với hình ảnh hiện có.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/ai-canvas-expand`

**Xử lý:** Bất đồng bộ (trả về 202, hỏi vòng `/api/v1/jobs/{jobId}/progress` để lấy trạng thái qua SSE)

**Gói mô hình:** `object-eraser-colorize` (1-2 GB)

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | Tệp hình ảnh (multipart) |
| extendTop | integer | No | `0` | Số pixel kéo dài ở phía trên |
| extendRight | integer | No | `0` | Số pixel kéo dài ở bên phải |
| extendBottom | integer | No | `0` | Số pixel kéo dài ở phía dưới |
| extendLeft | integer | No | `0` | Số pixel kéo dài ở bên trái |
| tier | string | No | `"balanced"` | Cấp chất lượng: `fast`, `balanced`, `high` |
| format | string | No | `"auto"` | Định dạng đầu ra: `auto`, `png`, `jpg`, `jpeg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| quality | integer | No | `95` | Chất lượng đầu ra (1-100) |

Ít nhất một hướng kéo dài phải lớn hơn 0.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/ai-canvas-expand \
  -F "file=@photo.jpg" \
  -F 'settings={"extendTop":200,"extendBottom":200,"extendLeft":100,"extendRight":100,"tier":"balanced"}'
```

## Response {#response}

### Initial Response (202 Accepted) {#initial-response-202-accepted}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### Progress (SSE at `/api/v1/jobs/{jobId}/progress`) {#progress-sse-at-api-v1-jobs-jobid-progress}

```
event: progress
data: {"phase":"processing","stage":"Expanding canvas...","percent":50}
```

### Final Result (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/photo_extended.png",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 300000,
    "processedSize": 520000
  }
}
```

## Notes {#notes}

- Yêu cầu cài đặt gói mô hình `object-eraser-colorize` (1-2 GB).
- Sử dụng outpainting dựa trên LaMa để tạo nội dung cho các vùng đã mở rộng.
- Tham số `tier` đánh đổi tốc độ lấy chất lượng: `fast` tạo kết quả nhanh nhưng có thể có nhiễu, `high` mất nhiều thời gian hơn nhưng tạo ra phần lấp đầy mượt mà, mạch lạc hơn.
- Giá trị kéo dài tính bằng pixel. Kích thước hình ảnh cuối cùng sẽ là: chiều rộng gốc + extendLeft + extendRight nhân chiều cao gốc + extendTop + extendBottom.
- Với các định dạng đầu ra không thể xem trước trên trình duyệt (HEIC, JXL, TIFF), một bản xem trước WebP được tạo cùng với đầu ra chính.
- Hỗ trợ các định dạng đầu vào HEIC/HEIF, RAW, TGA, PSD, EXR và HDR thông qua giải mã tự động.
