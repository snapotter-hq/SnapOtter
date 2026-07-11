---
description: "Tự động cải thiện một chạm, phân tích ảnh và điều chỉnh phơi sáng, độ tương phản, cân bằng trắng, độ bão hòa và độ sắc nét."
i18n_source_hash: 42b6ab956f91
i18n_provenance: human
i18n_output_hash: aa519e1ea87a
---

# Cải thiện ảnh {#image-enhancement}

Tự động cải thiện một chạm với phân tích thông minh. Phân tích ảnh và áp dụng các điều chỉnh phơi sáng, độ tương phản, cân bằng trắng, độ bão hòa, độ sắc nét và khử nhiễu.

## Điểm cuối API {#api-endpoint}

`POST /api/v1/tools/image/image-enhancement`

**Xử lý:** Đồng bộ (dùng factory `createToolRoute`, trả về kết quả trực tiếp)

**Gói mô hình:** Không cần cho cải thiện cơ bản. Gói `upscale-enhance` (5-6 GB) chỉ được dùng khi `deepEnhance` được bật (để khử nhiễu bằng AI qua SCUNet).

## Tham số {#parameters}

| Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả |
|-----------|------|----------|---------|-------------|
| file | file | Có | - | Tệp ảnh (multipart) |
| mode | string | Không | `"auto"` | Chế độ cải thiện: `auto`, `portrait`, `landscape`, `low-light`, `food`, `document` |
| intensity | number | Không | `50` | Cường độ cải thiện tổng thể (0-100) |
| corrections | object | Không | tất cả `true` | Các điều chỉnh chọn lọc để áp dụng (xem bên dưới) |
| deepEnhance | boolean | Không | `false` | Bật khử nhiễu bằng AI (yêu cầu cài đặt công cụ `noise-removal`) |

### Đối tượng Corrections {#corrections-object}

| Trường | Kiểu | Mặc định | Mô tả |
|-------|------|---------|-------------|
| exposure | boolean | `true` | Tự động điều chỉnh phơi sáng |
| contrast | boolean | `true` | Tự động điều chỉnh độ tương phản |
| whiteBalance | boolean | `true` | Tự động điều chỉnh cân bằng trắng |
| saturation | boolean | `true` | Tự động điều chỉnh độ bão hòa |
| sharpness | boolean | `true` | Tự động làm sắc nét |
| denoise | boolean | `true` | Khử nhiễu nhẹ |

## Ví dụ yêu cầu {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-enhancement \
  -F "file=@photo.jpg" \
  -F 'settings={"mode":"portrait","intensity":70,"corrections":{"exposure":true,"contrast":true,"sharpness":false}}'
```

## Phản hồi (200 OK) {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/{jobId}/photo.jpg",
  "originalSize": 300000,
  "processedSize": 310000
}
```

## Điểm cuối Analyze {#analyze-endpoint}

`POST /api/v1/tools/image/image-enhancement/analyze`

Phân tích một ảnh và trả về các khuyến nghị điều chỉnh mà không áp dụng chúng.

### Tham số {#parameters-1}

| Tham số | Kiểu | Bắt buộc | Mô tả |
|-----------|------|----------|-------------|
| file | file | Có | Tệp ảnh (multipart) |

### Ví dụ yêu cầu {#example-request-1}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-enhancement/analyze \
  -F "file=@photo.jpg"
```

### Phản hồi (200 OK) {#response-200-ok-1}

```json
{
  "corrections": {
    "exposure": { "value": 0.3, "direction": "brighten" },
    "contrast": { "value": 0.2, "direction": "increase" },
    "whiteBalance": { "value": 200, "direction": "warmer" },
    "saturation": { "value": 0.1, "direction": "increase" },
    "sharpness": { "value": 0.4, "direction": "sharpen" }
  }
}
```

## Ghi chú {#notes}

- Công cụ này dùng factory đồng bộ `createToolRoute`, nên nó trả về một phản hồi tiêu chuẩn (không phải 202 bất đồng bộ).
- Tham số `mode` điều chỉnh cách các điều chỉnh được cân trọng (ví dụ, chế độ chân dung nhẹ nhàng hơn với tông da, chế độ phong cảnh tăng cường độ bão hòa).
- Khi `deepEnhance` được bật và công cụ `noise-removal` (SCUNet) đã được cài đặt, một lượt khử nhiễu bằng AI bổ sung được áp dụng sau các điều chỉnh tiêu chuẩn.
- Điểm cuối analyze hữu ích để xem trước những điều chỉnh sẽ được áp dụng trước khi thực hiện.
- Hỗ trợ các định dạng đầu vào HEIC/HEIF, RAW, TGA, PSD, EXR và HDR qua giải mã tự động.
