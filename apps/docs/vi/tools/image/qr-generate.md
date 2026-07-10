---
description: "Tạo mã QR với màu tùy chỉnh và các mức sửa lỗi."
i18n_source_hash: 096ef4d90da5
i18n_provenance: human
i18n_output_hash: 297a4b35b999
---

# QR Code Generator {#qr-code-generator}

Tạo ảnh mã QR từ văn bản hoặc URL với kích thước, mức sửa lỗi và màu nền trước/nền sau tùy chỉnh có thể cấu hình.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/qr-generate`

Chấp nhận một **JSON body** (không phải multipart). Không cần tải tệp lên.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| text | string | Yes | - | Nội dung cần mã hóa trong mã QR (1 đến 2000 ký tự) |
| size | number | No | `400` | Chiều rộng/chiều cao ảnh đầu ra tính bằng pixel (100 đến 10000) |
| errorCorrection | string | No | `"M"` | Mức sửa lỗi: `L` (7%), `M` (15%), `Q` (25%), `H` (30%) |
| foreground | string | No | `"#000000"` | Màu nền trước/mô-đun của mã QR dạng hex (`#RRGGBB`) |
| background | string | No | `"#FFFFFF"` | Màu nền của mã QR dạng hex (`#RRGGBB`) |
| logoDataUri | string | No | - | Ảnh logo dưới dạng data URI (`data:image/png;base64,...` hoặc `data:image/jpeg;base64,...`, tối đa 700 KB). Được căn giữa trên mã QR ở 22% kích thước QR. Buộc sửa lỗi thành `H` |

### Error Correction Levels {#error-correction-levels}

| Level | Recovery | Use Case |
|-------|----------|----------|
| `L` | ~7% | Mật độ dữ liệu tối đa |
| `M` | ~15% | Cân bằng (mặc định) |
| `Q` | ~25% | Tốt cho mã in |
| `H` | ~30% | Tốt nhất cho mã có logo phủ lên |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/qr-generate \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "https://snapotter.com", "size": 500, "errorCorrection": "H"}'
```

Mã QR có thương hiệu với màu tùy chỉnh:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/qr-generate \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello World", "size": 300, "foreground": "#1a365d", "background": "#f7fafc"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/qrcode.png",
  "originalSize": 0,
  "processedSize": 4520
}
```

## Notes {#notes}

- Endpoint này chấp nhận JSON, không phải multipart form data, vì không cần tải ảnh lên.
- Đầu ra luôn là ảnh PNG.
- Tên tệp đầu ra luôn là `qrcode.png`.
- `originalSize` luôn bằng 0 vì công cụ này tạo ảnh từ đầu.
- Một vùng lặng 2 mô-đun (lề) được thêm quanh mã QR.
- Độ dài văn bản tối đa là 2000 ký tự. Dung lượng thực tế phụ thuộc vào mức sửa lỗi và mã hóa ký tự.
- Các mức sửa lỗi cao hơn cho phép mã QR vẫn quét được ngay cả khi bị che một phần nhưng giảm dung lượng dữ liệu.
- Khi cung cấp `logoDataUri`, sửa lỗi tự động bị buộc thành `H` (30%) để mã QR vẫn quét được dù logo che phần giữa.
