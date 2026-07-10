---
description: "Phóng to ảnh từ 2x đến 4x bằng siêu phân giải AI Real-ESRGAN trong khi vẫn giữ chi tiết mịn."
i18n_source_hash: 150032e99476
i18n_provenance: human
i18n_output_hash: 1b1fbe852fb9
---

# Phóng to ảnh {#image-upscaling}

Tăng cường siêu phân giải bằng AI sử dụng Real-ESRGAN. Phóng to ảnh 2x-4x trong khi vẫn giữ chi tiết.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/upscale`

**Xử lý:** Bất đồng bộ (trả về 202, poll `/api/v1/jobs/{jobId}/progress` để lấy trạng thái qua SSE)

**Gói mô hình:** `upscale-enhance` (5-6 GB)

## Tham số {#parameters}

| Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả |
|-----------|------|----------|---------|-------------|
| file | file | Có | - | Tệp ảnh (multipart) |
| scale | number | Không | `2` | Hệ số phóng to (ví dụ 2, 3, 4) |
| model | string | Không | `"auto"` | Mô hình để sử dụng (ví dụ `auto`, tên mô hình cụ thể) |
| faceEnhance | boolean | Không | `false` | Áp dụng tăng cường khuôn mặt trong khi phóng to |
| denoise | number | Không | `0` | Cường độ giảm nhiễu (0 = tắt) |
| format | string | Không | `"auto"` | Định dạng đầu ra: `auto`, `png`, `jpg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| quality | number | Không | `95` | Chất lượng đầu ra (1-100) |

## Ví dụ Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/upscale \
  -F "file=@photo.jpg" \
  -F 'settings={"scale":4,"model":"auto","faceEnhance":true,"format":"png"}'
```

## Response {#response}

### Response ban đầu (202 Accepted) {#initial-response-202-accepted}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### Tiến trình (SSE tại `/api/v1/jobs/{jobId}/progress`) {#progress-sse-at-api-v1-jobs-jobid-progress}

```
event: progress
data: {"phase":"processing","stage":"Upscaling...","percent":60}
```

### Kết quả cuối cùng (qua SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/photo_4x.png",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 120000,
    "processedSize": 2400000,
    "width": 4096,
    "height": 4096,
    "method": "realesrgan-x4plus"
  }
}
```

## Ghi chú {#notes}

- Yêu cầu gói mô hình `upscale-enhance` được cài đặt (5-6 GB).
- Sử dụng Real-ESRGAN khi khả dụng; chuyển về nội suy Lanczos nếu mô hình AI không khả dụng.
- Tùy chọn `faceEnhance` áp dụng phục hồi khuôn mặt GFPGAN trong khi phóng to để chất lượng khuôn mặt tốt hơn.
- Đối với các định dạng đầu ra không thể xem trước trên trình duyệt (HEIC, JXL, TIFF), một bản xem trước WebP được tạo cùng với đầu ra chính.
- Hỗ trợ các định dạng đầu vào HEIC/HEIF, RAW, TGA, PSD, EXR, và HDR qua giải mã tự động.
