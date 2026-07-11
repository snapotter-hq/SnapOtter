---
description: "Tô màu ảnh đen trắng hoặc ảnh xám tự động bằng mô hình AI DDColor."
i18n_source_hash: 688aa3abbdae
i18n_provenance: human
i18n_output_hash: 41c466c756ee
---

# Tô màu bằng AI {#ai-colorization}

Chuyển ảnh đen trắng hoặc ảnh xám thành ảnh màu đầy đủ bằng AI (mô hình DDColor với phương án dự phòng OpenCV DNN).

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/colorize`

**Xử lý:** Bất đồng bộ (trả về 202, thăm dò `/api/v1/jobs/{jobId}/progress` để lấy trạng thái qua SSE)

**Bộ mô hình:** `object-eraser-colorize` (1-2 GB)

## Tham số {#parameters}

| Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả |
|-----------|------|----------|---------|-------------|
| file | file | Có | - | Tệp ảnh (multipart) |
| intensity | number | Không | `1.0` | Cường độ màu (0-1). Giá trị thấp hơn tạo ra tô màu nhẹ nhàng hơn |
| model | string | Không | `"auto"` | Mô hình sử dụng: `auto`, `ddcolor`, `opencv` |

## Ví dụ yêu cầu {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/colorize \
  -F "file=@old-bw-photo.jpg" \
  -F 'settings={"intensity":0.9,"model":"auto"}'
```

## Phản hồi {#response}

### Phản hồi ban đầu (202 Accepted) {#initial-response-202-accepted}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### Tiến độ (SSE tại `/api/v1/jobs/{jobId}/progress`) {#progress-sse-at-api-v1-jobs-jobid-progress}

```
event: progress
data: {"phase":"processing","stage":"Colorizing...","percent":55}
```

### Kết quả cuối cùng (qua SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/old-bw-photo_colorized.jpg",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 180000,
    "processedSize": 210000,
    "width": 1920,
    "height": 1080,
    "method": "ddcolor"
  }
}
```

## Ghi chú {#notes}

- Yêu cầu cài đặt bộ mô hình `object-eraser-colorize` (1-2 GB).
- DDColor cho kết quả chất lượng cao hơn nhưng chậm hơn; OpenCV DNN nhanh hơn với chất lượng thấp hơn một chút. `auto` dùng DDColor khi có sẵn với phương án dự phòng OpenCV.
- Tham số `intensity` pha trộn giữa ảnh xám gốc và kết quả tô màu bằng AI. Dùng 1.0 để có màu đầy đủ, giá trị thấp hơn để có vẻ ngoài cổ điển hơi khử màu.
- Định dạng đầu ra tự động khớp với định dạng đầu vào.
- Với các định dạng đầu ra không xem trước được trên trình duyệt, một bản xem trước WebP được tạo cùng với đầu ra chính.
- Hỗ trợ định dạng đầu vào HEIC/HEIF, RAW, TGA, PSD, EXR và HDR thông qua giải mã tự động.
