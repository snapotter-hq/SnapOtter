---
description: "Phục hồi và làm sắc nét các khuôn mặt mờ hoặc chất lượng thấp trong ảnh bằng các mô hình AI GFPGAN và CodeFormer."
i18n_source_hash: 7f9f6af8ebda
i18n_provenance: human
i18n_output_hash: 417de1cca109
---

# Tăng cường khuôn mặt {#face-enhancement}

Phục hồi và tăng cường khuôn mặt trong ảnh bằng các mô hình AI (GFPGAN/CodeFormer).

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/enhance-faces`

**Xử lý:** Bất đồng bộ (trả về 202, thăm dò `/api/v1/jobs/{jobId}/progress` để lấy trạng thái qua SSE)

**Bộ mô hình:** `upscale-enhance` (5-6 GB) và `face-detection` (200-300 MB)

## Tham số {#parameters}

| Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả |
|-----------|------|----------|---------|-------------|
| file | file | Có | - | Tệp ảnh (multipart) |
| model | string | Không | `"auto"` | Mô hình sử dụng: `auto`, `gfpgan`, `codeformer` |
| strength | number | Không | `0.8` | Cường độ tăng cường (0-1). Giá trị cao hơn tạo tăng cường mạnh hơn |
| onlyCenterFace | boolean | Không | `false` | Chỉ tăng cường khuôn mặt trung tâm/nổi bật nhất |
| sensitivity | number | Không | `0.5` | Độ nhạy phát hiện khuôn mặt (0-1) |

## Ví dụ yêu cầu {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/enhance-faces \
  -F "file=@portrait.jpg" \
  -F 'settings={"model":"codeformer","strength":0.7,"onlyCenterFace":false}'
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
data: {"phase":"processing","stage":"Enhancing faces...","percent":60}
```

### Kết quả cuối cùng (qua SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/portrait_enhanced.png",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 350000,
    "processedSize": 600000,
    "facesDetected": 2,
    "faces": [
      {"x": 120, "y": 80, "w": 100, "h": 100},
      {"x": 350, "y": 90, "w": 95, "h": 95}
    ],
    "model": "codeformer"
  }
}
```

## Ghi chú {#notes}

- Yêu cầu cả bộ mô hình `upscale-enhance` (5-6 GB) và bộ mô hình `face-detection` (200-300 MB).
- GFPGAN tạo tăng cường quyết liệt hơn; CodeFormer giữ danh tính tốt hơn. `auto` chọn mô hình tốt nhất cho đầu vào.
- Đầu ra luôn ở định dạng PNG để có chất lượng tối đa.
- Một bản xem trước WebP được tạo cùng với đầu ra độ phân giải đầy đủ để hiển thị nhanh hơn ở giao diện.
- Tham số `strength` pha trộn khuôn mặt đã tăng cường với ảnh gốc. Dùng giá trị thấp hơn (0.3-0.5) để cải thiện nhẹ nhàng, giá trị cao hơn (0.7-1.0) để phục hồi mạnh hơn.
- Hỗ trợ định dạng đầu vào HEIC/HEIF, RAW, TGA, PSD, EXR và HDR thông qua giải mã tự động.
