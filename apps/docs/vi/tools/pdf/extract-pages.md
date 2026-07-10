---
description: "Trích xuất các trang đã chọn từ một PDF thành một tài liệu mới."
i18n_source_hash: e4a8fad31e0f
i18n_provenance: human
i18n_output_hash: ae2532147c89
---

# Extract Pages {#extract-pages}

Trích xuất các trang đã chọn từ một PDF thành một tài liệu mới, nhỏ hơn.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/extract-pages`

Chấp nhận dữ liệu biểu mẫu multipart với một tệp PDF và một trường JSON `settings`.

## Parameters {#parameters}

| Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả |
|-----------|------|----------|---------|-------------|
| range | string | Có | - | Phạm vi trang theo cú pháp qpdf, ví dụ `"1-5,8,10-z"` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/extract-pages \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"range": "1-5,8,10-z"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 3200000,
  "processedSize": 1100000
}
```

## Notes {#notes}

- Phạm vi trang dùng cú pháp qpdf: `1-5` cho các trang 1 đến 5, `z` cho trang cuối cùng, và dấu phẩy để kết hợp các phạm vi (ví dụ `1-3,7,10-z`).
- Các trang được trích xuất giữ nguyên định dạng, chú thích và liên kết gốc của chúng.
