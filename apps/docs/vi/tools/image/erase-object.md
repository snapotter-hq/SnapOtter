---
description: "Xóa các đối tượng không mong muốn khỏi ảnh bằng AI inpainting (LaMa), được dẫn hướng bởi một mặt nạ của vùng cần xóa."
i18n_source_hash: 8e2e42a5e4f9
i18n_provenance: human
i18n_output_hash: e6923f4fe16b
---

# Xóa đối tượng {#object-eraser}

Xóa các đối tượng không mong muốn khỏi ảnh bằng AI inpainting (mô hình LaMa). Nhận một ảnh và một mặt nạ chỉ định vùng cần xóa.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/erase-object`

**Xử lý:** Bất đồng bộ (trả về 202, thăm dò `/api/v1/jobs/{jobId}/progress` để lấy trạng thái qua SSE)

**Bộ mô hình:** `object-eraser-colorize` (1-2 GB)

## Tham số {#parameters}

| Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả |
|-----------|------|----------|---------|-------------|
| file | file | Có | - | Tệp ảnh nguồn (multipart) |
| mask | file | Có | - | Ảnh mặt nạ (trắng = vùng cần xóa, đen = giữ lại). Phải được tải lên với fieldname `mask` |
| format | string | Không | `"auto"` | Định dạng đầu ra: `auto`, `png`, `jpg`, `jpeg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| quality | integer | Không | `95` | Chất lượng đầu ra (1-100) |

## Ví dụ yêu cầu {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/erase-object \
  -F "file=@photo.jpg" \
  -F "mask=@mask.png" \
  -F "format=png" \
  -F "quality=95"
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
data: {"phase":"processing","stage":"Inpainting...","percent":70}
```

### Kết quả cuối cùng (qua SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/photo_erased.png",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 245000,
    "processedSize": 230000
  }
}
```

## Ghi chú {#notes}

- Yêu cầu cài đặt bộ mô hình `object-eraser-colorize` (1-2 GB).
- Mặt nạ phải có cùng kích thước với ảnh nguồn. Các pixel trắng chỉ định vùng cần xóa; AI sẽ lấp đầy chúng bằng nội dung hợp lý.
- Sử dụng LaMa (Large Mask Inpainting) để xóa đối tượng chất lượng cao.
- Với các định dạng đầu ra không xem trước được trên trình duyệt, một bản xem trước WebP được tạo cùng với đầu ra chính.
- Hỗ trợ định dạng đầu vào HEIC/HEIF, RAW, TGA, PSD, EXR và HDR thông qua giải mã tự động.
