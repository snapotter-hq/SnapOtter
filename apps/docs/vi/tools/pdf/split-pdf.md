---
description: "Trích xuất các trang hoặc chia một PDF thành nhiều phần."
i18n_source_hash: 5c8d8041d219
i18n_provenance: human
i18n_output_hash: 7d1c45b9ffc5
---

# Split PDF {#split-pdf}

Trích xuất một phạm vi trang thành một PDF mới, hoặc chia một tài liệu thành các khối gồm N trang.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/split-pdf`

Chấp nhận dữ liệu biểu mẫu multipart với một tệp PDF và một trường JSON `settings`.

## Parameters {#parameters}

| Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả |
|-----------|------|----------|---------|-------------|
| mode | string | Không | `"range"` | Chế độ chia: `range` hoặc `every` |
| range | string | Khi mode là `range` | - | Phạm vi trang theo cú pháp qpdf, ví dụ `"1-5,8,10-z"` |
| everyN | integer | Khi mode là `every` | - | Chia thành các khối gồm N trang (1-500) |

## Example Request {#example-request}

Trích xuất các trang cụ thể:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/split-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"mode": "range", "range": "1-5,8"}'
```

Chia thành các khối gồm 10 trang:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/split-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"mode": "every", "everyN": 10}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 980000
}
```

## Notes {#notes}

- Ở chế độ `range`, một PDF duy nhất chứa các trang đã chọn được trả về.
- Ở chế độ `every`, kết quả là một kho lưu trữ ZIP chứa các phần riêng lẻ.
- Phạm vi trang dùng cú pháp qpdf: `1-5` cho các trang 1 đến 5, `z` cho trang cuối cùng, và dấu phẩy để kết hợp các phạm vi (ví dụ `1-3,7,10-z`).
