---
description: "Mã hóa văn bản thành Base64 hoặc giải mã Base64 trở lại văn bản."
i18n_source_hash: 0e26f17348d3
i18n_provenance: machine
i18n_output_hash: 509051de1892
i18n_hash_version: 2
---

# Base64 Encode / Decode {#base64}

Dán văn bản để nhận Base64, hoặc dán Base64 để nhận lại văn bản, rồi sao chép kết quả. Văn bản chỉ được gửi đến máy chủ SnapOtter của chính bạn và không đi đâu khác.

Để chuyển một hình ảnh thành Base64, hãy dùng [Image to Base64](/vi/tools/image/image-to-base64).

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/base64`

Nhận nội dung JSON, không phải multipart form data, và trả về văn bản đã chuyển đổi thay vì một tệp để tải xuống.

## Parameters {#parameters}

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `text` | string | (bắt buộc) | Văn bản cần mã hóa, hoặc Base64 cần giải mã. Tối đa 1.000.000 ký tự. |
| `mode` | string | (bắt buộc) | `encode` hoặc `decode`. |
| `urlSafe` | boolean | `false` | Khi mã hóa, dùng bảng chữ cái an toàn cho URL (`-` và `_`) và bỏ phần đệm `=`. Bị bỏ qua khi giải mã. |

## Example Request {#example-request}

Mã hóa:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/base64 \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello, World!", "mode": "encode"}'
```

Giải mã:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/base64 \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "SGVsbG8sIFdvcmxkIQ==", "mode": "decode"}'
```

## Example Response {#example-response}

```json
{
  "mode": "encode",
  "result": "SGVsbG8sIFdvcmxkIQ=="
}
```

## Notes {#notes}

- Văn bản được mã hóa dưới dạng UTF-8, nên chữ có dấu, CJK và emoji đều được khôi phục nguyên vẹn.
- Giải mã bỏ qua khoảng trắng và ngắt dòng, nên Base64 được ngắt ở cột 76 (email, nội dung PEM) vẫn giải mã được như khi dán.
- Giải mã chấp nhận đầu vào có hoặc không có phần đệm `=`, theo bảng chữ cái chuẩn (`+`, `/`) hoặc an toàn cho URL (`-`, `_`), nhưng không được trộn cả hai.
- Đầu vào không phải Base64 sẽ thất bại với 400 và mã `ENCODED_TEXT_INVALID`. Base64 hợp lệ nhưng giải mã ra dữ liệu nhị phân (hình ảnh, ZIP) thay vì văn bản UTF-8 sẽ thất bại với `DECODED_DATA_NOT_TEXT`.
