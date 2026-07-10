---
description: "Tạo mã vạch ở các định dạng Code 128, EAN-13, UPC-A, Code 39, ITF-14 và Data Matrix."
i18n_source_hash: e84b1df40c7e
i18n_provenance: human
i18n_output_hash: bcf7285a8bf0
---

# Barcode Generator {#barcode-generator}

Tạo hình ảnh mã vạch từ văn bản đầu vào. Hỗ trợ các định dạng Code 128, EAN-13, UPC-A, Code 39, ITF-14 và Data Matrix.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/barcode-generate`

Chấp nhận một phần thân `application/json` (không phải multipart). Mã vạch được tạo từ văn bản được cung cấp, không phải từ một tệp được tải lên.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| text | string | Yes | - | Văn bản để mã hóa trong mã vạch (1-256 ký tự) |
| type | string | No | `"code128"` | Định dạng mã vạch: `code128`, `ean13`, `upca`, `code39`, `itf14`, `datamatrix` |
| scale | integer | No | `3` | Hệ số tỉ lệ hình ảnh (1-8) |
| includeText | boolean | No | `true` | Có kết xuất văn bản bên dưới mã vạch hay không |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/barcode-generate \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "5901234123457", "type": "ean13", "scale": 4}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/barcode.png",
  "originalSize": 0,
  "processedSize": 4520
}
```

## Notes {#notes}

- Khác với hầu hết các công cụ, endpoint này chấp nhận một phần thân JSON, không phải dữ liệu biểu mẫu multipart, vì mã vạch được tạo từ văn bản thay vì một tệp được tải lên.
- EAN-13 yêu cầu chính xác 12 hoặc 13 chữ số. UPC-A yêu cầu chính xác 11 hoặc 12 chữ số. Nếu bỏ qua chữ số kiểm tra, nó được tính toán tự động.
- Code 128 là định dạng linh hoạt nhất và hỗ trợ toàn bộ bộ ký tự ASCII.
- Data Matrix tạo ra một mã vạch 2D phù hợp để mã hóa các chuỗi dài hơn trong một ô vuông nhỏ gọn.
