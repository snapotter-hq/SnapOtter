---
description: "Xóa các trang cụ thể khỏi một PDF."
i18n_source_hash: 003e460a047c
i18n_provenance: human
i18n_output_hash: a25e28cee3c3
---

# Remove Pages {#remove-pages}

Xóa các trang cụ thể khỏi một PDF, giữ nguyên tất cả các trang còn lại.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/remove-pages`

Chấp nhận dữ liệu biểu mẫu multipart với một tệp PDF và một trường JSON `settings`.

## Parameters {#parameters}

| Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả |
|-----------|------|----------|---------|-------------|
| pages | string | Có | - | Phạm vi trang cần xóa theo cú pháp qpdf, ví dụ `"3,5-7"` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/remove-pages \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"pages": "3,5-7"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 1800000
}
```

## Notes {#notes}

- Bạn không thể xóa mọi trang khỏi một tài liệu; ít nhất một trang phải còn lại.
- Phạm vi trang dùng cú pháp qpdf: `3` cho một trang, `5-7` cho một phạm vi, và dấu phẩy để kết hợp (ví dụ `1,3,5-7`).
